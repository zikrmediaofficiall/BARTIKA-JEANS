-- BARTIKA shipping companies, delivery zones, fees, and online payment preference.
-- Delivery prices are calculated by the database, never trusted from the browser.

create table if not exists public.shipping_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  contact_phone text,
  tracking_url_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.shipping_companies(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  fee numeric(12,2) not null default 0 check (fee >= 0),
  free_shipping_threshold numeric(12,2) check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,name)
);

create index if not exists shipping_zones_active_idx
  on public.shipping_zones(is_active,sort_order,name);
create index if not exists shipping_zones_company_idx
  on public.shipping_zones(company_id);

alter table public.shipping_companies enable row level security;
alter table public.shipping_zones enable row level security;

create policy "shipping companies admin manage"
  on public.shipping_companies for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "shipping zones admin manage"
  on public.shipping_zones for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select,insert,update,delete on public.shipping_companies,public.shipping_zones to authenticated;

alter table public.online_orders
  add column if not exists shipping_zone_id uuid references public.shipping_zones(id) on delete set null,
  add column if not exists shipping_company_id uuid references public.shipping_companies(id) on delete set null,
  add column if not exists shipping_zone_name_snapshot text,
  add column if not exists shipping_company_name_snapshot text,
  add column if not exists shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  add column if not exists payment_preference text not null default 'cod'
    check (payment_preference in ('cod','instapay','visa','pickup_cash'));

alter table public.online_orders
  add column if not exists total numeric(12,2)
  generated always as (subtotal + shipping_amount) stored;

update public.online_orders
set due = greatest(0, subtotal + shipping_amount - paid);

alter table public.sales
  add column if not exists shipping_amount numeric(12,2) not null default 0
  check (shipping_amount >= 0);

