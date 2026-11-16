-- Attribute cash expenses to one seller drawer or the central store cash box.
-- Unassigned expenses belong to the central cash box and are not deducted from every seller drawer.

alter table public.expenses
  add column if not exists cash_session_id uuid
  references public.cash_sessions(id) on delete set null;

create index if not exists expenses_cash_session_id_created_at_idx
  on public.expenses (cash_session_id, created_at)
  where cash_session_id is not null;

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
  where sale.seller_id = v_session.seller_id
    and sale.created_at >= v_session.opened_at
    and sale.created_at <= v_closed_at
    and sale.status = 'completed'
    and payment.method = 'cash';

  -- Only expenses explicitly assigned to this till affect its closing balance.
  -- Central store expenses (cash_session_id IS NULL) are deliberately excluded.
  select coalesce(sum(expense.amount), 0)
    into v_cash_expenses
  from public.expenses expense
  where expense.cash_session_id = p_session_id
    and expense.created_at >= v_session.opened_at
    and expense.created_at <= v_closed_at
    and expense.payment_method = 'cash';

  v_expected_cash := v_session.opening_cash + v_cash_sales - v_cash_expenses;

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
      'variance', p_counted_cash - v_expected_cash
    )
  );

  return jsonb_build_object(
    'expected', v_expected_cash,
    'counted', p_counted_cash,
    'cash_sales', v_cash_sales,
    'cash_expenses', v_cash_expenses,
    'variance', p_counted_cash - v_expected_cash
  );
end;
$$;

create or replace function public.add_expense(
  p_category text,
  p_description text,
  p_amount numeric,
  p_method public.payment_method,
  p_cash_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session_seller uuid;
begin
  if not public.is_admin() then
    raise exception 'المصروفات للأدمن فقط';
  end if;

  if p_amount is null or p_amount <= 0
     or nullif(trim(coalesce(p_category, '')), '') is null
     or nullif(trim(coalesce(p_description, '')), '') is null
     or p_method is null then
    raise exception 'بيانات المصروف غير صحيحة';
  end if;

  if p_cash_session_id is not null then
    if p_method <> 'cash' then
      raise exception 'لا يمكن ربط مصروف غير نقدي بدرج الكاش';
    end if;

    select seller_id
      into v_session_seller
    from public.cash_sessions
    where id = p_cash_session_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'اختر وردية نقدية مفتوحة وصحيحة';
    end if;
  end if;

  insert into public.expenses(
    category, description, amount, payment_method, created_by, cash_session_id
  )
  values (
    trim(p_category), trim(p_description), p_amount, p_method, auth.uid(), p_cash_session_id
  )
  returning id into v_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'add_expense',
    'expense',
    v_id,
    jsonb_build_object(
      'amount', p_amount,
      'method', p_method,
      'cash_session_id', p_cash_session_id,
      'cash_box', case when p_cash_session_id is null then 'central' else 'seller_session' end
    )
  );

  return v_id;
end;
$$;

-- Preserve compatibility for old internal callers while assigning them to the central cash box.
create or replace function public.add_expense(
  p_category text,
  p_description text,
  p_amount numeric,
  p_method public.payment_method
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.add_expense(
    p_category,
    p_description,
    p_amount,
    p_method,
    null::uuid
  );
end;
$$;

revoke all on function public.close_cash_session(uuid, numeric) from public;
revoke all on function public.add_expense(text, text, numeric, public.payment_method, uuid) from public;
revoke all on function public.add_expense(text, text, numeric, public.payment_method) from public;

grant execute on function public.close_cash_session(uuid, numeric) to authenticated;
grant execute on function public.add_expense(text, text, numeric, public.payment_method, uuid) to authenticated;
grant execute on function public.add_expense(text, text, numeric, public.payment_method) to authenticated;
