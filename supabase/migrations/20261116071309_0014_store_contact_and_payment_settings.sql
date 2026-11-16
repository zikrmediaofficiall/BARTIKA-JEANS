-- Store-owned public contact and payment details for BARTIKA JEANS.
-- These values are stored only in the isolated BARTIKA Supabase project.

alter table public.store_settings
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists whatsapp_url text,
  add column if not exists instapay_ipa text,
  add column if not exists instapay_url text;

comment on column public.store_settings.facebook_url is 'Official public Facebook page URL';
comment on column public.store_settings.instagram_url is 'Official public Instagram profile URL';
comment on column public.store_settings.tiktok_url is 'Official public TikTok profile URL';
comment on column public.store_settings.whatsapp_url is 'Official WhatsApp contact URL';
comment on column public.store_settings.instapay_ipa is 'Public InstaPay payment identifier configured by the store owner';
comment on column public.store_settings.instapay_url is 'Official InstaPay transfer link configured by the store owner';

update public.store_settings
set facebook_url = 'https://www.facebook.com/share/1DxZ2dfneS/',
    instagram_url = 'https://www.instagram.com/bar_tika_store/',
    tiktok_url = 'https://www.tiktok.com/@bartika_store',
    whatsapp_url = 'https://wa.me/message/MGMD55EO6GLAO1',
    instapay_ipa = 'shadyalaahassan@instapay',
    instapay_url = 'https://ipn.eg/S/shadyalaahassan/instapay/9cMxN7'
where id = 1;