-- Public callers can see only the active carrier/zone/price choices, not supplier-side notes or financial tables.
create or replace function public.get_public_shipping_options()
returns table (
  shipping_company_id uuid,
  shipping_company_name text,
  shipping_zone_id uuid,
  shipping_zone_name text,
  fee numeric,
  free_shipping_threshold numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    z.id,
    z.name,
    z.fee,
    z.free_shipping_threshold
  from public.shipping_companies as c
  join public.shipping_zones as z on z.company_id = c.id
  where c.is_active = true
    and z.is_active = true
  order by z.sort_order, c.name, z.name;
$$;

revoke all on function public.get_public_shipping_options() from public;
grant execute on function public.get_public_shipping_options() to anon,authenticated;

-- Replace the older seven-argument public checkout so no caller can bypass server-side shipping calculation.
drop function if exists public.create_online_order(text,text,text,text,text,jsonb,uuid);

create function public.create_online_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_method text,
  p_delivery_address text,
  p_customer_notes text,
  p_items jsonb,
  p_idempotency_key uuid,
  p_shipping_zone_id uuid,
  p_payment_preference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric(12,2) := 0;
  v_shipping_amount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_item record;
  v_product record;
  v_quantity integer;
  v_available integer;
  v_line_total numeric(12,2);
  v_phone text := regexp_replace(trim(coalesce(p_customer_phone,'')), '[^0-9+]', '', 'g');
  v_recent_orders integer := 0;
  v_zone record;
begin
  if p_idempotency_key is null then
    raise exception 'معرّف الطلب غير صالح';
  end if;

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

  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));
  perform public.expire_stale_online_orders();

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

  if p_delivery_method is null or p_delivery_method not in ('delivery','pickup') then
    raise exception 'طريقة الاستلام غير صحيحة';
  end if;
  if p_payment_preference is null or p_payment_preference not in ('cod','instapay','visa','pickup_cash') then
    raise exception 'طريقة الدفع المختارة غير صحيحة';
  end if;
  if p_delivery_method = 'delivery' then
    if length(trim(coalesce(p_delivery_address,''))) < 5 then
      raise exception 'عنوان التوصيل مطلوب';
    end if;
    if p_shipping_zone_id is null then
      raise exception 'اختر منطقة التوصيل أولًا';
    end if;
    if p_payment_preference = 'pickup_cash' then
      raise exception 'الدفع النقدي عند الاستلام من الفرع غير متاح لطلبات التوصيل';
    end if;

    select
      z.id as zone_id,
      z.name as zone_name,
      z.fee,
      z.free_shipping_threshold,
      c.id as company_id,
      c.name as company_name
    into v_zone
    from public.shipping_zones as z
    join public.shipping_companies as c on c.id = z.company_id
    where z.id = p_shipping_zone_id
      and z.is_active = true
      and c.is_active = true
    for share of z,c;

    if not found then
      raise exception 'منطقة التوصيل غير متاحة حاليًا؛ اختر منطقة أخرى';
    end if;
  else
    if p_shipping_zone_id is not null then
      raise exception 'لا تختار شركة شحن عند الاستلام من الفرع';
    end if;
    if p_payment_preference = 'cod' then
      raise exception 'اختر الدفع النقدي عند الاستلام من الفرع';
    end if;
    if p_payment_preference not in ('pickup_cash','instapay','visa') then
      raise exception 'طريقة الدفع لا تتوافق مع الاستلام من الفرع';
    end if;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'الطلب يجب أن يحتوي من 1 إلى 20 صنفًا';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) is distinct from 'object'
       or nullif(entry.value->>'variant_id','') is null
       or coalesce(entry.value->>'quantity','') !~ '^[0-9]+$'
  ) then
    raise exception 'بيانات الأصناف والكميات غير صحيحة';
  end if;

  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
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

  for v_item in
    select
      (entry.value->>'variant_id')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
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

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;

    if v_quantity <= 0 or v_quantity > 10 then
      raise exception 'كمية الصنف غير صحيحة';
    end if;

    select p.sale_price
      into v_product
    from public.product_variants as v
    join public.products as p on p.id = v.product_id
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

  if p_delivery_method = 'delivery' then
    v_shipping_amount := case
      when v_zone.free_shipping_threshold is not null
       and v_subtotal >= v_zone.free_shipping_threshold then 0
      else v_zone.fee
    end;
  end if;
  v_total := v_subtotal + v_shipping_amount;

  insert into public.online_orders(
    customer_name,customer_phone,delivery_method,delivery_address,customer_notes,
    subtotal,shipping_zone_id,shipping_company_id,shipping_zone_name_snapshot,
    shipping_company_name_snapshot,shipping_amount,payment_preference,
    paid,due,payment_status,idempotency_key
  )
  values (
    trim(p_customer_name),v_phone,p_delivery_method,
    nullif(trim(coalesce(p_delivery_address,'')),''),
    nullif(trim(coalesce(p_customer_notes,'')),''),
    v_subtotal,
    case when p_delivery_method='delivery' then v_zone.zone_id else null end,
    case when p_delivery_method='delivery' then v_zone.company_id else null end,
    case when p_delivery_method='delivery' then v_zone.zone_name else null end,
    case when p_delivery_method='delivery' then v_zone.company_name else null end,
    v_shipping_amount,p_payment_preference,
    0,v_total,'unpaid',p_idempotency_key
  )
  returning id,order_number into v_order_id,v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item.value->>'quantity')::integer;

    select
      p.name,p.sale_price,p.image_url,v.size,v.color,v.barcode,pc.cost_price
    into v_product
    from public.product_variants as v
    join public.products as p on p.id = v.product_id
    left join public.product_costs as pc on pc.product_id = p.id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'أحد الأصناف لم يعد متاحًا';
    end if;

    v_line_total := round(v_product.sale_price * v_quantity,2);

    insert into public.online_order_items(
      order_id,variant_id,product_name_snapshot,size_snapshot,color_snapshot,
      image_url_snapshot,barcode_snapshot,unit_cost_snapshot,quantity,unit_price,line_total
    )
    values (
      v_order_id,(v_item.value->>'variant_id')::uuid,v_product.name,
      v_product.size,v_product.color,v_product.image_url,v_product.barcode,
      v_product.cost_price,v_quantity,v_product.sale_price,v_line_total
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
    null,'create_online_order','online_order',v_order_id,
    jsonb_build_object(
      'order_number',v_order_number,'subtotal',v_subtotal,
      'shipping_amount',v_shipping_amount,'total',v_total,
      'payment_preference',p_payment_preference,'payment_status','unpaid','phone',v_phone
    )
  );

  return jsonb_build_object(
    'id',v_order_id,'order_number',v_order_number,
    'subtotal',v_subtotal,'shipping_amount',v_shipping_amount,
    'total',v_total,'paid',0,'due',v_total,'duplicate',false
  );
