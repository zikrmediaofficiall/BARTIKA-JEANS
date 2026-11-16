-- Admin-only profitability: managers with reports.read receive sales aggregates only.
-- Security INVOKER keeps underlying table RLS policies active.

create or replace function public.get_financial_report(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_sales_count bigint := 0;
  v_sales_total numeric := 0;
  v_paid_total numeric := 0;
  v_due_total numeric := 0;
  v_discount_total numeric := 0;
  v_cogs_total numeric := null;
  v_gross_profit numeric := null;
  v_expenses_total numeric := null;
  v_net_profit numeric := null;
  v_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if not v_admin and not public.has_permission('reports.read') then
    raise exception 'غير مصرح بعرض التقارير';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'الفترة الزمنية للتقرير غير صحيحة';
  end if;

  select
    count(*),
    coalesce(sum(s.total), 0),
    coalesce(sum(s.paid), 0),
    coalesce(sum(s.due), 0),
    coalesce(sum(s.discount_amount), 0)
  into
    v_sales_count,
    v_sales_total,
    v_paid_total,
    v_due_total,
    v_discount_total
  from public.sales s
  where s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at < p_to;

  if v_admin then
    select coalesce(sum(coalesce(cost.unit_cost_snapshot, 0) * item.quantity), 0)
      into v_cogs_total
    from public.sales sale
    join public.sale_items item on item.sale_id = sale.id
    left join public.sale_item_costs cost on cost.sale_item_id = item.id
    where sale.status = 'completed'
      and sale.created_at >= p_from
      and sale.created_at < p_to;

    select coalesce(sum(expense.amount), 0)
      into v_expenses_total
    from public.expenses expense
    where expense.created_at >= p_from
      and expense.created_at < p_to;

    v_gross_profit := v_sales_total - v_cogs_total;
    v_net_profit := v_gross_profit - v_expenses_total;
  end if;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'sales_count', v_sales_count,
    'sales_total', v_sales_total,
    'paid_total', v_paid_total,
    'due_total', v_due_total,
    'discount_total', v_discount_total,
    'is_admin', v_admin,
    'cogs_total', v_cogs_total,
    'gross_profit', v_gross_profit,
    'expenses_total', v_expenses_total,
    'net_profit', v_net_profit
  );
end;
$$;

revoke all on function public.get_financial_report(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_financial_report(timestamptz, timestamptz)
  to authenticated;
