-- Harden the exposed RPC surface, optimize foreign-key joins, and consolidate RLS.
-- All changes are scoped to the standalone BARTIKA JEANS Supabase database.

-- Prevent anonymous access to SECURITY DEFINER RPCs. Authenticated access remains
-- only where the application needs a logged-in RPC and the function enforces roles.
revoke all on all functions in schema public from anon;

-- Trigger-only functions must never be callable through PostgREST.
revoke all on function public.audit_sensitive_change() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Keep future functions created by the migration owner from inheriting anon execution.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- Foreign-key indexes used by POS, inventory, cash closing, audit and operational joins.
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists cash_sessions_seller_status_opened_idx on public.cash_sessions(seller_id, status, opened_at desc);
create index if not exists exchange_items_exchange_id_idx on public.exchange_items(exchange_id);
create index if not exists exchange_items_replacement_variant_id_idx on public.exchange_items(replacement_variant_id);
create index if not exists exchange_items_returned_variant_id_idx on public.exchange_items(returned_variant_id);
create index if not exists exchanges_created_by_idx on public.exchanges(created_by);
create index if not exists exchanges_original_sale_id_idx on public.exchanges(original_sale_id);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists manager_permissions_granted_by_idx on public.manager_permissions(granted_by);
create index if not exists payments_sale_id_idx on public.payments(sale_id);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists purchase_invoices_created_by_idx on public.purchase_invoices(created_by);
create index if not exists purchase_invoices_supplier_id_idx on public.purchase_invoices(supplier_id);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create index if not exists purchase_items_variant_id_idx on public.purchase_items(variant_id);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);
create index if not exists sale_items_variant_id_idx on public.sale_items(variant_id);
create index if not exists sales_customer_id_idx on public.sales(customer_id);
create index if not exists sales_seller_created_at_idx on public.sales(seller_id, created_at desc);
create index if not exists stock_movements_actor_id_idx on public.stock_movements(actor_id);
create index if not exists stock_movements_variant_id_created_at_idx on public.stock_movements(variant_id, created_at desc);
create index if not exists stocktake_items_stocktake_id_idx on public.stocktake_items(stocktake_id);
create index if not exists stocktake_items_variant_id_idx on public.stocktake_items(variant_id);
create index if not exists stocktakes_approved_by_idx on public.stocktakes(approved_by);
create index if not exists stocktakes_created_by_idx on public.stocktakes(created_by);

-- AUDIT LOGS: one effective SELECT policy; remove an identical duplicate.
drop policy if exists "manager read audit logs is admin only" on public.audit_logs;

-- CASH SESSIONS
drop policy if exists "cash admin manage" on public.cash_sessions;
drop policy if exists "cash own or admin" on public.cash_sessions;
drop policy if exists "manager read cash sessions with permission" on public.cash_sessions;
create policy "cash sessions scoped read" on public.cash_sessions
  for select to authenticated
  using (
    (select public.is_admin())
    or seller_id = (select auth.uid())
    or (select public.has_permission('cash.read_all'))
  );
create policy "cash sessions admin insert" on public.cash_sessions
  for insert to authenticated with check ((select public.is_admin()));
create policy "cash sessions admin update" on public.cash_sessions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "cash sessions admin delete" on public.cash_sessions
  for delete to authenticated using ((select public.is_admin()));

-- CUSTOMERS
drop policy if exists "admin manage customers" on public.customers;
drop policy if exists "manager read customers with permission" on public.customers;
drop policy if exists "seller own customers and manager permitted customers" on public.customers;
create policy "customers scoped read" on public.customers
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('customers.read'))
    or exists (
      select 1 from public.sales s
      where s.customer_id = customers.id
        and s.seller_id = (select auth.uid())
    )
  );
create policy "customers admin insert" on public.customers
  for insert to authenticated with check ((select public.is_admin()));
create policy "customers admin update" on public.customers
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "customers admin delete" on public.customers
  for delete to authenticated using ((select public.is_admin()));

-- EXCHANGE ITEMS
drop policy if exists "admin exchange items" on public.exchange_items;
drop policy if exists "manager read exchange items with permission" on public.exchange_items;
create policy "exchange items scoped read" on public.exchange_items
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('exchanges.read'))
  );