end;
$$;

revoke all on function public.create_online_order(text,text,text,text,text,jsonb,uuid,uuid,text) from public;
grant execute on function public.create_online_order(text,text,text,text,text,jsonb,uuid,uuid,text) to anon,authenticated;

-- Payment and refund ledgers use order total (products + shipping), not products subtotal alone.
create or replace function public.record_online_order_payment(
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,
 p_cash_session_id uuid default null,p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_existing public.online_order_payments%rowtype;
  v_id uuid;
  v_paid numeric(12,2);
  v_due numeric(12,2);
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'تحصيل طلبات المتجر متاح للأدمن فقط'; end if;
 if p_idempotency_key is null then raise exception 'معرف التحصيل غير صالح'; end if;
 select * into v_existing from public.online_order_payments where idempotency_key=p_idempotency_key;
 if found then
  if v_existing.order_id<>p_order_id or v_existing.amount<>p_amount or v_existing.payment_method<>p_method then raise exception 'معرف التحصيل مستخدم ببيانات مختلفة'; end if;
  select paid,due into v_paid,v_due from public.online_orders where id=p_order_id;
  return jsonb_build_object('payment_id',v_existing.id,'paid',v_paid,'due',v_due,'duplicate',true);
 end if;
 select * into v_order from public.online_orders where id=p_order_id for update;
 if not found or v_order.status not in ('pending','confirmed') then raise exception 'الطلب غير موجود أو مغلق'; end if;
 select * into v_existing from public.online_order_payments where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('payment_id',v_existing.id,'paid',v_order.paid,'due',v_order.due,'duplicate',true); end if;
 if p_amount is null or p_amount<=0 or p_amount>v_order.due then raise exception 'قيمة التحصيل تتجاوز المتبقي أو غير صحيحة'; end if;
 if p_method not in ('cash','instapay','visa') then raise exception 'طريقة التحصيل غير صحيحة'; end if;
 if p_method<>'cash' and length(trim(coalesce(p_reference,'')))<3 then raise exception 'مرجع التحويل أو الفيزا مطلوب'; end if;
 if p_method<>'cash' and p_cash_session_id is not null then raise exception 'لا يمكن ربط الدفع غير النقدي بدرج الكاش'; end if;
 if p_cash_session_id is not null then perform 1 from public.cash_sessions where id=p_cash_session_id and status='open' for update; if not found then raise exception 'درج النقدية غير مفتوح'; end if; end if;
 insert into public.online_order_payments(order_id,amount,payment_method,reference,cash_session_id,idempotency_key,created_by)
 values(p_order_id,p_amount,p_method,nullif(trim(coalesce(p_reference,'')),''),p_cash_session_id,p_idempotency_key,auth.uid()) returning id into v_id;
 v_paid:=v_order.paid+p_amount; v_due:=v_order.total-v_paid;
 update public.online_orders set paid=v_paid,due=v_due,payment_status=case when v_due<=0.009 then 'paid' else 'partial' end,updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
 values(auth.uid(),'record_online_order_payment','online_order',p_order_id,jsonb_build_object('payment_id',v_id,'amount',p_amount,'method',p_method,'cash_session_id',p_cash_session_id));
 return jsonb_build_object('payment_id',v_id,'paid',v_paid,'due',v_due,'duplicate',false);
end;
$$;
revoke all on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) from public;
grant execute on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;

