-- Enforce seller ownership and the configured voluntary exchange window.
-- Defect/nonconforming products remain eligible outside the voluntary window;
-- mandatory consumer rights are not reduced by the shop's voluntary policy.

alter table public.exchanges
  add column if not exists exchange_type text not null default 'voluntary'
  check (exchange_type in ('voluntary', 'defect', 'nonconforming'));

drop function if exists public.process_sale_exchange(
  uuid, text, jsonb, public.payment_method, text
);

create or replace function public.process_sale_exchange(
  p_original_sale_id uuid,
  p_reason text,
  p_exchange_type text,
  p_items jsonb,
  p_settlement_method public.payment_method default null,
  p_settlement_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_exchange_id uuid;
  v_item jsonb;
  v_sale_item public.sale_items%rowtype;
  v_sale_item_id uuid;
  v_qty integer;
  v_used integer;
  v_available integer;
  v_replacement_variant_id uuid;
  v_replacement_price numeric(12,2);
  v_return_value numeric(12,2) := 0;
  v_replacement_value numeric(12,2) := 0;
  v_price_difference numeric(12,2) := 0;
  v_lock_ids uuid[];
  v_locked_count integer := 0;
  v_expected_count integer := 0;
  v_lock record;
  v_line record;
  v_cash_session_id uuid;
  v_direction text;
  v_exchange_days integer := 3;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select role::text
    into v_role
  from public.profiles
  where id = v_user and is_active = true;

  if v_role is null or v_role not in ('admin', 'seller') then
    raise exception 'الاستبدال متاح للأدمن والبائعين النشطين فقط';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 4
     or length(trim(p_reason)) > 500 then
    raise exception 'اكتب سبب الاستبدال بصورة صحيحة';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'اختر بندًا واحدًا على الأقل وبحد أقصى 50 بندًا';
  end if;

  -- Serialize all exchanges against this invoice.
  select *
    into v_sale
  from public.sales
  where id = p_original_sale_id
  for update;

  if not found or v_sale.status <> 'completed' then
    raise exception 'الفاتورة الأصلية غير موجودة أو ملغاة';
  end if;

  -- SECURITY DEFINER bypasses table RLS, so enforce seller ownership here.
  if v_role = 'seller' and v_sale.seller_id <> v_user then
    raise exception 'لا يمكنك استبدال فاتورة بائع آخر';
  end if;

  if p_exchange_type not in ('voluntary', 'defect', 'nonconforming') then
    raise exception 'نوع الاستبدال غير صحيح';
  end if;

  if p_exchange_type = 'voluntary' then
    select coalesce(exchange_days, 3)
      into v_exchange_days
    from public.store_settings
    where id = 1;

    if now() > v_sale.created_at + make_interval(days => coalesce(v_exchange_days, 3)) then
      raise exception 'انتهت مدة الاستبدال الطوعي المحددة في إعدادات المتجر';
    end if;
  end if;

  if v_sale.due > 0.01 then
    raise exception 'يجب تسوية باقي الفاتورة الأصلية قبل الاستبدال؛ دعم الذمم أثناء الاستبدال لم يُفعّل بعد';
  end if;

  -- Legacy exchanges without line references cannot be safely apportioned.
  if exists (
    select 1
    from public.exchanges e
    join public.exchange_items ei on ei.exchange_id = e.id
    where e.original_sale_id = p_original_sale_id
      and ei.original_sale_item_id is null
  ) then
    raise exception 'توجد عمليات استبدال قديمة غير مرتبطة ببند فاتورة؛ يلزم مراجعتها إداريًا أولًا';
  end if;

  if exists (
    select 1
    from (
      select (entry.value->>'sale_item_id')::uuid as sale_item_id,
             count(*) as item_count
      from jsonb_array_elements(p_items) as entry(value)
      group by (entry.value->>'sale_item_id')::uuid
    ) duplicates
    where item_count > 1
  ) then
    raise exception 'لا تكرر بند الفاتورة نفسه؛ اجمع الكمية في سطر واحد';
  end if;

  -- Validate original sale lines, returned quantities, and current replacement prices.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'sale_item_id', '') is null
       or nullif(v_item->>'quantity', '') is null then
      raise exception 'بيانات بند المرتجع غير مكتملة';
    end if;

    v_sale_item_id := (v_item->>'sale_item_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    if v_qty <= 0 then
      raise exception 'كمية المرتجع يجب أن تكون أكبر من صفر';
    end if;

    select *
      into v_sale_item
    from public.sale_items
    where id = v_sale_item_id
      and sale_id = p_original_sale_id
    for update;

    if not found then
      raise exception 'بند المرتجع لا ينتمي إلى الفاتورة الأصلية';
    end if;

    select coalesce(sum(ei.quantity), 0)
      into v_used
    from public.exchange_items ei
    join public.exchanges e on e.id = ei.exchange_id
    where ei.original_sale_item_id = v_sale_item_id
      and e.status = 'completed';

    v_available := v_sale_item.quantity - v_used;
    if v_qty > v_available then
      raise exception 'كمية المرتجع أكبر من الكمية المتبقية في الفاتورة لهذا الصنف';
    end if;

    v_return_value := v_return_value
      + round(
          ((v_sale_item.line_total - v_sale_item.discount_amount)
            / v_sale_item.quantity) * v_qty,
          2
        );

    v_replacement_variant_id :=
      nullif(v_item->>'replacement_variant_id', '')::uuid;

    if v_replacement_variant_id is not null then
      select p.sale_price
        into v_replacement_price
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = v_replacement_variant_id
        and p.is_active = true;

      if not found then
        raise exception 'الصنف البديل غير موجود أو غير نشط';
      end if;

      v_replacement_value := v_replacement_value
        + round(v_replacement_price * v_qty, 2);
    end if;
  end loop;

  v_price_difference := round(v_replacement_value - v_return_value, 2);

  if v_price_difference <> 0 and p_settlement_method is null then
    raise exception 'يجب تحديد وسيلة تحصيل فرق السعر أو رد المبلغ';
  end if;

  if v_price_difference = 0 and p_settlement_method is not null then
    raise exception 'لا توجد تسوية مالية مطلوبة لأن فرق السعر يساوي صفرًا';
  end if;

  if p_settlement_method = 'cash' then
    select id
      into v_cash_session_id
    from public.cash_sessions
    where seller_id = v_user
      and status = 'open'
    for update;

    if v_cash_session_id is null then
      raise exception 'افتح وردية نقدية قبل تحصيل فرق السعر أو رد نقدية';
    end if;
  elsif p_settlement_method is not null then
    v_cash_session_id := null;
  end if;

  -- Lock every affected stock row once and in deterministic UUID order.
  select array_agg(distinct variants.variant_id order by variants.variant_id)
    into v_lock_ids
  from (
    select si.variant_id
    from jsonb_array_elements(p_items) as entry(value)
    join public.sale_items si
      on si.id = (entry.value->>'sale_item_id')::uuid
    union all
    select nullif(entry.value->>'replacement_variant_id', '')::uuid
    from jsonb_array_elements(p_items) as entry(value)
    where nullif(entry.value->>'replacement_variant_id', '') is not null
  ) variants;

  select count(*)
    into v_expected_count
  from unnest(coalesce(v_lock_ids, array[]::uuid[])) ids(variant_id);

  for v_lock in
    select i.variant_id, i.quantity
    from public.inventory i
    where i.variant_id = any(coalesce(v_lock_ids, array[]::uuid[]))
    order by i.variant_id
    for update
  loop
    v_locked_count := v_locked_count + 1;
  end loop;

  if v_locked_count <> v_expected_count then
    raise exception 'سجل المخزون غير مكتمل لأحد المقاسات أو الألوان';
  end if;

  -- Confirm the net result cannot make any replacement stock negative.
  for v_line in
    with requested as (
      select
        si.variant_id as returned_variant_id,
        nullif(entry.value->>'replacement_variant_id', '')::uuid as replacement_variant_id,
        (entry.value->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as entry(value)
      join public.sale_items si
        on si.id = (entry.value->>'sale_item_id')::uuid
    ),
    movements as (
      select returned_variant_id as variant_id, quantity as delta
      from requested
      union all
      select replacement_variant_id as variant_id, -quantity as delta
      from requested
      where replacement_variant_id is not null
    )
    select m.variant_id, sum(m.delta)::integer as net_delta
    from movements m
    group by m.variant_id
    order by m.variant_id
  loop
    select quantity
      into v_available
    from public.inventory
    where variant_id = v_line.variant_id;

    if v_available + v_line.net_delta < 0 then
      raise exception 'المخزون غير كافٍ للصنف البديل';
    end if;
  end loop;

  insert into public.exchanges(
    original_sale_id,
    created_by,
    reason,
    status,
    price_difference,
    exchange_type
  )
  values (
    p_original_sale_id,
    v_user,
    trim(p_reason),
    'completed',
    v_price_difference,
    p_exchange_type
  )
  returning id into v_exchange_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sale_item_id := (v_item->>'sale_item_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    insert into public.exchange_items(
      exchange_id,
      original_sale_item_id,
      returned_variant_id,
      replacement_variant_id,
      quantity
    )
    select
      v_exchange_id,
      si.id,
      si.variant_id,
      nullif(v_item->>'replacement_variant_id', '')::uuid,
      v_qty
    from public.sale_items si
    where si.id = v_sale_item_id;
  end loop;

  -- Put all returned items back first, so a same-variant exchange can reuse
  -- the returned unit without creating a transient negative quantity.
  for v_line in
    select si.variant_id, sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
    join public.sale_items si
      on si.id = (entry.value->>'sale_item_id')::uuid
    group by si.variant_id
    order by si.variant_id
  loop
    update public.inventory
      set quantity = quantity + v_line.quantity,
          updated_at = now()
    where variant_id = v_line.variant_id;

    insert into public.stock_movements(
      variant_id, movement_type, quantity_delta, reason, reference_id, actor_id
    )
    values (
      v_line.variant_id,
      'exchange_in',
      v_line.quantity,
      'مرتجع/استبدال للفاتورة ' || v_sale.invoice_number,
      v_exchange_id,
      v_user
    );
  end loop;

  for v_line in
    select
      nullif(entry.value->>'replacement_variant_id', '')::uuid as variant_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
    where nullif(entry.value->>'replacement_variant_id', '') is not null
    group by nullif(entry.value->>'replacement_variant_id', '')::uuid
    order by nullif(entry.value->>'replacement_variant_id', '')::uuid
  loop
    update public.inventory
      set quantity = quantity - v_line.quantity,
          updated_at = now()
    where variant_id = v_line.variant_id
      and quantity >= v_line.quantity;

    if not found then
      raise exception 'تغير مخزون الصنف البديل أثناء اعتماد العملية؛ أعد المحاولة';
    end if;

    insert into public.stock_movements(
      variant_id, movement_type, quantity_delta, reason, reference_id, actor_id
    )
    values (
      v_line.variant_id,
      'exchange_out',
      -v_line.quantity,
      'صرف بديل للفاتورة ' || v_sale.invoice_number,
      v_exchange_id,
      v_user
    );
  end loop;

  if v_price_difference <> 0 then
    v_direction := case
      when v_price_difference > 0 then 'collect'
      else 'refund'
    end;

    insert into public.exchange_settlements(
      exchange_id,
      direction,
      payment_method,
      amount,
      reference,
      cash_session_id,
      created_by
    )
    values (
      v_exchange_id,
      v_direction,
      p_settlement_method,
      abs(v_price_difference),
      nullif(trim(coalesce(p_settlement_reference, '')), ''),
      v_cash_session_id,
      v_user
    );
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'process_sale_exchange',
    'exchange',
    v_exchange_id,
    jsonb_build_object(
      'original_sale_id', p_original_sale_id,
      'invoice_number', v_sale.invoice_number,
      'exchange_type', p_exchange_type,
      'price_difference', v_price_difference,
      'settlement_method', p_settlement_method,
      'settlement_direction', case
        when v_price_difference > 0 then 'collect'
        when v_price_difference < 0 then 'refund'
        else 'none'
      end,
      'items', p_items
    )
  );

  return jsonb_build_object(
    'exchange_id', v_exchange_id,
    'original_sale_id', p_original_sale_id,
    'invoice_number', v_sale.invoice_number,
    'price_difference', v_price_difference,
    'settlement_direction', case
      when v_price_difference > 0 then 'collect'
      when v_price_difference < 0 then 'refund'
      else 'none'
    end,
    'settlement_amount', abs(v_price_difference),
    'settlement_method', p_settlement_method
  );
end;
$$;


revoke all on function public.process_sale_exchange(
  uuid, text, text, jsonb, public.payment_method, text
) from public, anon;
grant execute on function public.process_sale_exchange(
  uuid, text, text, jsonb, public.payment_method, text
) to authenticated;
