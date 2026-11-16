-- Additional grants for the admin-only tables; RLS remains the authorization boundary.
grant select,insert,update,delete on public.product_costs to authenticated;
grant select,insert,update,delete on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
-- The seller role never receives SELECT on product_costs or sale_item_costs.
-- The RPC owner writes sale_item_costs and stock movement records transactionally.