create or replace function public.record_online_order_refund(
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,
 p_cash_session_id uuid default null,p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $refund$
declare
 v_order public.online_orders%rowtype;
 v_existing public.online_order_refunds%rowtype;
 v_id uuid;
 v_paid numeric(12,2);
 v_due numeric(12,2);
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'رد مبالغ طلبات المتجر متاح للأدمن فقط'; end if;
 if p_idempotency_key is null then raise exception 'معرف الرد غير صالح'; end if;
 select * into v_existing from public.online_order_refunds where idempotency_key=p_idempotency_key;
 if found then
  if v_existing.order_id<>p_order_id or v_existing.amount<>p_amount or v_existing.payment_method<>p_method then raise exception 'معرف الرد مستخدم ببيانات مختلفة'; end if;
  select paid,due into v_paid,v_due from public.online_orders where id=p_order_id;
  return jsonb_build_object('refund_id',v_existing.id,'paid',v_paid,'due',v_due,'duplicate',true);
 end if;
 select * into v_order from public.online_orders where id=p_order_id for update;
 if not found or v_order.status in ('fulfilled','cancelled') then raise exception 'الطلب غير موجود أو تم إغلاقه'; end if;
 select * into v_existing from public.online_order_refunds where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('refund_id',v_existing.id,'paid',v_order.paid,'due',v_order.due,'duplicate',true); end if;
 if p_amount is null or p_amount<=0 or p_amount>v_order.paid then raise exception 'قيمة الرد أكبر من المدفوع أو غير صحيحة'; end if;
 if p_method not in ('cash','instapay','visa') then raise exception 'وسيلة الرد غير صحيحة'; end if;
 if p_method<>'cash' and length(trim(coalesce(p_reference,'')))<3 then raise exception 'مرجع رد التحويل مطلوب'; end if;
 if p_method<>'cash' and p_cash_session_id is not null then raise exception 'لا يمكن ربط رد غير نقدي بدرج الكاش'; end if;
 if p_cash_session_id is not null then perform 1 from public.cash_sessions where id=p_cash_session_id and status='open' for update; if not found then raise exception 'درج النقدية غير مفتوح'; end if; end if;
 insert into public.online_order_refunds(order_id,amount,payment_method,reference,cash_session_id,idempotency_key,created_by)
 values(p_order_id,p_amount,p_method,nullif(trim(coalesce(p_reference,'')),''),p_cash_session_id,p_idempotency_key,auth.uid()) returning id into v_id;
 v_paid:=v_order.paid-p_amount; v_due:=v_order.total-v_paid;
 update public.online_orders set paid=v_paid,due=v_due,payment_status=case when v_paid<=0.009 then 'unpaid' when v_due<=0.009 then 'paid' else 'partial' end,updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
 values(auth.uid(),'record_online_order_refund','online_order',p_order_id,jsonb_build_object('refund_id',v_id,'amount',p_amount,'method',p_method,'cash_session_id',p_cash_session_id));
 return jsonb_build_object('refund_id',v_id,'paid',v_paid,'due',v_due,'duplicate',false);
end;
$refund$;
revoke all on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) from public;
grant execute on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;

