-- POS catalog must show only stock that is not reserved for online orders.
create or replace view public.seller_catalog as
select
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.category,
  p.sale_price,
  v.id as variant_id,
  v.barcode,
  v.size,
  v.color,
  greatest(0, coalesce(i.quantity, 0) - coalesce(i.reserved_quantity, 0)) as stock
from public.products p
join public.product_variants v on v.product_id = p.id
left join public.inventory i on i.variant_id = v.id
where p.is_active = true;
