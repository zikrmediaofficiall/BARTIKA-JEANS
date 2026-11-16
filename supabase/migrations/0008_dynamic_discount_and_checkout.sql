-- Dynamic discount authority and race-safe idempotent checkout.
-- This replaces the original hard-coded 20% ceiling with the Admin-configured
-- profile limit (0..100). Admin can set up to 100%; non-admin users stay bounded
-- by their own max_discount_percent.

create or replace function public.create_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount_percent numeric default 0,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_limit numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_sale_id uuid;
  v_invoice bigint;
  v_existing_total numeric;
  item jsonb;
  aggregate_item record;
  v_variant uuid;
  v_sale_item_id uuid;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_name text;
  v_barcode text;
  v_stock integer;
  v_line numeric;
  v_customer uuid;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select role::text, max_discount_percent
    into v_role, v_limit
  from public.profiles
  where id = v_user and is_active = true;

  if v_role is null then
    raise exception 'الحساب غير مفعل';
  end if;

  if p_discount_percent is null or p_discount_percent < 0 or p_discount_percent > 100 then
    raise exception 'نسبة الخصم يجب أن تكون بين 0 و100';
  end if;

  if v_role <> 'admin' and p_discount_percent > coalesce(v_limit, 0) then
    raise exception 'الخصم يتجاوز الحد الذي حدده Admin';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'أضف صنفًا واحدًا على الأقل';
  end if;

  if jsonb_typeof(p_payments) is distinct from 'array' then
    raise exception 'بيانات الدفع غير صحيحة';
  end if;

  -- Lock each variant once in deterministic order and validate the aggregated
  -- requested quantity. This prevents duplicate lines from bypassing stock checks.
  for aggregate_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as requested_quantity
    from jsonb_array_elements(p_items) as entry(value)
    group by (entry.value->>'variant_id')::uuid
    order by (entry.value->>'variant_id')::uuid
  loop
    if aggregate_item.requested_quantity <= 0 then
      raise exception 'كمية غير صحيحة';
    end if;

    select quantity into v_stock
    from public.inventory
    where variant_id = aggregate_item.variant_id
    for update;

    if not found or coalesce(v_stock, 0) < aggregate_item.requested_quantity then
      raise exception 'الكمية غير كافية للمخزون';
    end if;
  end loop;

  -- Re-read trusted product prices from the database; never trust client prices.
  for item in select value from jsonb_array_elements(p_items)
  loop
    v_variant := (item->>'variant_id')::uuid;
    v_qty := (item->>'quantity')::integer;

    if v_qty <= 0 then
      raise exception 'كمية غير صحيحة';
    end if;

    select p.sale_price, p.name, v.barcode
      into v_price, v_name, v_barcode
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = v_variant and p.is_active = true;

    if not found then
      raise exception 'الصنف غير موجود أو غير نشط';
    end if;

    v_subtotal := v_subtotal + round(v_price * v_qty, 2);
  end loop;

  v_discount := round(v_subtotal * p_discount_percent / 100, 2);
  v_total := v_subtotal - v_discount;

  select coalesce(sum((entry.value->>'amount')::numeric), 0)
    into v_paid
  from jsonb_array_elements(p_payments) as entry(value);

  if v_total = 0 then
    if v_paid <> 0 then
      raise exception 'لا يمكن تحصيل مبلغ على فاتورة إجماليها صفر';
    end if;
  elsif v_paid <= 0 or v_paid > v_total then
    raise exception 'قيمة الدفع غير صحيحة';
  end if;

  if v_paid < v_total and nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'يلزم رقم العميل عند وجود مبلغ متبقٍ';
  end if;

  if nullif(trim(coalesce(p_customer_phone, '')), '') is not null then
    insert into public.customers(name, phone)
    values ('عميل', trim(p_customer_phone))
    on conflict(phone) do update set phone = excluded.phone
    returning id into v_customer;
  end if;

  -- The unique idempotency key is also protected at INSERT time. A concurrent
  -- duplicate request returns the already-created invoice without reapplying stock.
  insert into public.sales(
    idempotency_key, seller_id, customer_id, subtotal, discount_percent,
    discount_amount, total, paid, due
  )
  values (
    p_idempotency_key, v_user, v_customer, v_subtotal, p_discount_percent,
    v_discount, v_total, v_paid, v_total - v_paid
  )
  on conflict(idempotency_key) do nothing
  returning id, invoice_number into v_sale_id, v_invoice;

  if v_sale_id is null then
    select id, invoice_number, total
      into v_sale_id, v_invoice, v_existing_total
    from public.sales
    where idempotency_key = p_idempotency_key;

    if v_sale_id is null then
      raise exception 'تعذر التحقق من الفاتورة السابقة';
    end if;

    return jsonb_build_object(
      'id', v_sale_id,
      'invoice_number', v_invoice,
      'total', v_existing_total,
      'duplicate', true
    );
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_variant := (item->>'variant_id')::uuid;
    v_qty := (item->>'quantity')::integer;

    select p.sale_price, p.name, v.barcode, coalesce(pc.cost_price, 0)
      into v_price, v_name, v_barcode, v_cost
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_costs pc on pc.product_id = p.id
    where v.id = v_variant and p.is_active = true;

    v_line := round(v_price * v_qty, 2);

    insert into public.sale_items(
      sale_id, variant_id, product_name_snapshot, barcode_snapshot,
      quantity, unit_price, line_total, discount_amount
    )
    values (
      v_sale_id, v_variant, v_name, v_barcode, v_qty, v_price, v_line,
      case when v_subtotal > 0 then round(v_discount * (v_line / v_subtotal), 2) else 0 end
    )
    returning id into v_sale_item_id;

    insert into public.sale_item_costs(sale_item_id, unit_cost_snapshot)
    values (v_sale_item_id, v_cost);

    update public.inventory
    set quantity = quantity - v_qty, updated_at = now()
    where variant_id = v_variant and quantity >= v_qty;

    if not found then
      raise exception 'تغير المخزون أثناء إتمام البيع؛ أعد المحاولة';
    end if;

    insert into public.stock_movements(
      variant_id, movement_type, quantity_delta, reason, reference_id, actor_id
    )
    values (
      v_variant, 'sale', -v_qty, 'بيع فاتورة ' || v_invoice, v_sale_id, v_user
    );
  end loop;

  for item in select value from jsonb_array_elements(p_payments)
  loop
    if coalesce((item->>'amount')::numeric, 0) > 0 then
      insert into public.payments(sale_id, method, amount, reference)
      values (
        v_sale_id,
        (item->>'method')::public.payment_method,
        (item->>'amount')::numeric,
        nullif(item->>'reference', '')
      );
    end if;
  end loop;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'create_sale',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'invoice_number', v_invoice,
      'total', v_total,
      'discount_percent', p_discount_percent,
      'paid', v_paid,
      'due', v_total - v_paid
    )
  );

  return jsonb_build_object(
    'id', v_sale_id,
    'invoice_number', v_invoice,
    'total', v_total,
    'paid', v_paid,
    'due', v_total - v_paid
  );
end;
$$;

revoke all on function public.create_sale(uuid, jsonb, jsonb, numeric, text) from public;
grant execute on function public.create_sale(uuid, jsonb, jsonb, numeric, text) to authenticated;
