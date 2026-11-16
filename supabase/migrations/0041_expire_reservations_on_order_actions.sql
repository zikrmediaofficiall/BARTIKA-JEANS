-- Expire unpaid reservations before public order creation and before Admin status changes.
CREATE OR REPLACE FUNCTION public.create_online_order(p_customer_name text, p_customer_phone text, p_delivery_method text, p_delivery_address text, p_customer_notes text, p_items jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Serialize same idempotency keys before checking for an existing order.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 1));

  select id, order_number
    into v_order_id, v_order_number
  from public.online_orders
  where idempotency_key = p_idempotency_key;

  if v_order_id is not null then
    return jsonb_build_object(
      'id', v_order_id,
      'order_number', v_order_number,
      'duplicate', true
    );
  end if;

  if length(trim(coalesce(p_customer_name,''))) not between 2 and 160 then
    raise exception 'أدخل اسمًا صحيحًا';
  end if;
  if length(v_phone) not between 8 and 16 then
    raise exception 'أدخل رقم هاتف صحيحًا';
  end if;

  -- Serialize orders for the same normalized phone so parallel requests cannot
  -- bypass the per-hour limit.
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  -- Release stale fully unpaid reservations before checking available inventory.
  perform public.expire_stale_online_orders();

  -- Recheck idempotency after all advisory locks.
  select id, order_number
    into v_order_id, v_order_number
  from public.online_orders
  where idempotency_key = p_idempotency_key;

  if v_order_id is not null then
    return jsonb_build_object(
      'id', v_order_id,
      'order_number', v_order_number,
      'duplicate', true
    );
  end if;

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

  if exists (
    select 1
    from jsonb_array_elements(p_items) entry(value)
    where jsonb_typeof(entry.value) is distinct from 'object'
       or nullif(entry.value->>'variant_id','') is null
       or coalesce(entry.value->>'quantity','') !~ '^[0-9]+$'
  ) then
    raise exception 'بيانات الأصناف والكميات غير صحيحة';
  end if;

  -- Lock every requested inventory row once in deterministic UUID order.
  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry(value)
    group by (entry.value->>'variant_id')::uuid
    order by (entry.value->>'variant_id')::uuid
  loop
    if v_item.quantity <= 0 or v_item.quantity > 10 then
      raise exception 'الحد الأقصى للكمية من المقاس/اللون الواحد في الطلب هو 10';
    end if;

    perform 1
    from public.inventory
    where variant_id = v_item.variant_id
    for update;

    if not found then
      raise exception 'أحد الأصناف غير متاح حاليًا';
    end if;
  end loop;

  -- Validate available stock after row locks, excluding units already reserved
  -- for other public orders.
  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry(value)
    group by (entry.value->>'variant_id')::uuid
    order by (entry.value->>'variant_id')::uuid
  loop
    select quantity - coalesce(reserved_quantity,0)
      into v_available
    from public.inventory
    where variant_id = v_item.variant_id;

    if coalesce(v_available,0) < v_item.quantity then
      raise exception 'الكمية المطلوبة غير متاحة حاليًا';
    end if;
  end loop;

  -- Calculate the order total from trusted current catalog prices.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;

    if v_quantity <= 0 or v_quantity > 10 then
      raise exception 'كمية الصنف غير صحيحة';
    end if;

    select p.sale_price
      into v_product
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'أحد الأصناف لم يعد متاحًا';
    end if;
    if v_product.sale_price is null or v_product.sale_price < 0 then
      raise exception 'سعر أحد الأصناف غير صحيح؛ تواصل مع المتجر';
    end if;

    v_line_total := round(v_product.sale_price * v_quantity,2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- Online orders are requests and reservations, not payments. Every new order
  -- starts completely unpaid until the admin records a verified receipt.
  insert into public.online_orders(
    customer_name,
    customer_phone,
    delivery_method,
    delivery_address,
    customer_notes,
    subtotal,
    paid,
    due,
    payment_status,
    idempotency_key
  )
  values (
    trim(p_customer_name),
    v_phone,
    p_delivery_method,
    nullif(trim(coalesce(p_delivery_address,'')),''),
    nullif(trim(coalesce(p_customer_notes,'')),''),
    v_subtotal,
    0,
    v_subtotal,
    'unpaid',
    p_idempotency_key
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;

    select
      p.name,
      p.sale_price,
      p.image_url,
      v.size,
      v.color,
      v.barcode,
      pc.cost_price
    into v_product
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_costs pc on pc.product_id = p.id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'أحد الأصناف لم يعد متاحًا';
    end if;

    v_line_total := round(v_product.sale_price * v_quantity,2);

    insert into public.online_order_items(
      order_id,
      variant_id,
      product_name_snapshot,
      size_snapshot,
      color_snapshot,
      image_url_snapshot,
      barcode_snapshot,
      unit_cost_snapshot,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_order_id,
      (v_item.value->>'variant_id')::uuid,
      v_product.name,
      v_product.size,
      v_product.color,
      v_product.image_url,
      v_product.barcode,
      v_product.cost_price,
      v_quantity,
      v_product.sale_price,
      v_line_total
    );

    update public.inventory
    set reserved_quantity = reserved_quantity + v_quantity,
        updated_at = now()
    where variant_id = (v_item.value->>'variant_id')::uuid
      and quantity - coalesce(reserved_quantity,0) >= v_quantity;

    if not found then
      raise exception 'تغير المخزون أثناء إنشاء الطلب؛ أعد المحاولة';
    end if;
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values (
    null,
    'create_online_order',
    'online_order',
    v_order_id,
    jsonb_build_object(
      'order_number',v_order_number,
      'subtotal',v_subtotal,
      'payment_status','unpaid',
      'phone',v_phone
    )
  );

  return jsonb_build_object(
    'id',v_order_id,
    'order_number',v_order_number,
    'subtotal',v_subtotal,
    'paid',0,
    'due',v_subtotal,
    'duplicate',false
  );
end;
$function$


revoke all on function public.create_online_order(text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.create_online_order(text,text,text,text,text,jsonb,uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_online_order_status(p_order_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.online_orders%rowtype;
  v_item record;
  v_customer uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_invoice bigint;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'إدارة طلبات المتجر متاحة للأدمن فقط'; end if;
  if p_status not in ('confirmed','cancelled','fulfilled') then raise exception 'حالة الطلب غير صحيحة'; end if;

  -- Expire stale unpaid reservations before allowing admin state changes.
  perform public.expire_stale_online_orders();
  select * into v_order from public.online_orders where id=p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if v_order.status in ('cancelled','fulfilled') then raise exception 'لا يمكن تغيير حالة طلب مغلق'; end if;

  if p_status='cancelled' then
    if v_order.paid>0.009 then raise exception 'يجب رد المبالغ المسددة أولًا قبل إلغاء الطلب'; end if;
    for v_item in select variant_id,quantity from public.online_order_items where order_id=p_order_id loop
      update public.inventory set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now()
      where variant_id=v_item.variant_id;
    end loop;
  elsif p_status='fulfilled' then
    if v_order.status<>'confirmed' then raise exception 'يجب تأكيد الطلب قبل تسليمه'; end if;
    if v_order.due>0.009 then raise exception 'لا يمكن تسجيل التسليم قبل تحصيل كامل قيمة الطلب'; end if;

    insert into public.customers(name,phone) values(v_order.customer_name,v_order.customer_phone)
    on conflict(phone) do update set name=excluded.name returning id into v_customer;

    insert into public.sales(idempotency_key,seller_id,customer_id,source_online_order_id,subtotal,discount_percent,discount_amount,total,paid,due,status)
    values(v_order.id,auth.uid(),v_customer,p_order_id,v_order.subtotal,0,0,v_order.subtotal,v_order.subtotal,0,'completed')
    on conflict(source_online_order_id) where source_online_order_id is not null do nothing
    returning id,invoice_number into v_sale_id,v_invoice;

    if v_sale_id is null then
      select id,invoice_number into v_sale_id,v_invoice from public.sales where source_online_order_id=p_order_id;
      if v_sale_id is null then raise exception 'تعذر ربط الطلب بفاتورة المبيعات'; end if;
    else
      for v_item in select * from public.online_order_items where order_id=p_order_id order by variant_id,id loop
        insert into public.sale_items(sale_id,variant_id,product_name_snapshot,barcode_snapshot,quantity,unit_price,line_total,discount_amount)
        values(v_sale_id,v_item.variant_id,v_item.product_name_snapshot,coalesce(v_item.barcode_snapshot,''),v_item.quantity,v_item.unit_price,v_item.line_total,0)
        returning id into v_sale_item_id;
        if v_item.unit_cost_snapshot is not null then
          insert into public.sale_item_costs(sale_item_id,unit_cost_snapshot)
          values(v_sale_item_id,v_item.unit_cost_snapshot);
        end if;

        update public.inventory set quantity=quantity-v_item.quantity,reserved_quantity=reserved_quantity-v_item.quantity,updated_at=now()
        where variant_id=v_item.variant_id and quantity>=v_item.quantity and reserved_quantity>=v_item.quantity;
        if not found then raise exception 'تعذر خصم الكمية المحجوزة؛ راجع المخزون'; end if;

        insert into public.stock_movements(variant_id,movement_type,quantity_delta,reason,reference_id,actor_id)
        values(v_item.variant_id,'sale',-v_item.quantity,'طلب متجر إلكتروني #'||v_order.order_number||' / فاتورة '||v_invoice,v_sale_id,auth.uid());
      end loop;
    end if;
  end if;

  update public.online_orders set status=p_status,updated_at=now() where id=p_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'set_online_order_status','online_order',p_order_id,
    jsonb_build_object('from',v_order.status,'to',p_status,'order_number',v_order.order_number,'sale_id',v_sale_id,'invoice_number',v_invoice));
  return jsonb_build_object('id',p_order_id,'order_number',v_order.order_number,'status',p_status,'sale_id',v_sale_id,'invoice_number',v_invoice);
end;
$function$


revoke all on function public.set_online_order_status(uuid,text) from public,anon;
grant execute on function public.set_online_order_status(uuid,text) to authenticated;
