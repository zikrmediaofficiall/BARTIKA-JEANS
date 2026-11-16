-- Product and inventory media references. Binary files remain in Cloudinary.
alter table public.products
  add column if not exists image_url text,
  add column if not exists image_public_id text;

create index if not exists products_image_public_id_idx
  on public.products (image_public_id)
  where image_public_id is not null;
