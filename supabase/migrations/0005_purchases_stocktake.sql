create or replace function public.receive_purchase(p_supplier_id uuid,p_reference text,p_items jsonb,p_paid numeric default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_purchase uuid; v_subtotal numeric:=0; item jsonb; v_variant uuid; v_qty int; v_cost numeric; v_product uuid; v_name text;
begin
 if not public.is_admin() then raise exception 'هذه العملية للأدمن فقط'; end if;
 if jsonb_array_length(p_items)=0 then raise exception 'أضف أصناف المشتريات'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
   v_variant:=(item->>'variant_id')::uuid;v_qty:=(item->>'quantity')::int;v_cost:=(item->>'unit_cost')::numeric;
   if v_qty<=0 or v_cost<0 then raise exception 'كمية أو تكلفة غير صحيحة';end if;
   select product_id into v_product from public.product_variants where id=v_variant;
   if not found then raise exception 'متغير المنتج غير موجود';end if;
   v_subtotal:=v_subtotal+(v_qty*v_cost);
 end loop;
 if p_paid<0 or p_paid>v_subtotal then raise exception 'قيمة المدفوع غير صحيحة';end if;
 insert into public.purchase_invoices(supplier_id,invoice_reference,subtotal,paid,due,status,created_by)
 values(p_supplier_id,p_reference,v_subtotal,p_paid,v_subtotal-p_paid,'received',auth.uid()) returning id into v_purchase;
 for item in select * from jsonb_array_elements(p_items) loop
   v_variant:=(item->>'variant_id')::uuid;v_qty:=(item->>'quantity')::int;v_cost:=(item->>'unit_cost')::numeric;
   select product_id into v_product from public.product_variants where id=v_variant;
   insert into public.purchase_items(purchase_id,variant_id,quantity,unit_cost) values(v_purchase,v_variant,v_qty,v_cost);
   insert into public.inventory(variant_id,quantity) values(v_variant,v_qty) on conflict(variant_id) do update set quantity=public.inventory.quantity+excluded.quantity,updated_at=now();
   insert into public.product_costs(product_id,cost_price) values(v_product,v_cost) on conflict(product_id) do update set cost_price=excluded.cost_price,updated_at=now();
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,reason,reference_id,actor_id) values(v_variant,'purchase',v_qty,'استلام مشتريات '||coalesce(p_reference,''),v_purchase,auth.uid());
 end loop;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'receive_purchase','purchase',v_purchase,jsonb_build_object('subtotal',v_subtotal,'paid',p_paid));
 return jsonb_build_object('id',v_purchase,'subtotal',v_subtotal,'due',v_subtotal-p_paid);
end $$;
revoke all on function public.receive_purchase(uuid,text,jsonb,numeric) from public;grant execute on function public.receive_purchase(uuid,text,jsonb,numeric) to authenticated;

create or replace function public.start_stocktake(p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; r record;
begin
 if not public.is_admin() then raise exception 'هذه العملية للأدمن فقط';end if;
 insert into public.stocktakes(status,notes,created_by) values('draft',p_notes,auth.uid()) returning id into v_id;
 for r in select variant_id,quantity from public.inventory loop
   insert into public.stocktake_items(stocktake_id,variant_id,system_quantity,actual_quantity) values(v_id,r.variant_id,r.quantity,r.quantity);
 end loop;
 return v_id;
end $$;
create or replace function public.set_stocktake_count(p_stocktake_id uuid,p_variant_id uuid,p_actual_quantity integer,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'هذه العملية للأدمن فقط';end if;
 if p_actual_quantity<0 then raise exception 'الكمية لا يمكن أن تكون سالبة';end if;
 update public.stocktake_items set actual_quantity=p_actual_quantity,reason=p_reason where stocktake_id=p_stocktake_id and variant_id=p_variant_id;
 if not found then raise exception 'الصنف غير موجود في جلسة الجرد';end if;
end $$;
create or replace function public.approve_stocktake(p_stocktake_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.stocktakes%rowtype; r record; v_diff int:=0;
begin
 if not public.is_admin() then raise exception 'هذه العملية للأدمن فقط';end if;
 select * into s from public.stocktakes where id=p_stocktake_id for update;
 if not found or s.status not in('draft','submitted') then raise exception 'جلسة الجرد غير قابلة للاعتماد';end if;
 for r in select * from public.stocktake_items where stocktake_id=p_stocktake_id loop
   if r.actual_quantity<>r.system_quantity then
     update public.inventory set quantity=r.actual_quantity,updated_at=now() where variant_id=r.variant_id;
     insert into public.stock_movements(variant_id,movement_type,quantity_delta,reason,reference_id,actor_id) values(r.variant_id,'adjustment',r.actual_quantity-r.system_quantity,coalesce(r.reason,'تسوية جرد'),p_stocktake_id,auth.uid());
     v_diff:=v_diff+abs(r.actual_quantity-r.system_quantity);
   end if;
 end loop;
 update public.stocktakes set status='approved',approved_by=auth.uid(),approved_at=now() where id=p_stocktake_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'approve_stocktake','stocktake',p_stocktake_id,jsonb_build_object('absolute_variance_units',v_diff));
 return jsonb_build_object('ok',true,'absolute_variance_units',v_diff);
end $$;
revoke all on function public.start_stocktake(text) from public;revoke all on function public.set_stocktake_count(uuid,uuid,integer,text) from public;revoke all on function public.approve_stocktake(uuid) from public;
grant execute on function public.start_stocktake(text),public.set_stocktake_count(uuid,uuid,integer,text),public.approve_stocktake(uuid) to authenticated;
