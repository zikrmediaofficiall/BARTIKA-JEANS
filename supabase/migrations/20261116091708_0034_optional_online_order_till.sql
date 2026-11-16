-- Permit online order payments/refunds from central treasury without a till ID.
create or replace function public.record_online_order_payment(
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,p_cash_session_id uuid default null,p_idempotency_key uuid default null
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
 p_order_id uuid,p_amount numeric,p_method public.payment_method,p_reference text,p_cash_session_id uuid default null,p_idempotency_key uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $refund$
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
end; $refund$;
revoke all on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) from public,anon;
grant execute on function public.record_online_order_payment(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;
revoke all on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) from public,anon;
grant execute on function public.record_online_order_refund(uuid,numeric,public.payment_method,text,uuid,uuid) to authenticated;
