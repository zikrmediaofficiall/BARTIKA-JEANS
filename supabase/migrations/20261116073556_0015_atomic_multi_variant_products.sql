-- Create one product and all of its size/color variants atomically.
-- Every variant receives its own barcode and opening inventory row.

create or replace function public.add_product_with_variants(
  p_name text,
  p_sku text,
  p_category text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_variants jsonb
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
  v_size text;
  v_color text;
  v_qty integer;
  v_item jsonb;
  v_variants jsonb := '[]'::jsonb;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'إضافة المنتجات للأدمن فقط';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2
     or length(trim(coalesce(p_sku, ''))) < 2
     or p_cost_price is null or p_cost_price < 0
     or p_sale_price is null or p_sale_price <= 0 then
    raise exception 'بيانات المنتج أو السعر أو التكلفة غير صحيحة';
  end if;

  if jsonb_typeof(p_variants) is distinct from 'array' then
    raise exception 'يجب إضافة متغير واحد على الأقل';
  end if;

  v_count := jsonb_array_length(p_variants);
  if v_count < 1 or v_count > 100 then
    raise exception 'عدد المتغيرات يجب أن يكون بين 1 و100';
  end if;

  -- Validate the entire payload before creating the parent product.
  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'بيانات أحد المتغيرات غير صحيحة';
    end if;

    v_barcode := nullif(trim(coalesce(v_item->>'barcode', '')), '');
    v_size := nullif(trim(coalesce(v_item->>'size', '')), '');
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    v_qty := coalesce(nullif(v_item->>'opening_quantity', '')::integer, 0);

    if v_qty < 0 then
      raise exception 'الكمية الافتتاحية لا يمكن أن تكون سالبة';
    end if;

    if v_barcode is not null and length(v_barcode) > 64 then
      raise exception 'الباركود أطول من الحد المسموح';
    end if;

    if v_size is not null and length(v_size) > 40 then
      raise exception 'اسم المقاس أطول من الحد المسموح';
    end if;

    if v_color is not null and length(v_color) > 60 then
      raise exception 'اسم اللون أطول من الحد المسموح';
    end if;
  end loop;

  if exists (
    select 1
    from (
      select nullif(trim(coalesce(value->>'barcode', '')), '') as barcode,
             count(*) as barcode_count
      from jsonb_array_elements(p_variants)
      group by nullif(trim(coalesce(value->>'barcode', '')), '')
    ) duplicate_barcodes
    where barcode is not null and barcode_count > 1
  ) then
    raise exception 'لا يمكن تكرار نفس الباركود داخل المنتج';
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

  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    v_barcode := nullif(trim(coalesce(v_item->>'barcode', '')), '');
    v_size := nullif(trim(coalesce(v_item->>'size', '')), '');
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    v_qty := coalesce(nullif(v_item->>'opening_quantity', '')::integer, 0);

    if v_barcode is null then
      v_barcode := 'BJK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    end if;

    insert into public.product_variants(product_id, barcode, size, color)
    values (v_product_id, v_barcode, v_size, v_color)
    returning id into v_variant_id;

    insert into public.inventory(variant_id, quantity)
    values (v_variant_id, v_qty);

    if v_qty > 0 then
      insert into public.stock_movements(
        variant_id, movement_type, quantity_delta, reason, actor_id
      )
      values (
        v_variant_id,
        'opening',
        v_qty,
        'رصيد افتتاحي مع إنشاء المنتج',
        auth.uid()
      );
    end if;

    v_variants := v_variants || jsonb_build_array(
      jsonb_build_object(
        'variant_id', v_variant_id,
        'barcode', v_barcode,
        'size', v_size,
        'color', v_color,
        'opening_quantity', v_qty
      )
    );
  end loop;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'add_product_with_variants',
    'product',
    v_product_id,
    jsonb_build_object(
      'variants', v_variants,
      'variant_count', v_count,
      'cost_price', p_cost_price,
      'sale_price', p_sale_price
    )
  );

  return jsonb_build_object(
    'product_id', v_product_id,
    'variants', v_variants
  );
end;
$$;

revoke all on function public.add_product_with_variants(text, text, text, numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.add_product_with_variants(text, text, text, numeric, numeric, jsonb)
  to authenticated;
