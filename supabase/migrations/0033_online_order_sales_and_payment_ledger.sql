-- Online order payment/refund ledger and conversion into POS sales at fulfillment.
alter table public.online_orders add column if not exists paid numeric(12,2) not null default 0,
 add column if not exists due numeric(12,2) not null default 0,
 add column if not exists payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partial','paid'));
update public.online_orders set due=greatest(0,subtotal-paid) where due=0 and paid=0 and subtotal>0;
alter table public.online_order_items add column if not exists barcode_snapshot text not null default '',
 add column if not exists unit_cost_snapshot numeric(12,2) not null default 0 check(unit_cost_snapshot>=0);
alter table public.sales add column if not exists source_online_order_id uuid references public.online_orders(id) on delete restrict;
create unique index if not exists sales_source_online_order_uidx on public.sales(source_online_order_id) where source_online_order_id is not null;
create table if not exists public.online_order_payments (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.online_orders(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),payment_method public.payment_method not null,reference text,
 cash_session_id uuid references public.cash_sessions(id) on delete restrict,idempotency_key uuid not null unique,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(payment_method='cash' or cash_session_id is null)
);
create table if not exists public.online_order_refunds (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.online_orders(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),payment_method public.payment_method not null,reference text,
 cash_session_id uuid references public.cash_sessions(id) on delete restrict,idempotency_key uuid not null unique,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(payment_method='cash' or cash_session_id is null)
);
create index if not exists online_order_payments_order_created_idx on public.online_order_payments(order_id,created_at desc);
create index if not exists online_order_payments_cash_session_idx on public.online_order_payments(cash_session_id,created_at) where cash_session_id is not null;
create index if not exists online_order_refunds_order_created_idx on public.online_order_refunds(order_id,created_at desc);
create index if not exists online_order_refunds_cash_session_idx on public.online_order_refunds(cash_session_id,created_at) where cash_session_id is not null;
alter table public.online_order_payments enable row level security;
alter table public.online_order_refunds enable row level security;
revoke all on public.online_order_payments,public.online_order_refunds from anon,authenticated;
grant select on public.online_order_payments,public.online_order_refunds to authenticated;
create policy "online order payments admin read" on public.online_order_payments for select to authenticated using((select public.is_admin()));
create policy "online order refunds admin read" on public.online_order_refunds for select to authenticated using((select public.is_admin()));

create or replace function public.record_online_order_payment(
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,p_cash_session_id uuid,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.online_orders%rowtype; v_existing public.online_order_payments%rowtype; v_id uuid; v_paid numeric(12,2); v_due numeric(12,2);
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
 v_paid:=v_order.paid+p_amount; v_due:=v_order.subtotal-v_paid;
 update public.online_orders set paid=v_paid,due=v_due,payment_status=case when v_due<=0.009 then 'paid' else 'partial' end,updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'record_online_order_payment','online_order',p_order_id,jsonb_build_object('payment_id',v_id,'amount',p_amount,'method',p_method,'cash_session_id',p_cash_session_id));
 return jsonb_build_object('payment_id',v_id,'paid',v_paid,'due',v_due,'duplicate',false);
end; $$;

create or replace function public.record_online_order_refund(
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,p_cash_session_id uuid,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.online_orders%rowtype; v_existing public.online_order_refunds%rowtype; v_id uuid; v_paid numeric(12,2); v_due numeric(12,2);
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
 v_paid:=v_order.paid-p_amount; v_due:=v_order.subtotal-v_paid;
 update public.online_orders set paid=v_paid,due=v_due,payment_status=case when v_paid<=0.009 then 'unpaid' when v_due<=0.009 then 'paid' else 'partial' end,updated_at=now() where id=p_order_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'record_online_order_refund','online_order',p_order_id,jsonb_build_object('refund_id',v_id,'amount',p_amount,'method',p_method,'cash_session_id',p_cash_session_id));
 return jsonb_build_object('refund_id',v_id,'paid',v_paid,'due',v_due,'duplicate',false);
end; $$
CREATE OR REPLACE FUNCTION public.attach_sale_to_open_cash_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session_id uuid;
begin
  if new.source_online_order_id is not null then
    return new;
  end if;

  if new.cash_session_id is null then
    select id
      into v_session_id
    from public.cash_sessions
    where seller_id = new.seller_id
      and status = 'open'
    for update;
  else
    select id
      into v_session_id
    from public.cash_sessions
    where id = new.cash_session_id
      and seller_id = new.seller_id
      and status = 'open'
    for update;
  end if;

  if v_session_id is null then
    raise exception 'يجب فتح وردية نقدية قبل إصدار فاتورة البيع';
  end if;

  new.cash_session_id := v_session_id;
  return new;
