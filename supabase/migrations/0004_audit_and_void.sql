create or replace function public.audit_sensitive_change() returns trigger language plpgsql security definer set search_path=public as $$
declare v_row jsonb; v_id uuid;
begin
 if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
 if tg_table_name='product_costs' then v_id:=(v_row->>'product_id')::uuid;
 elsif tg_table_name='profiles' then v_id:=(v_row->>'id')::uuid;
 else v_id:=(v_row->>'id')::uuid; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
 values(auth.uid(),lower(tg_op),tg_table_name,v_id,jsonb_build_object('new',case when tg_op='DELETE' then null else v_row end,'old',case when tg_op='INSERT' then null else to_jsonb(old) end));
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_sensitive_change();
create trigger audit_product_costs after insert or update or delete on public.product_costs for each row execute function public.audit_sensitive_change();
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_sensitive_change();
create trigger audit_inventory after insert or update or delete on public.inventory for each row execute function public.audit_sensitive_change();

create or replace function public.void_sale(p_sale_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.sales%rowtype; line record;
begin
 if not public.is_admin() then raise exception 'هذه العملية للأدمن فقط'; end if;
 if length(trim(coalesce(p_reason,'')))<4 then raise exception 'اكتب سبب الإلغاء'; end if;
 select * into s from public.sales where id=p_sale_id for update;
 if not found then raise exception 'الفاتورة غير موجودة'; end if;
 if s.status='void' then return jsonb_build_object('ok',true,'already_void',true); end if;
 for line in select variant_id,quantity from public.sale_items where sale_id=p_sale_id loop
   update public.inventory set quantity=quantity+line.quantity,updated_at=now() where variant_id=line.variant_id;
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,reason,reference_id,actor_id)
   values(line.variant_id,'adjustment',line.quantity,'عكس فاتورة '||s.invoice_number||': '||p_reason,p_sale_id,auth.uid());
 end loop;
 update public.sales set status='void' where id=p_sale_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'void_sale','sale',p_sale_id,jsonb_build_object('reason',p_reason,'invoice_number',s.invoice_number));
 return jsonb_build_object('ok',true,'invoice_number',s.invoice_number);
end $$;
revoke all on function public.void_sale(uuid,text) from public;
grant execute on function public.void_sale(uuid,text) to authenticated;
