-- Expire unpaid online reservations after 24 hours and release their stock.
alter table public.online_orders
  add column if not exists expires_at timestamptz;

update public.online_orders
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.online_orders
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

create index if not exists online_orders_expiry_idx
  on public.online_orders(status, expires_at)
  where paid <= 0.009 and status in ('pending','confirmed');

create or replace function public.expire_stale_online_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_expired integer := 0;
begin
  for v_order in
    select id, order_number
    from public.online_orders
    where status in ('pending','confirmed')
      and paid <= 0.009
      and expires_at <= now()
    order by id
    for update skip locked
  loop
    for v_item in
      select variant_id, sum(quantity)::integer as quantity
      from public.online_order_items
      where order_id = v_order.id
      group by variant_id
      order by variant_id
    loop
      update public.inventory
      set reserved_quantity = reserved_quantity - v_item.quantity,
          updated_at = now()
      where variant_id = v_item.variant_id
        and reserved_quantity >= v_item.quantity;

      if not found then
        raise exception
          'تعذر تحرير حجز الطلب رقم %؛ رصيد الحجز غير متطابق للصنف %',
          v_order.order_number,
          v_item.variant_id;
      end if;
    end loop;

    update public.online_orders
    set status = 'cancelled',
        updated_at = now()
    where id = v_order.id;

    insert into public.audit_logs(
      actor_id, action, entity_type, entity_id, details
    )
    values (
      null,
      'expire_online_order_reservation',
      'online_order',
      v_order.id,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'reason', 'unpaid_reservation_expired_after_24_hours'
      )
    );

    v_expired := v_expired + 1;
  end loop;

  return v_expired;
end;
$$;

revoke all on function public.expire_stale_online_orders() from public,anon,authenticated;

-- The public catalog performs lazy cleanup before showing availability. This
-- keeps the cleanup automatic without a scheduled job or paid cron service.
create or replace function public.get_public_catalog()
returns table (
  product_id uuid,
  product_name text,
  category text,
  sale_price numeric,
  image_url text,
  variant_id uuid,
  size text,
  color text,
  available_quantity integer
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.expire_stale_online_orders();

  return query
  select
    p.id,
    p.name,
    p.category,
    p.sale_price,
    p.image_url,
    v.id,
    v.size,
    v.color,
    least(5, greatest(0, coalesce(i.quantity,0) - coalesce(i.reserved_quantity,0)))
  from public.products p
  join public.product_variants v on v.product_id = p.id
  left join public.inventory i on i.variant_id = v.id
  where p.is_active = true
    and greatest(0, coalesce(i.quantity,0) - coalesce(i.reserved_quantity,0)) > 0
  order by p.created_at desc, p.name, v.size, v.color;
end;
$$;

revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon,authenticated;