end;
$function$
;
revoke all on function public.attach_sale_to_open_cash_session() from public,anon,authenticated;
create or replace function public.set_online_order_status(p_order_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public
as $$
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
        insert into public.sale_item_costs(sale_item_id,unit_cost_snapshot) values(v_sale_item_id,v_item.unit_cost_snapshot);

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
$$;
revoke all on function public.set_online_order_status(uuid,text) from public,anon;
grant execute on function public.set_online_order_status(uuid,text) to authenticated;
create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_closed_at timestamptz := now();
  v_cash_sales numeric := 0;
  v_cash_expenses numeric := 0;
  v_exchange_collections numeric := 0;
  v_exchange_refunds numeric := 0;
  v_supplier_payments numeric := 0;
  v_online_order_collections numeric := 0;
  v_online_order_refunds numeric := 0;
  v_expected_cash numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'النقدية الفعلية غير صحيحة';
  end if;

  select *
    into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'الوردية غير موجودة';
  end if;

  if v_session.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'غير مصرح بإغلاق هذه الوردية';
  end if;

  if v_session.status <> 'open' then
    raise exception 'الوردية مغلقة بالفعل';
  end if;

  select coalesce(sum(payment.amount), 0)
    into v_cash_sales
  from public.payments payment
  join public.sales sale on sale.id = payment.sale_id
  where (
      payment.cash_session_id = p_session_id
      or (
        payment.cash_session_id is null
        and sale.cash_session_id = p_session_id
      )
    )
    and sale.status = 'completed'
    and payment.method = 'cash';

  select coalesce(sum(expense.amount), 0)
    into v_cash_expenses
  from public.expenses expense
  where expense.cash_session_id = p_session_id
    and expense.payment_method = 'cash';

  select
    coalesce(sum(settlement.amount) filter (where settlement.direction = 'collect'), 0),
    coalesce(sum(settlement.amount) filter (where settlement.direction = 'refund'), 0)
    into v_exchange_collections, v_exchange_refunds
  from public.exchange_settlements settlement
  where settlement.cash_session_id = p_session_id
    and settlement.payment_method = 'cash';

  select coalesce(sum(payment.amount), 0)
    into v_supplier_payments
  from public.supplier_payments payment
  where payment.cash_session_id = p_session_id
    and payment.payment_method = 'cash';

  select coalesce(sum(payment.amount), 0)
    into v_online_order_collections
  from public.online_order_payments payment
  where payment.cash_session_id = p_session_id
    and payment.payment_method = 'cash';

  select coalesce(sum(refund.amount), 0)
    into v_online_order_refunds
  from public.online_order_refunds refund
  where refund.cash_session_id = p_session_id
    and refund.payment_method = 'cash';

  v_expected_cash :=
    v_session.opening_cash
    + v_cash_sales
    + v_exchange_collections
    + v_online_order_collections
    - v_cash_expenses
    - v_exchange_refunds
    - v_supplier_payments
    - v_online_order_refunds;

  update public.cash_sessions
  set expected_cash = v_expected_cash,
      counted_cash = p_counted_cash,
      variance = p_counted_cash - v_expected_cash,
      status = 'closed',
      closed_at = v_closed_at
  where id = p_session_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'close_cash_session',
    'cash_session',
    p_session_id,
    jsonb_build_object(
      'expected', v_expected_cash,
      'counted', p_counted_cash,
      'cash_sales', v_cash_sales,
      'cash_expenses', v_cash_expenses,
      'exchange_collections', v_exchange_collections,
      'exchange_refunds', v_exchange_refunds,
      'supplier_payments', v_supplier_payments,
      'online_order_collections', v_online_order_collections,
      'online_order_refunds', v_online_order_refunds,
      'variance', p_counted_cash - v_expected_cash
    )
  );

  return jsonb_build_object(
    'expected', v_expected_cash,
    'counted', p_counted_cash,
    'cash_sales', v_cash_sales,
    'cash_expenses', v_cash_expenses,
    'exchange_collections', v_exchange_collections,
    'exchange_refunds', v_exchange_refunds,
    'supplier_payments', v_supplier_payments,
    'online_order_collections', v_online_order_collections,
    'online_order_refunds', v_online_order_refunds,
    'variance', p_counted_cash - v_expected_cash
  );
end;
$$;


;
revoke all on function public.close_cash_session(uuid,numeric) from public,anon;
grant execute on function public.close_cash_session(uuid,numeric) to authenticated;
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
    select p.name,p.sale_price,p.image_url,v.size,v.color,v.barcode,
           coalesce(pc.cost_price,0) as cost_price
      into v_product
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.product_costs pc on pc.product_id = p.id
    where v.id = (v_item.value->>'variant_id')::uuid
      and p.is_active = true;

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
    where variant_id = (v_item.value->>'variant_id')::uuid;
  end loop;

  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'duplicate',false);
end;
$$;
;
revoke all on function public.create_online_order(text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.create_online_order(text,text,text,text,text,jsonb,uuid) to anon,authenticated;
revoke all on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) from public,anon;
grant execute on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;
revoke all on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) from public,anon;
grant execute on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;
