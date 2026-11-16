-- Atomic Admin product creation, including variant, opening stock and audit trail.

create or replace function public.add_product_with_variant(
  p_name text,
  p_sku text,
  p_category text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_barcode text default null,
  p_size text default null,
  p_color text default null,
  p_opening_quantity integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_barcode text;
begin
  if not public.is_admin() then
    raise exception 'إضافة المنتجات للأدمن فقط';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2
     or length(trim(coalesce(p_sku, ''))) < 2
     or p_cost_price is null or p_cost_price < 0
     or p_sale_price is null or p_sale_price <= 0
     or p_opening_quantity is null or p_opening_quantity < 0 then
    raise exception 'بيانات المنتج أو السعر أو المخزون غير صحيحة';
  end if;

  v_barcode := nullif(trim(coalesce(p_barcode, '')), '');
  if v_barcode is null then
    v_barcode := 'BJK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  end if;

  insert into public.products(name, sku, category, sale_price, is_active)
  values (
    trim(p_name),
    trim(p_sku),
    coalesce(nullif(trim(p_category), ''), 'جينز'),
    p_sale_price,
    true
  )
  returning id into v_product_id;

  insert into public.product_costs(product_id, cost_price)
  values (v_product_id, p_cost_price);

  insert into public.product_variants(product_id, barcode, size, color)
  values (
    v_product_id,
    v_barcode,
    nullif(trim(coalesce(p_size, '')), ''),
    nullif(trim(coalesce(p_color, '')), '')
  )
  returning id into v_variant_id;

  insert into public.inventory(variant_id, quantity)
  values (v_variant_id, p_opening_quantity);

  if p_opening_quantity > 0 then
    insert into public.stock_movements(
      variant_id, movement_type, quantity_delta, reason, actor_id
    )
    values (
      v_variant_id,
      'opening',
      p_opening_quantity,
      'رصيد افتتاحي مع إنشاء المنتج',
      auth.uid()
    );
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'add_product_with_variant',
    'product',
    v_product_id,
    jsonb_build_object(
      'variant_id', v_variant_id,
      'barcode', v_barcode,
      'opening_quantity', p_opening_quantity,
      'cost_price', p_cost_price,
      'sale_price', p_sale_price
    )
  );

  return jsonb_build_object(
    'product_id', v_product_id,
    'variant_id', v_variant_id,
    'barcode', v_barcode
  );
end;
$$;

revoke all on function public.add_product_with_variant(text, text, text, numeric, numeric, text, text, text, integer) from public;
grant execute on function public.add_product_with_variant(text, text, text, numeric, numeric, text, text, text, integer) to authenticated;
