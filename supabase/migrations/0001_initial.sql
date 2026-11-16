create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','seller');
create type public.payment_method as enum ('cash','instapay','visa');
create type public.sale_status as enum ('completed','void');
create type public.stock_movement_type as enum ('opening','purchase','sale','exchange_in','exchange_out','damage','adjustment');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 role public.app_role not null default 'seller',
 is_active boolean not null default true,
 max_discount_percent numeric(5,2) not null default 0 check(max_discount_percent between 0 and 20),
 created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active=true)
$$;

create table public.products (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 sku text not null unique,
 category text not null default 'جينز',
 sale_price numeric(12,2) not null check(sale_price>=0),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.product_costs(product_id uuid primary key references public.products(id),cost_price numeric(12,2) not null check(cost_price>=0),updated_at timestamptz not null default now());
create table public.product_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id),
 barcode text not null unique,
 size text,
 color text,
 created_at timestamptz not null default now()
);
create table public.inventory (
 variant_id uuid primary key references public.product_variants(id),
 quantity integer not null default 0 check(quantity>=0),
 updated_at timestamptz not null default now()
);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),
 variant_id uuid not null references public.product_variants(id),
 movement_type public.stock_movement_type not null,
 quantity_delta integer not null,
 reason text not null default '',
 reference_id uuid,
 actor_id uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 phone text unique,
 created_at timestamptz not null default now()
);
create table public.sales (
 id uuid primary key default gen_random_uuid(),
 invoice_number bigint generated always as identity unique,
 idempotency_key uuid not null unique,
 seller_id uuid not null references public.profiles(id),
 customer_id uuid references public.customers(id),
 subtotal numeric(12,2) not null,
 discount_percent numeric(5,2) not null default 0,
 discount_amount numeric(12,2) not null default 0,
 total numeric(12,2) not null,
 paid numeric(12,2) not null default 0,
 due numeric(12,2) not null default 0,
 status public.sale_status not null default 'completed',
 created_at timestamptz not null default now(),
 check(total>=0 and paid>=0 and due>=0 and abs(total-paid-due)<0.02)
);
create table public.sale_items (
 id uuid primary key default gen_random_uuid(),
 sale_id uuid not null references public.sales(id),
 variant_id uuid not null references public.product_variants(id),
 product_name_snapshot text not null,
 barcode_snapshot text not null,
 quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null,
 line_total numeric(12,2) not null,
 discount_amount numeric(12,2) not null default 0
);
create table public.sale_item_costs(
 sale_item_id uuid primary key references public.sale_items(id),
 unit_cost_snapshot numeric(12,2) not null
);
create table public.payments(
 id uuid primary key default gen_random_uuid(),
 sale_id uuid not null references public.sales(id),
 method public.payment_method not null,
 amount numeric(12,2) not null check(amount>0),
 reference text,
 created_at timestamptz not null default now()
);
create table public.audit_logs(
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create view public.seller_catalog with (security_invoker=true) as
 select p.id product_id,p.name product_name,p.sku,p.category,p.sale_price,v.id variant_id,v.barcode,v.size,v.color,coalesce(i.quantity,0) stock
 from public.products p join public.product_variants v on v.product_id=p.id left join public.inventory i on i.variant_id=v.id where p.is_active=true;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_item_costs enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create policy "profile self or admin read" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "admin manage profiles" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read products" on public.products for select to authenticated using(is_active or public.is_admin());
create policy "admin manage products" on public.products for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin only costs" on public.product_costs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read variants" on public.product_variants for select to authenticated using(true);
create policy "admin manage variants" on public.product_variants for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read inventory" on public.inventory for select to authenticated using(true);
create policy "admin manage inventory" on public.inventory for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read stock movements" on public.stock_movements for select to authenticated using(public.is_admin() or actor_id=auth.uid());
create policy "admin insert stock movements" on public.stock_movements for insert to authenticated with check(public.is_admin());
create policy "customer access" on public.customers for select to authenticated using(true);
create policy "admin manage customers" on public.customers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "sales admin or own seller" on public.sales for select to authenticated using(public.is_admin() or seller_id=auth.uid());
create policy "sale items admin or own seller" on public.sale_items for select to authenticated using(public.is_admin() or exists(select 1 from public.sales s where s.id=sale_id and s.seller_id=auth.uid()));
create policy "sale costs admin only" on public.sale_item_costs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "payments admin or own seller" on public.payments for select to authenticated using(public.is_admin() or exists(select 1 from public.sales s where s.id=sale_id and s.seller_id=auth.uid()));
create policy "audit admin only" on public.audit_logs for select to authenticated using(public.is_admin());

grant select on public.seller_catalog to authenticated;
grant select on public.profiles,public.products,public.product_variants,public.inventory,public.stock_movements,public.customers,public.sales,public.sale_items,public.payments to authenticated;
grant select,insert,update,delete on public.products,public.product_variants,public.inventory,public.customers to authenticated;
grant select on public.product_costs,public.sale_item_costs,public.audit_logs to authenticated;
grant insert on public.stock_movements to authenticated;

create or replace function public.create_sale(
 p_idempotency_key uuid,
 p_items jsonb,
 p_payments jsonb,
 p_discount_percent numeric default 0,
 p_customer_phone text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid(); v_role public.app_role; v_limit numeric; v_subtotal numeric:=0; v_discount numeric:=0; v_total numeric:=0; v_paid numeric:=0;
 v_sale_id uuid; v_invoice bigint; item jsonb; v_variant uuid; v_qty int; v_price numeric; v_cost numeric; v_name text; v_barcode text; v_stock int; v_line numeric; v_customer uuid;
begin
 if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
 select role,max_discount_percent into v_role,v_limit from public.profiles where id=v_user and is_active=true;
 if v_role is null then raise exception 'الحساب غير مفعل'; end if;
 if p_discount_percent<0 or p_discount_percent>20 then raise exception 'الخصم خارج الحدود'; end if;
 if v_role<>'admin' and p_discount_percent>coalesce(v_limit,0) then raise exception 'غير مصرح بهذا الخصم'; end if;
 select id into v_sale_id from public.sales where idempotency_key=p_idempotency_key;
 if v_sale_id is not null then return (select jsonb_build_object('id',id,'invoice_number',invoice_number,'total',total) from public.sales where id=v_sale_id); end if;
 for item in select * from jsonb_array_elements(p_items) loop
   v_variant:=(item->>'variant_id')::uuid; v_qty:=(item->>'quantity')::int;
   if v_qty<=0 then raise exception 'كمية غير صحيحة'; end if;
   select p.sale_price,p.name,v.barcode,coalesce(pc.cost_price,0) into v_price,v_name,v_barcode,v_cost
   from public.product_variants v join public.products p on p.id=v.product_id
   left join public.product_costs pc on pc.product_id=p.id where v.id=v_variant and p.is_active=true;
   if not found then raise exception 'الصنف غير موجود'; end if;
   select quantity into v_stock from public.inventory where variant_id=v_variant for update;
   if coalesce(v_stock,0)<v_qty then raise exception 'الكمية غير كافية للمخزون: %',v_name; end if;
   v_line:=round(v_price*v_qty,2); v_subtotal:=v_subtotal+v_line;
 end loop;
 v_discount:=round(v_subtotal*p_discount_percent/100,2); v_total:=v_subtotal-v_discount;
 select coalesce(sum((x->>'amount')::numeric),0) into v_paid from jsonb_array_elements(p_payments) x;
 if v_paid<=0 or v_paid>v_total then raise exception 'قيمة الدفع غير صحيحة'; end if;
 if v_paid<v_total and p_customer_phone is null then raise exception 'يلزم رقم العميل عند وجود مبلغ متبقٍ'; end if;
 if p_customer_phone is not null then
   insert into public.customers(name,phone) values('عميل',p_customer_phone) on conflict(phone) do update set phone=excluded.phone returning id into v_customer;
 end if;
 insert into public.sales(idempotency_key,seller_id,customer_id,subtotal,discount_percent,discount_amount,total,paid,due)
 values(p_idempotency_key,v_user,v_customer,v_subtotal,p_discount_percent,v_discount,v_total,v_paid,v_total-v_paid)
 returning id,invoice_number into v_sale_id,v_invoice;
 for item in select * from jsonb_array_elements(p_items) loop
   v_variant:=(item->>'variant_id')::uuid; v_qty:=(item->>'quantity')::int;
   select p.sale_price,p.name,v.barcode,coalesce(pc.cost_price,0) into v_price,v_name,v_barcode,v_cost
   from public.product_variants v join public.products p on p.id=v.product_id left join public.product_costs pc on pc.product_id=p.id where v.id=v_variant;
   v_line:=round(v_price*v_qty,2);
   insert into public.sale_items(sale_id,variant_id,product_name_snapshot,barcode_snapshot,quantity,unit_price,line_total,discount_amount)
   values(v_sale_id,v_variant,v_name,v_barcode,v_qty,v_price,v_line,round(v_discount*(v_line/v_subtotal),2))
   returning id into v_variant;
   insert into public.sale_item_costs(sale_item_id,unit_cost_snapshot) values(v_variant,v_cost);
   update public.inventory set quantity=quantity-v_qty,updated_at=now() where variant_id=(item->>'variant_id')::uuid;
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,reason,reference_id,actor_id)
   values((item->>'variant_id')::uuid,'sale',-v_qty,'بيع فاتورة '||v_invoice,v_sale_id,v_user);
 end loop;
 for item in select * from jsonb_array_elements(p_payments) loop
   insert into public.payments(sale_id,method,amount,reference) values(v_sale_id,(item->>'method')::public.payment_method,(item->>'amount')::numeric,nullif(item->>'reference',''));
 end loop;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(v_user,'create_sale','sale',v_sale_id,jsonb_build_object('invoice_number',v_invoice,'total',v_total));
 return jsonb_build_object('id',v_sale_id,'invoice_number',v_invoice,'total',v_total,'paid',v_paid,'due',v_total-v_paid);
end $$;
revoke all on function public.create_sale(uuid,jsonb,jsonb,numeric,text) from public;
grant execute on function public.create_sale(uuid,jsonb,jsonb,numeric,text) to authenticated;
