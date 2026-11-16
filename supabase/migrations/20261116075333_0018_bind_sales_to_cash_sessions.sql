-- Bind every sale to the seller's currently-open till.
-- This prevents cash sales from being counted in the wrong or a later shift.

alter table public.sales
  add column if not exists cash_session_id uuid
  references public.cash_sessions(id) on delete restrict;

create index if not exists sales_cash_session_created_at_idx
  on public.sales (cash_session_id, created_at);

create or replace function public.attach_sale_to_open_cash_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if new.cash_session_id is null then
    select id
      into v_session_id
    from public.cash_sessions
    where seller_id = new.seller_id
      and status = 'open'
    for update;
  else
    select id
      into v_session_id
    from public.cash_sessions
    where id = new.cash_session_id
      and seller_id = new.seller_id
      and status = 'open'
    for update;
  end if;

  if v_session_id is null then
    raise exception 'يجب فتح وردية نقدية قبل إصدار فاتورة البيع';
  end if;

  new.cash_session_id := v_session_id;
  return new;
end;
$$;

revoke all on function public.attach_sale_to_open_cash_session() from public, anon, authenticated;

drop trigger if exists sales_attach_open_cash_session on public.sales;
create trigger sales_attach_open_cash_session
before insert on public.sales
for each row execute function public.attach_sale_to_open_cash_session();

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

  -- Sales are tied to the exact session by the BEFORE INSERT trigger.
  -- This is safer than estimating a till's sales by seller/time ranges.
  select coalesce(sum(payment.amount), 0)
    into v_cash_sales
  from public.payments payment
  join public.sales sale on sale.id = payment.sale_id
  where sale.cash_session_id = p_session_id
    and sale.status = 'completed'
    and payment.method = 'cash';

  select coalesce(sum(expense.amount), 0)
    into v_cash_expenses
  from public.expenses expense
  where expense.cash_session_id = p_session_id
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

revoke all on function public.close_cash_session(uuid, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric) to authenticated;
