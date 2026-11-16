create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.cash_sessions%rowtype;
  v_closed_at timestamptz := now();
  v_cash_sales numeric := 0;
  v_cash_expenses numeric := 0;
  v_exchange_collections numeric := 0;
  v_exchange_refunds numeric := 0;
  v_supplier_payments numeric := 0;
  v_online_order_collections numeric := 0;
  v_online_order_refunds numeric := 0;
  v_expected_cash numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  -- SECURITY DEFINER bypasses RLS; also reject sessions from disabled accounts.
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ) then
    raise exception 'الحساب غير مفعل';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'النقدية الفعلية غير صحيحة';
  end if;

  select * into v_session
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
      or (payment.cash_session_id is null and sale.cash_session_id = p_session_id)
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

  select coalesce(sum(payment.amount), 0)
    into v_online_order_collections
  from public.online_order_payments payment
  where payment.cash_session_id = p_session_id
    and payment.payment_method = 'cash';

  select coalesce(sum(refund.amount), 0)
    into v_online_order_refunds
  from public.online_order_refunds refund
  where refund.cash_session_id = p_session_id
    and refund.payment_method = 'cash';

  v_expected_cash :=
    v_session.opening_cash
    + v_cash_sales
    + v_exchange_collections
    + v_online_order_collections
    - v_cash_expenses
    - v_exchange_refunds
    - v_supplier_payments
    - v_online_order_refunds;

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
      'online_order_collections', v_online_order_collections,
      'online_order_refunds', v_online_order_refunds,
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
    'online_order_collections', v_online_order_collections,
    'online_order_refunds', v_online_order_refunds,
    'variance', p_counted_cash - v_expected_cash
  );
end;
$function$;

revoke all on function public.close_cash_session(uuid, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric) to authenticated;
