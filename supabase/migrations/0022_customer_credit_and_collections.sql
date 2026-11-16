-- Customer profiles, controlled credit accounts and idempotent collections.

alter table public.customers
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists customers_name_created_at_idx
  on public.customers(name, created_at desc);

create table if not exists public.customer_credit_accounts (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.customer_credit_accounts enable row level security;
revoke all on public.customer_credit_accounts from anon, authenticated;
grant select, insert, update on public.customer_credit_accounts to authenticated;

drop policy if exists "customer credit admin only" on public.customer_credit_accounts;
create policy "customer credit admin only"
  on public.customer_credit_accounts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter table public.payments
  add column if not exists cash_session_id uuid
    references public.cash_sessions(id) on delete restrict,
  add column if not exists idempotency_key uuid;

create unique index if not exists payments_idempotency_key_uidx
  on public.payments(idempotency_key)
  where idempotency_key is not null;

create index if not exists payments_cash_session_method_idx
  on public.payments(cash_session_id, method)
  where cash_session_id is not null;

-- Legacy cash receipts are attributed to the till already linked to their sale.
update public.payments payment
set cash_session_id = sale.cash_session_id
from public.sales sale
where payment.sale_id = sale.id
  and payment.method = 'cash'
  and payment.cash_session_id is null
  and sale.cash_session_id is not null;

-- Prevent concurrent credit sales from exceeding the customer's configured limit.
create or replace function public.enforce_customer_credit_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_limit numeric(12,2) := 0;
  v_existing_due numeric(12,2) := 0;
begin
  if coalesce(new.due, 0) <= 0 then
    return new;
  end if;

  if new.customer_id is null then
    raise exception 'البيع الآجل يتطلب ملف عميل مسجل';
  end if;

  insert into public.customer_credit_accounts(customer_id)
  values (new.customer_id)
  on conflict(customer_id) do nothing;

  select credit_limit
    into v_credit_limit
  from public.customer_credit_accounts
  where customer_id = new.customer_id
  for update;

  select coalesce(sum(due), 0)
    into v_existing_due
  from public.sales
  where customer_id = new.customer_id
    and status = 'completed';

  if v_existing_due + new.due > coalesce(v_credit_limit, 0) then
    raise exception
      'تجاوز البيع الآجل حد ائتمان العميل. المتاح: % ج.م، المطلوب: % ج.م',
      greatest(0, coalesce(v_credit_limit, 0) - v_existing_due),
      new.due;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_customer_credit_limit() from public, anon, authenticated;

drop trigger if exists sales_enforce_customer_credit_limit on public.sales;
create trigger sales_enforce_customer_credit_limit
before insert on public.sales
for each row
execute function public.enforce_customer_credit_limit();

-- Collect due balances later; retries with the same key do not double-collect.
create or replace function public.collect_sale_due(
  p_sale_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_existing public.payments%rowtype;
  v_cash_session_id uuid;
  v_new_paid numeric(12,2);
  v_new_due numeric(12,2);
  v_payment_id uuid;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select role::text
    into v_role
  from public.profiles
  where id = v_user and is_active = true;

  if v_role is null or v_role not in ('admin', 'seller') then
    raise exception 'تحصيل أرصدة العملاء متاح للأدمن والبائعين فقط';
  end if;

  if p_idempotency_key is null then
    raise exception 'معرّف التحصيل غير صالح';
  end if;

  select *
    into v_existing
  from public.payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.sale_id <> p_sale_id
       or v_existing.amount <> p_amount
       or v_existing.method <> p_method then
      raise exception 'تم استخدام معرّف التحصيل نفسه ببيانات مختلفة';
    end if;

    select paid, due
      into v_new_paid, v_new_due
    from public.sales
    where id = p_sale_id;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_new_paid,
      'due', v_new_due,
      'duplicate', true
    );
  end if;

  select *
    into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found or v_sale.status <> 'completed' then
    raise exception 'الفاتورة غير موجودة أو ملغاة';
  end if;

  -- Recheck after locking the sale so concurrent retries return the same payment.
  select *
    into v_existing
  from public.payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.sale_id <> p_sale_id
       or v_existing.amount <> p_amount
       or v_existing.method <> p_method then
      raise exception 'تم استخدام معرّف التحصيل نفسه ببيانات مختلفة';
    end if;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_sale.paid,
      'due', v_sale.due,
      'duplicate', true
    );
  end if;

  if v_role = 'seller' and v_sale.seller_id <> v_user then
    raise exception 'لا يمكنك تحصيل فاتورة بائع آخر';
  end if;

  if v_sale.customer_id is null or v_sale.due <= 0 then
    raise exception 'لا يوجد رصيد مستحق على هذه الفاتورة';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > v_sale.due then
    raise exception 'مبلغ التحصيل أكبر من الرصيد المتبقي أو غير صالح';
  end if;

  if p_method not in ('cash', 'instapay', 'visa') then
    raise exception 'وسيلة التحصيل غير صحيحة';
  end if;

  if p_method <> 'cash'
     and length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'أدخل مرجع التحويل أو الفيزا قبل اعتماد التحصيل';
  end if;

  if p_method = 'cash' then
    select id
      into v_cash_session_id
    from public.cash_sessions
    where seller_id = v_user
      and status = 'open'
    for update;

    if v_cash_session_id is null then
      raise exception 'افتح وردية نقدية قبل تحصيل المبلغ نقدًا';
    end if;
  end if;

  v_new_paid := v_sale.paid + p_amount;
  v_new_due := v_sale.due - p_amount;

  update public.sales
  set paid = v_new_paid,
      due = v_new_due
  where id = p_sale_id;

  insert into public.payments(
    sale_id, method, amount, reference, cash_session_id, idempotency_key
  )
  values (
    p_sale_id,
    p_method,
    p_amount,
    nullif(trim(coalesce(p_reference, '')), ''),
    v_cash_session_id,
    p_idempotency_key
  )
  returning id into v_payment_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'collect_sale_due',
    'sale',
    p_sale_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'method', p_method,
      'cash_session_id', v_cash_session_id,
      'paid_after', v_new_paid,
      'due_after', v_new_due
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'paid', v_new_paid,
    'due', v_new_due,
    'duplicate', false
  );
