create or replace function public.get_public_instapay_settings()
returns table (
  instapay_ipa text,
  instapay_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    nullif(trim(s.instapay_ipa), ''),
    nullif(trim(s.instapay_url), '')
  from public.store_settings as s
  where s.id = 1
  limit 1;
$$;

revoke all on function public.get_public_instapay_settings() from public;
grant execute on function public.get_public_instapay_settings() to anon, authenticated;
