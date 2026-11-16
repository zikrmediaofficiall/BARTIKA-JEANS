-- Serialize public order creation by normalized phone before applying the per-hour limit.
create or replace function public.create_online_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_method text,
  p_delivery_address text,
  p_customer_notes text,
  p_items jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric(12,2) := 0;
  v_item record;
  v_product record;
  v_quantity integer;
  v_available integer;
  v_line_total numeric(12,2);
  v_phone text := regexp_replace(trim(coalesce(p_customer_phone,'')), '[^0-9+]', '', 'g');
  v_recent_orders integer := 0;
begin
  if p_idempotency_key is null then
    raise exception 'معرّف الطلب غير صالح';
  end if;

  select id, order_number into v_order_id, v_order_number
  from public.online_orders
  where idempotency_key = p_idempotency_key;

  if v_order_id is not null then
    return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'duplicate',true);
  end if;

  if length(trim(coalesce(p_customer_name,''))) not between 2 and 160 then
    raise exception 'أدخل اسمًا صحيحًا';
  end if;
  if length(v_phone) not between 8 and 16 then
    raise exception 'أدخل رقم هاتف صحيحًا';
  end if;

  -- Serialize requests by normalized phone so parallel submissions cannot bypass the throttle.
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  -- Basic abuse guard: limit repeat public order requests for the same phone.
  select count(*)::integer
    into v_recent_orders
  from public.online_orders
  where regexp_replace(customer_phone, '[^0-9+]', '', 'g') = v_phone
    and created_at > now() - interval '1 hour';

  if v_recent_orders >= 3 then
    raise exception 'تم استلام عدة طلبات من هذا الرقم مؤخرًا. حاول مرة أخرى لاحقًا أو تواصل مع المتجر.';
  end if;
  if p_delivery_method not in ('delivery','pickup') then
    raise exception 'طريقة الاستلام غير صحيحة';
  end if;
  if p_delivery_method = 'delivery'
     and length(trim(coalesce(p_delivery_address,''))) < 5 then
    raise exception 'عنوان التوصيل مطلوب';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'الطلب يجب أن يحتوي من 1 إلى 20 صنفًا';
  end if;

  -- Lock inventory in deterministic order before checking stock.
  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry(value)
    group by (entry.value->>'variant_id')::uuid
    order by (entry.value->>'variant_id')::uuid
  loop
    if v_item.quantity <= 0 or v_item.quantity > 10 then
      raise exception 'كمية الصنف غير صحيحة';
    end if;
    perform 1 from public.inventory
    where variant_id = v_item.variant_id
    for update;
    if not found then
      raise exception 'الصنف غير متاح حاليًا';
    end if;
  end loop;

  -- Retry after locks: do not reserve twice.
  select id, order_number into v_order_id, v_order_number
  from public.online_orders
  where idempotency_key = p_idempotency_key;
  if v_order_id is not null then
    return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'duplicate',true);
  end if;

  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry(value)
    group by (entry.value->>'variant_id')::uuid
    order by (entry.value->>'variant_id')::uuid
  loop
    select i.quantity - i.reserved_quantity
      into v_available
    from public.inventory i
    where i.variant_id = v_item.variant_id;

    if coalesce(v_available,0) < v_item.quantity then
      raise exception 'الكمية المطلوبة غير متاحة حاليًا';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;
    select p.id,p.name,p.sale_price,p.image_url,v.id,v.size,v.color
      into v_product
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'أحد الأصناف لم يعد متاحًا';
    end if;

    v_line_total := round(v_product.sale_price * v_quantity,2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  insert into public.online_orders(
    customer_name,customer_phone,delivery_method,delivery_address,
    customer_notes,subtotal,idempotency_key
  )
  values (
    trim(p_customer_name),
    v_phone,
    p_delivery_method,
    nullif(trim(coalesce(p_delivery_address,'')),''),
    nullif(trim(coalesce(p_customer_notes,'')),''),
    v_subtotal,
    p_idempotency_key
  )
  returning id,order_number into v_order_id,v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;
    select p.name,p.sale_price,p.image_url,v.size,v.color
      into v_product
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

    v_line_total := round(v_product.sale_price * v_quantity,2);

    insert into public.online_order_items(
      order_id,variant_id,product_name_snapshot,size_snapshot,color_snapshot,
      image_url_snapshot,quantity,unit_price,line_total
    )
    values (
      v_order_id,(v_item.value->>'variant_id')::uuid,v_product.name,
      v_product.size,v_product.color,v_product.image_url,v_quantity,
      v_product.sale_price,v_line_total
    );

    update public.inventory
    set reserved_quantity = reserved_quantity + v_quantity,
        updated_at = now()
    where variant_id = (v_item.value->>'variant_id')::uuid;
  end loop;

  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'duplicate',false);
end;
$$;

revoke all on function public.create_online_order(text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.create_online_order(text,text,text,text,text,jsonb,uuid) to anon, authenticated;