end;
$$;

revoke all on function public.collect_sale_due(
  uuid, numeric, public.payment_method, text, uuid
) from public, anon;
grant execute on function public.collect_sale_due(
  uuid, numeric, public.payment_method, text, uuid
) to authenticated;

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_closed_at timestamptz := now();
  v_cash_sales numeric := 0;
  v_cash_expenses numeric := 0;
  v_exchange_collections numeric := 0;
  v_exchange_refunds numeric := 0;
  v_expected_cash numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'النقدية الفعلية غير صحيحة';
  end if;

  select *
    into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'الوردية غير موجودة';
  end if;

  if v_session.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'غير مصرح بإغلاق هذه الوردية';
  end if;

  if v_session.status <> 'open' then
    raise exception 'الوردية مغلقة بالفعل';
  end if;

  select coalesce(sum(payment.amount), 0)
    into v_cash_sales
  from public.payments payment
  join public.sales sale on sale.id = payment.sale_id
  where (
      payment.cash_session_id = p_session_id
      or (
        payment.cash_session_id is null
        and sale.cash_session_id = p_session_id
      )
    )
    and sale.status = 'completed'
    and payment.method = 'cash';

  select coalesce(sum(expense.amount), 0)
    into v_cash_expenses
  from public.expenses expense
  where expense.cash_session_id = p_session_id
    and expense.payment_method = 'cash';

  select
    coalesce(sum(settlement.amount) filter (where settlement.direction = 'collect'), 0),
    coalesce(sum(settlement.amount) filter (where settlement.direction = 'refund'), 0)
    into v_exchange_collections, v_exchange_refunds
  from public.exchange_settlements settlement
  where settlement.cash_session_id = p_session_id
    and settlement.payment_method = 'cash';

  v_expected_cash :=
    v_session.opening_cash
    + v_cash_sales
    + v_exchange_collections
    - v_cash_expenses
    - v_exchange_refunds;

  update public.cash_sessions
  set expected_cash = v_expected_cash,
      counted_cash = p_counted_cash,
      variance = p_counted_cash - v_expected_cash,
      status = 'closed',
      closed_at = v_closed_at
  where id = p_session_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'close_cash_session',
    'cash_session',
    p_session_id,
    jsonb_build_object(
      'expected', v_expected_cash,
      'counted', p_counted_cash,
      'cash_sales', v_cash_sales,
      'cash_expenses', v_cash_expenses,
      'exchange_collections', v_exchange_collections,
      'exchange_refunds', v_exchange_refunds,
      'variance', p_counted_cash - v_expected_cash
    )
  );

  return jsonb_build_object(
    'expected', v_expected_cash,
    'counted', p_counted_cash,
    'cash_sales', v_cash_sales,
    'cash_expenses', v_cash_expenses,
    'exchange_collections', v_exchange_collections,
    'exchange_refunds', v_exchange_refunds,
    'variance', p_counted_cash - v_expected_cash
  );
end;
$$;


revoke all on function public.close_cash_session(uuid, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric) to authenticated;
