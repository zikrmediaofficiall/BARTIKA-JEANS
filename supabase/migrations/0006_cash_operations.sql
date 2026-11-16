create or replace function public.open_cash_session(p_opening_cash numeric default 0) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then raise exception 'يجب تسجيل الدخول';end if;
 if p_opening_cash<0 then raise exception 'رصيد البداية غير صحيح';end if;
 if exists(select 1 from public.cash_sessions where seller_id=auth.uid() and status='open') then raise exception 'لديك وردية مفتوحة بالفعل';end if;
 insert into public.cash_sessions(seller_id,opening_cash) values(auth.uid(),p_opening_cash) returning id into v_id;
 return v_id;
end $$;
create or replace function public.close_cash_session(p_session_id uuid,p_counted_cash numeric) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cash_sessions%rowtype; v_sales numeric:=0;v_expenses numeric:=0;v_expected numeric:=0;
begin
 select * into s from public.cash_sessions where id=p_session_id for update;
 if not found then raise exception 'الوردية غير موجودة';end if;
 if s.seller_id<>auth.uid() and not public.is_admin() then raise exception 'غير مصرح';end if;
 if s.status<>'open' then raise exception 'الوردية مغلقة بالفعل';end if;
 select coalesce(sum(p.amount),0) into v_sales from public.payments p join public.sales x on x.id=p.sale_id where x.seller_id=s.seller_id and x.created_at>=s.opened_at and x.created_at<=now() and x.status='completed' and p.method='cash';
 select coalesce(sum(e.amount),0) into v_expenses from public.expenses e where e.created_by=s.seller_id and e.created_at>=s.opened_at and e.created_at<=now() and e.payment_method='cash';
 v_expected:=s.opening_cash+v_sales-v_expenses;
 update public.cash_sessions set expected_cash=v_expected,counted_cash=p_counted_cash,variance=p_counted_cash-v_expected,status='closed',closed_at=now() where id=p_session_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'close_cash_session','cash_session',p_session_id,jsonb_build_object('expected',v_expected,'counted',p_counted_cash,'variance',p_counted_cash-v_expected));
 return jsonb_build_object('expected',v_expected,'counted',p_counted_cash,'variance',p_counted_cash-v_expected);
end $$;
create or replace function public.add_expense(p_category text,p_description text,p_amount numeric,p_method public.payment_method) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'المصروفات للأدمن فقط';end if;
 if p_amount<=0 or length(trim(p_category))=0 or length(trim(p_description))=0 then raise exception 'بيانات المصروف غير صحيحة';end if;
 insert into public.expenses(category,description,amount,payment_method,created_by) values(p_category,p_description,p_amount,p_method,auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'add_expense','expense',v_id,jsonb_build_object('amount',p_amount,'method',p_method));
 return v_id;
end $$;
revoke all on function public.open_cash_session(numeric),public.close_cash_session(uuid,numeric),public.add_expense(text,text,numeric,public.payment_method) from public;
grant execute on function public.open_cash_session(numeric),public.close_cash_session(uuid,numeric),public.add_expense(text,text,numeric,public.payment_method) to authenticated;
