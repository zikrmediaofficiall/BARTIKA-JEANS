-- Enforce one open till per seller at the database level.
-- The application-side check is not sufficient under concurrent requests.

create unique index if not exists cash_sessions_one_open_per_seller_idx
  on public.cash_sessions(seller_id)
  where status = 'open';
