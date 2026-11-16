-- Allow supplier payments from the central treasury without inventing a cashier till.
drop function if exists public.record_supplier_payment(
  uuid, numeric, public.payment_method, text, uuid, uuid
);

create or replace function public.record_supplier_payment(
  p_purchase_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text,
  p_cash_session_id uuid default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invoice public.purchase_invoices%rowtype;
  v_existing public.supplier_payments%rowtype;
  v_payment_id uuid;
  v_new_paid numeric(12,2);
  v_new_due numeric(12,2);
begin
  if v_user is null or not public.is_admin() then
    raise exception 'سداد الموردين متاح للأدمن فقط';
  end if;

  if p_idempotency_key is null then
    raise exception 'معرّف السداد غير صالح';
  end if;

  select *
    into v_existing
  from public.supplier_payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.purchase_invoice_id <> p_purchase_invoice_id
       or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_method then
      raise exception 'تم استخدام معرّف السداد نفسه ببيانات مختلفة';
    end if;

    select paid, due
      into v_new_paid, v_new_due
    from public.purchase_invoices
    where id = p_purchase_invoice_id;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_new_paid,
      'due', v_new_due,
      'duplicate', true
    );
  end if;

  select *
    into v_invoice
  from public.purchase_invoices
  where id = p_purchase_invoice_id
  for update;

  if not found or v_invoice.status <> 'received' then
    raise exception 'فاتورة الشراء غير موجودة أو لم يتم استلامها';
  end if;

  -- Recheck after locking the invoice for concurrent retries.
  select *
    into v_existing
  from public.supplier_payments
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.purchase_invoice_id <> p_purchase_invoice_id
       or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_method then
      raise exception 'تم استخدام معرّف السداد نفسه ببيانات مختلفة';
    end if;

    return jsonb_build_object(
      'payment_id', v_existing.id,
      'paid', v_invoice.paid,
      'due', v_invoice.due,
      'duplicate', true
    );
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > v_invoice.due then
    raise exception 'قيمة السداد أكبر من المستحق أو غير صحيحة';
  end if;

  if p_method not in ('cash', 'instapay', 'visa') then
    raise exception 'وسيلة السداد غير صحيحة';
  end if;

  if p_method <> 'cash' then
    if p_cash_session_id is not null then
      raise exception 'لا يمكن ربط وسيلة غير نقدية بدرج الكاش';
    end if;
    if length(trim(coalesce(p_reference, ''))) < 3 then
      raise exception 'مرجع التحويل أو الفيزا مطلوب';
    end if;
  elsif p_cash_session_id is not null then
    perform 1
    from public.cash_sessions
    where id = p_cash_session_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'اختر وردية نقدية مفتوحة أو اترك السداد من الخزينة المركزية';
    end if;
  end if;

  v_new_paid := v_invoice.paid + p_amount;
  v_new_due := v_invoice.due - p_amount;

  update public.purchase_invoices
  set paid = v_new_paid,
      due = v_new_due
  where id = p_purchase_invoice_id;

  insert into public.supplier_payments(
    supplier_id,
    purchase_invoice_id,
    amount,
    payment_method,
    reference,
    cash_session_id,
    idempotency_key,
    created_by
  )
  values (
    v_invoice.supplier_id,
    p_purchase_invoice_id,
    p_amount,
    p_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    p_cash_session_id,
    p_idempotency_key,
    v_user
  )
  returning id into v_payment_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'record_supplier_payment',
    'purchase_invoice',
    p_purchase_invoice_id,
    jsonb_build_object(
      'supplier_id', v_invoice.supplier_id,
      'payment_id', v_payment_id,
      'amount', p_amount,
      'method', p_method,
      'cash_session_id', p_cash_session_id,
      'paid_after', v_new_paid,
      'due_after', v_new_due
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'paid', v_new_paid,
    'due', v_new_due,
    'duplicate', false
  );
end;
$$;


revoke all on function public.record_supplier_payment(
  uuid, numeric, public.payment_method, text, uuid, uuid
) from public, anon;
grant execute on function public.record_supplier_payment(
  uuid, numeric, public.payment_method, text, uuid, uuid
) to authenticated;