-- Include delivery charge in the sale invoice and total when an online order is fulfilled.
create or replace function public.set_online_order_status(p_order_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_item record;
  v_customer uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_invoice bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة طلبات المتجر متاحة للأدمن فقط';
  end if;
  if p_status not in ('confirmed','cancelled','fulfilled') then
    raise exception 'حالة الطلب غير صحيحة';
  end if;

  perform public.expire_stale_online_orders();
  select * into v_order from public.online_orders where id=p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if v_order.status in ('cancelled','fulfilled') then
    raise exception 'لا يمكن تغيير حالة طلب مغلق';
  end if;

  if p_status='cancelled' then
    if v_order.paid>0.009 then
      raise exception 'يجب رد المبالغ المسددة أولًا قبل إلغاء الطلب';
    end if;
    for v_item in
      select variant_id,quantity from public.online_order_items where order_id=p_order_id
    loop
      update public.inventory
      set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now()
      where variant_id=v_item.variant_id;
    end loop;
  elsif p_status='fulfilled' then
    if v_order.status<>'confirmed' then raise exception 'يجب تأكيد الطلب قبل تسليمه'; end if;
    if v_order.due>0.009 then raise exception 'لا يمكن تسجيل التسليم قبل تحصيل كامل قيمة الطلب'; end if;

    insert into public.customers(name,phone)
    values(v_order.customer_name,v_order.customer_phone)
    on conflict(phone) do update set name=excluded.name
    returning id into v_customer;

    insert into public.sales(
      idempotency_key,seller_id,customer_id,source_online_order_id,
      subtotal,shipping_amount,discount_percent,discount_amount,total,paid,due,status
    )
    values(
      v_order.id,auth.uid(),v_customer,p_order_id,
      v_order.subtotal,v_order.shipping_amount,0,0,v_order.total,v_order.total,0,'completed'
    )
    on conflict(source_online_order_id) where source_online_order_id is not null do nothing
    returning id,invoice_number into v_sale_id,v_invoice;

    if v_sale_id is null then
      select id,invoice_number into v_sale_id,v_invoice
      from public.sales where source_online_order_id=p_order_id;
      if v_sale_id is null then raise exception 'تعذر ربط الطلب بفاتورة المبيعات'; end if;
    else
      for v_item in
        select * from public.online_order_items where order_id=p_order_id order by variant_id,id
      loop
        insert into public.sale_items(
          sale_id,variant_id,product_name_snapshot,barcode_snapshot,
          quantity,unit_price,line_total,discount_amount
        )
        values(
          v_sale_id,v_item.variant_id,v_item.product_name_snapshot,
          coalesce(v_item.barcode_snapshot,''),v_item.quantity,
          v_item.unit_price,v_item.line_total,0
        )
        returning id into v_sale_item_id;

        if v_item.unit_cost_snapshot is not null then
          insert into public.sale_item_costs(sale_item_id,unit_cost_snapshot)
          values(v_sale_item_id,v_item.unit_cost_snapshot);
        end if;

        update public.inventory
        set quantity=quantity-v_item.quantity,
            reserved_quantity=reserved_quantity-v_item.quantity,
            updated_at=now()
        where variant_id=v_item.variant_id
          and quantity>=v_item.quantity
          and reserved_quantity>=v_item.quantity;

        if not found then
          raise exception 'تعذر خصم الكمية المحجوزة؛ راجع المخزون';
        end if;

        insert into public.stock_movements(
          variant_id,movement_type,quantity_delta,reason,reference_id,actor_id
        )
        values(
          v_item.variant_id,'sale',-v_item.quantity,
          'طلب متجر إلكتروني #'||v_order.order_number||' / فاتورة '||v_invoice,
          v_sale_id,auth.uid()
        );
      end loop;
    end if;
  end if;

  update public.online_orders set status=p_status,updated_at=now() where id=p_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'set_online_order_status','online_order',p_order_id,
    jsonb_build_object(
      'from',v_order.status,'to',p_status,'order_number',v_order.order_number,
      'sale_id',v_sale_id,'invoice_number',v_invoice,
      'shipping_amount',v_order.shipping_amount
    )
  );
  return jsonb_build_object(
    'id',p_order_id,'order_number',v_order.order_number,'status',p_status,
    'sale_id',v_sale_id,'invoice_number',v_invoice
  );
end;
$$;
revoke all on function public.set_online_order_status(uuid,text) from public;
grant execute on function public.set_online_order_status(uuid,text) to authenticated;
