create or replace function public.get_public_store_settings()
returns table (
  store_name text,
  store_name_ar text,
  logo_url text,
  phone text,
  address text,
  whatsapp_url text,
  facebook_url text,
  instagram_url text,
  tiktok_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.store_name,s.store_name_ar,s.logo_url,s.phone,s.address,
    s.whatsapp_url,s.facebook_url,s.instagram_url,s.tiktok_url
  from public.store_settings s
  where s.id = 1
  limit 1;
$$;

revoke all on function public.get_public_store_settings() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;
