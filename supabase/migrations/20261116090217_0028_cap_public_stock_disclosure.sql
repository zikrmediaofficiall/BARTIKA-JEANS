-- Limit public stock disclosure to an availability hint (0-5), not the actual stock count.
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
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.category,
    p.sale_price,
    p.image_url,
    v.id,
    v.size,
    v.color,
    least(5, greatest(0, coalesce(i.quantity, 0) - coalesce(i.reserved_quantity, 0)))
  from public.products p
  join public.product_variants v on v.product_id = p.id
  left join public.inventory i on i.variant_id = v.id
  where p.is_active = true
    and greatest(0, coalesce(i.quantity, 0) - coalesce(i.reserved_quantity, 0)) > 0
  order by p.created_at desc, p.name, v.size, v.color;
$$;

revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;