create policy "exchange items admin insert" on public.exchange_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "exchange items admin update" on public.exchange_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "exchange items admin delete" on public.exchange_items
  for delete to authenticated using ((select public.is_admin()));

-- EXCHANGES
drop policy if exists "admin exchanges" on public.exchanges;
drop policy if exists "manager read exchanges with permission" on public.exchanges;
create policy "exchanges scoped read" on public.exchanges
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('exchanges.read'))
  );
create policy "exchanges admin insert" on public.exchanges
  for insert to authenticated with check ((select public.is_admin()));
create policy "exchanges admin update" on public.exchanges
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "exchanges admin delete" on public.exchanges
  for delete to authenticated using ((select public.is_admin()));

-- EXPENSES
drop policy if exists "admin expenses" on public.expenses;
drop policy if exists "manager read expenses with permission" on public.expenses;
create policy "expenses scoped read" on public.expenses
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('expenses.read'))
  );
create policy "expenses admin insert" on public.expenses
  for insert to authenticated with check ((select public.is_admin()));
create policy "expenses admin update" on public.expenses
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "expenses admin delete" on public.expenses
  for delete to authenticated using ((select public.is_admin()));

-- INVENTORY
drop policy if exists "admin manage inventory" on public.inventory;
drop policy if exists "authenticated read inventory" on public.inventory;
create policy "inventory authenticated read" on public.inventory
  for select to authenticated using (true);
create policy "inventory admin insert" on public.inventory
  for insert to authenticated with check ((select public.is_admin()));
create policy "inventory admin update" on public.inventory
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "inventory admin delete" on public.inventory
  for delete to authenticated using ((select public.is_admin()));

-- MANAGER PERMISSIONS
drop policy if exists "admin manage manager permissions" on public.manager_permissions;
drop policy if exists "manager permissions read own or admin" on public.manager_permissions;
create policy "manager permissions scoped read" on public.manager_permissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );
create policy "manager permissions admin insert" on public.manager_permissions
  for insert to authenticated with check ((select public.is_admin()));
create policy "manager permissions admin update" on public.manager_permissions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "manager permissions admin delete" on public.manager_permissions
  for delete to authenticated using ((select public.is_admin()));

-- PAYMENTS
drop policy if exists "manager read payments with permission" on public.payments;
drop policy if exists "payments admin or own seller" on public.payments;
create policy "payments scoped read" on public.payments
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('sales.read_all'))
    or (select public.has_permission('reports.read'))
    or exists (
      select 1 from public.sales s
      where s.id = payments.sale_id
        and s.seller_id = (select auth.uid())
    )
  );

-- PRODUCT VARIANTS
drop policy if exists "admin manage variants" on public.product_variants;
drop policy if exists "authenticated read variants" on public.product_variants;
create policy "product variants authenticated read" on public.product_variants
  for select to authenticated using (true);
create policy "product variants admin insert" on public.product_variants
  for insert to authenticated with check ((select public.is_admin()));
create policy "product variants admin update" on public.product_variants
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "product variants admin delete" on public.product_variants
  for delete to authenticated using ((select public.is_admin()));

-- PRODUCTS
drop policy if exists "admin manage products" on public.products;
drop policy if exists "authenticated read products" on public.products;
create policy "products active authenticated read" on public.products
  for select to authenticated
  using (is_active or (select public.is_admin()));
create policy "products admin insert" on public.products
  for insert to authenticated with check ((select public.is_admin()));
create policy "products admin update" on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "products admin delete" on public.products
  for delete to authenticated using ((select public.is_admin()));

-- PROFILES
drop policy if exists "admin manage profiles" on public.profiles;
drop policy if exists "manager read profiles with permission" on public.profiles;
drop policy if exists "profile self or admin read" on public.profiles;
create policy "profiles scoped read" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.has_permission('staff.read'))
  );
create policy "profiles admin insert" on public.profiles
  for insert to authenticated with check ((select public.is_admin()));
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "profiles admin delete" on public.profiles
  for delete to authenticated using ((select public.is_admin()));

