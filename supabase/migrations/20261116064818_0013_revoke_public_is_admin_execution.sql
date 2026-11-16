-- The public schema's is_admin helper is used by RLS and authenticated RPCs.
-- It must not be callable by unauthenticated PostgREST clients.
revoke execute on function public.is_admin() from public, anon;
