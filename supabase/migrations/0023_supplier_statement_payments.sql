-- Supplier payment ledger and statement balances.
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  reference text,
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (payment_method = 'cash' or cash_session_id is null)
);

create index if not exists supplier_payments_supplier_created_idx
  on public.supplier_payments(supplier_id, created_at desc);
create index if not exists supplier_payments_invoice_created_idx
  on public.supplier_payments(purchase_invoice_id, created_at desc);
create index if not exists supplier_payments_cash_session_idx
  on public.supplier_payments(cash_session_id, created_at)
  where cash_session_id is not null;

alter table public.supplier_payments enable row level security;
revoke all on public.supplier_payments from anon, authenticated;
grant select, insert on public.supplier_payments to authenticated;

drop policy if exists "supplier payments admin only" on public.supplier_payments;
create policy "supplier payments admin only"
  on public.supplier_payments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.record_supplier_payment(
  p_purchase_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text,
  p_cash_session_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invoice public.purchase_invoices%rowtype;
  v_existing public.supplier_payments%rowtype;
  v_payment_id uuid;
  v_new_paid numeric(12,2);
  v_new_due numeric(12,2);
begin
  if v_user is null or not public.is_admin() then
    raise exception 'سداد الموردين متاح للأدمن فقط';
  end if;

  if p_idempotency_key is null then
    raise exception 'معرّف السداد غير صالح';
  end if;

  select *
    into v_existing
  from public.supplier_payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.purchase_invoice_id <> p_purchase_invoice_id
       or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_method then
      raise exception 'تم استخدام معرّف السداد نفسه ببيانات مختلفة';
    end if;

    select paid, due
      into v_new_paid, v_new_due
    from public.purchase_invoices
    where id = p_purchase_invoice_id;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_new_paid,
      'due', v_new_due,
      'duplicate', true
    );
  end if;

  select *
    into v_invoice
  from public.purchase_invoices
  where id = p_purchase_invoice_id
  for update;

  if not found or v_invoice.status <> 'received' then
    raise exception 'فاتورة الشراء غير موجودة أو لم يتم استلامها';
  end if;

  -- Recheck after locking the invoice for concurrent retries.
  select *
    into v_existing
  from public.supplier_payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.purchase_invoice_id <> p_purchase_invoice_id
       or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_method then
      raise exception 'تم استخدام معرّف السداد نفسه ببيانات مختلفة';
    end if;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_invoice.paid,
      'due', v_invoice.due,
      'duplicate', true
    );
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > v_invoice.due then
    raise exception 'قيمة السداد أكبر من المستحق أو غير صحيحة';
  end if;

  if p_method not in ('cash', 'instapay', 'visa') then
    raise exception 'وسيلة السداد غير صحيحة';
  end if;

  if p_method <> 'cash' then
    if p_cash_session_id is not null then
      raise exception 'لا يمكن ربط وسيلة غير نقدية بدرج الكاش';
    end if;
    if length(trim(coalesce(p_reference, ''))) < 3 then
      raise exception 'مرجع التحويل أو الفيزا مطلوب';
    end if;
  elsif p_cash_session_id is not null then
    perform 1
    from public.cash_sessions
    where id = p_cash_session_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'اختر وردية نقدية مفتوحة أو اترك السداد من الخزينة المركزية';
    end if;
  end if;

  v_new_paid := v_invoice.paid + p_amount;
  v_new_due := v_invoice.due - p_amount;

  update public.purchase_invoices
  set paid = v_new_paid,
      due = v_new_due
  where id = p_purchase_invoice_id;

  insert into public.supplier_payments(
    supplier_id,
    purchase_invoice_id,
    amount,
    payment_method,
    reference,
    cash_session_id,
    idempotency_key,
    created_by
  )
  values (
    v_invoice.supplier_id,
    p_purchase_invoice_id,
    p_amount,
    p_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    p_cash_session_id,
    p_idempotency_key,
    v_user
  )
  returning id into v_payment_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'record_supplier_payment',
    'purchase_invoice',
    p_purchase_invoice_id,
    jsonb_build_object(
      'supplier_id', v_invoice.supplier_id,
      'payment_id', v_payment_id,
      'amount', p_amount,
      'method', p_method,
      'cash_session_id', p_cash_session_id,
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

revoke all on function public.record_supplier_payment(
  uuid, numeric, public.payment_method, text, uuid, uuid
) from public, anon;
grant execute on function public.record_supplier_payment(
  uuid, numeric, public.payment_method, text, uuid, uuid
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
  v_supplier_payments numeric := 0;
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

  select coalesce(sum(payment.amount), 0)
    into v_supplier_payments
  from public.supplier_payments payment
  where payment.cash_session_id = p_session_id
    and payment.payment_method = 'cash';

  v_expected_cash :=
    v_session.opening_cash
    + v_cash_sales
    + v_exchange_collections
    - v_cash_expenses
    - v_exchange_refunds
    - v_supplier_payments;

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
      'supplier_payments', v_supplier_payments,
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
    'supplier_payments', v_supplier_payments,
    'variance', p_counted_cash - v_expected_cash
  );
end;
$$;



revoke all on function public.close_cash_session(uuid, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric) to authenticated;