-- PURCHASE INVOICES
drop policy if exists "admin purchases" on public.purchase_invoices;
drop policy if exists "manager read purchase invoices with permission" on public.purchase_invoices;
create policy "purchase invoices scoped read" on public.purchase_invoices
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('purchases.read'))
  );
create policy "purchase invoices admin insert" on public.purchase_invoices
  for insert to authenticated with check ((select public.is_admin()));
create policy "purchase invoices admin update" on public.purchase_invoices
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "purchase invoices admin delete" on public.purchase_invoices
  for delete to authenticated using ((select public.is_admin()));

-- PURCHASE ITEMS
drop policy if exists "admin purchase items" on public.purchase_items;
drop policy if exists "manager read purchase items with permission" on public.purchase_items;
create policy "purchase items scoped read" on public.purchase_items
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('purchases.read'))
  );
create policy "purchase items admin insert" on public.purchase_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "purchase items admin update" on public.purchase_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "purchase items admin delete" on public.purchase_items
  for delete to authenticated using ((select public.is_admin()));

-- SALE ITEMS
drop policy if exists "manager read sale items with permission" on public.sale_items;
drop policy if exists "sale items admin or own seller" on public.sale_items;
create policy "sale items scoped read" on public.sale_items
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('sales.read_all'))
    or (select public.has_permission('reports.read'))
    or exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.seller_id = (select auth.uid())
    )
  );

-- SALES
drop policy if exists "manager read all sales with permission" on public.sales;
drop policy if exists "manager report sales with permission" on public.sales;
drop policy if exists "sales admin or own seller" on public.sales;
create policy "sales scoped read" on public.sales
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('sales.read_all'))
    or (select public.has_permission('reports.read'))
    or seller_id = (select auth.uid())
  );

-- STOCK MOVEMENTS
drop policy if exists "authenticated read stock movements" on public.stock_movements;
drop policy if exists "manager read stock movements with permission" on public.stock_movements;
create policy "stock movements scoped read" on public.stock_movements
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('inventory.read'))
    or actor_id = (select auth.uid())
  );

-- STOCKTAKE ITEMS
drop policy if exists "admin stocktake items" on public.stocktake_items;
drop policy if exists "manager read stocktake items with permission" on public.stocktake_items;
create policy "stocktake items scoped read" on public.stocktake_items
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('stocktake.read'))
  );
create policy "stocktake items admin insert" on public.stocktake_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "stocktake items admin update" on public.stocktake_items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "stocktake items admin delete" on public.stocktake_items
  for delete to authenticated using ((select public.is_admin()));

-- STOCKTAKES
drop policy if exists "admin stocktakes" on public.stocktakes;
drop policy if exists "manager read stocktakes with permission" on public.stocktakes;
create policy "stocktakes scoped read" on public.stocktakes
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('stocktake.read'))
  );
create policy "stocktakes admin insert" on public.stocktakes
  for insert to authenticated with check ((select public.is_admin()));
create policy "stocktakes admin update" on public.stocktakes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "stocktakes admin delete" on public.stocktakes
  for delete to authenticated using ((select public.is_admin()));

-- STORE SETTINGS
drop policy if exists "settings admin" on public.store_settings;
drop policy if exists "settings read" on public.store_settings;
create policy "store settings authenticated read" on public.store_settings
  for select to authenticated using (true);
create policy "store settings admin insert" on public.store_settings
  for insert to authenticated with check ((select public.is_admin()));
create policy "store settings admin update" on public.store_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "store settings admin delete" on public.store_settings
  for delete to authenticated using ((select public.is_admin()));

-- SUPPLIERS
drop policy if exists "admin suppliers" on public.suppliers;
drop policy if exists "manager read suppliers with permission" on public.suppliers;
create policy "suppliers scoped read" on public.suppliers
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('purchases.read'))
  );
create policy "suppliers admin insert" on public.suppliers
  for insert to authenticated with check ((select public.is_admin()));
create policy "suppliers admin update" on public.suppliers
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "suppliers admin delete" on public.suppliers
  for delete to authenticated using ((select public.is_admin()));
