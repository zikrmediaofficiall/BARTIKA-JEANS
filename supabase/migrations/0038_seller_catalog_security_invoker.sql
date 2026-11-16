-- Make the seller catalog obey the caller's RLS policies instead of view-owner privileges.
alter view public.seller_catalog set (security_invoker = true);
revoke all on public.seller_catalog from anon;
grant select on public.seller_catalog to authenticated;
