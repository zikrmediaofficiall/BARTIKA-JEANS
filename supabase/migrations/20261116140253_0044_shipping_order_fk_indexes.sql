-- Cover shipping foreign keys used by order administration and carrier lookups.
create index if not exists online_orders_shipping_company_id_idx
  on public.online_orders(shipping_company_id)
  where shipping_company_id is not null;

create index if not exists online_orders_shipping_zone_id_idx
  on public.online_orders(shipping_zone_id)
  where shipping_zone_id is not null;
