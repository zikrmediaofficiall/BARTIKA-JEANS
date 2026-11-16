-- Role expansion and explicit manager permission grants.
-- This migration does not grant managers any access by default.

alter type public.app_role add value if not exists 'manager';

alter table public.profiles
  drop constraint if exists profiles_max_discount_percent_check;

alter table public.profiles
  add constraint profiles_max_discount_percent_check
  check (max_discount_percent between 0 and 100);

create table public.manager_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null check (permission_key in (
    'dashboard.read',
    'sales.read_all',
    'inventory.read_movements',
    'purchases.read',
    'stocktake.read',
    'cash.read_all',
    'expenses.read',
    'customers.read',
    'staff.read',
    'exchanges.read',
    'orders.read',
    'orders.manage',
    'reports.read'
  )),
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create index manager_permissions_user_idx
  on public.manager_permissions(user_id);

alter table public.manager_permissions enable row level security;

create policy "manager permissions read own or admin"
  on public.manager_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "admin manage manager permissions"
  on public.manager_permissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.manager_permissions to authenticated;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.profiles p
      join public.manager_permissions mp on mp.user_id = p.id
      where p.id = auth.uid()
        and p.is_active = true
        and p.role::text = 'manager'
        and mp.permission_key = p_permission
    );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.set_manager_permissions(
  p_manager_id uuid,
  p_permission_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_keys text[] := coalesce(p_permission_keys, array[]::text[]);
  v_allowed constant text[] := array[
    'dashboard.read',
    'sales.read_all',
    'inventory.read_movements',
    'purchases.read',
    'stocktake.read',
    'cash.read_all',
    'expenses.read',
    'customers.read',
    'staff.read',
    'exchanges.read',
    'orders.read',
    'orders.manage',
    'reports.read'
  ];
begin
  if not public.is_admin() then
    raise exception 'هذه العملية للأدمن فقط';
  end if;

  select role::text into v_role
  from public.profiles
  where id = p_manager_id and is_active = true;

  if v_role is distinct from 'manager' then
    raise exception 'يجب اختيار حساب مدير نشط';
  end if;

  if exists (
    select 1 from unnest(v_keys) as requested(permission_key)
    where not (requested.permission_key = any(v_allowed))
  ) then
    raise exception 'توجد صلاحية غير معروفة';
  end if;

  delete from public.manager_permissions where user_id = p_manager_id;

  insert into public.manager_permissions(user_id, permission_key, granted_by)
  select p_manager_id, requested.permission_key, auth.uid()
  from (
    select distinct unnest(v_keys) as permission_key
  ) requested;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'set_manager_permissions',
    'profile',
    p_manager_id,
    jsonb_build_object('permissions', to_jsonb(v_keys))
  );

  return jsonb_build_object('ok', true, 'permissions_count', cardinality(v_keys));
end;
$$;

revoke all on function public.set_manager_permissions(uuid, text[]) from public;
grant execute on function public.set_manager_permissions(uuid, text[]) to authenticated;

-- Manager permissions are read-only grants. Sensitive write operations remain Admin-only
-- until their individual workflows and RPC checks are explicitly implemented.
create policy "manager read all sales with permission"
  on public.sales for select to authenticated
  using (public.has_permission('sales.read_all'));

create policy "manager read sale items with permission"
  on public.sale_items for select to authenticated
  using (
    public.has_permission('sales.read_all')
    or exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
    )
  );

create policy "manager read payments with permission"
  on public.payments for select to authenticated
  using (
    public.has_permission('sales.read_all')
    or exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
    )
  );

create policy "manager read stock movements with permission"
  on public.stock_movements for select to authenticated
  using (public.has_permission('inventory.read_movements') or actor_id = auth.uid());

create policy "manager read suppliers with permission"
  on public.suppliers for select to authenticated
  using (public.has_permission('purchases.read'));

create policy "manager read purchase invoices with permission"
  on public.purchase_invoices for select to authenticated
  using (public.has_permission('purchases.read'));

create policy "manager read purchase items with permission"
  on public.purchase_items for select to authenticated
  using (public.has_permission('purchases.read'));

create policy "manager read stocktakes with permission"
  on public.stocktakes for select to authenticated
  using (public.has_permission('stocktake.read'));

create policy "manager read stocktake items with permission"
  on public.stocktake_items for select to authenticated
  using (public.has_permission('stocktake.read'));

create policy "manager read cash sessions with permission"
  on public.cash_sessions for select to authenticated
  using (public.has_permission('cash.read_all') or seller_id = auth.uid());

create policy "manager read expenses with permission"
  on public.expenses for select to authenticated
  using (public.has_permission('expenses.read'));

create policy "manager read customers with permission"
  on public.customers for select to authenticated
  using (public.has_permission('customers.read'));

create policy "manager read profiles with permission"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.has_permission('staff.read'));

create policy "manager read exchanges with permission"
  on public.exchanges for select to authenticated
  using (public.has_permission('exchanges.read'));

create policy "manager read exchange items with permission"
  on public.exchange_items for select to authenticated
  using (public.has_permission('exchanges.read'));

create policy "manager read audit logs is admin only"
  on public.audit_logs for select to authenticated
  using (public.is_admin());

-- The original broad customer SELECT policy exposed every customer profile to every
-- authenticated seller. Replace it with own-customer history or explicit manager grant.
drop policy if exists "customer access" on public.customers;
create policy "seller own customers and manager permitted customers"
  on public.customers for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('customers.read')
    or exists (
      select 1 from public.sales s
      where s.customer_id = customers.id
        and s.seller_id = auth.uid()
    )
  );

-- Extend the existing immutable-history audit trigger to permission grant changes.
create trigger audit_manager_permissions
  after insert or update or delete on public.manager_permissions
  for each row execute function public.audit_sensitive_change();

-- Allow managers with explicit report access to see aggregate/report source rows only.
-- Cost snapshots and product_costs remain restricted to Admin.
