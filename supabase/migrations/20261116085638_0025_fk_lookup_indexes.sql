-- Cover the remaining foreign-key lookup paths flagged by Supabase performance advisors.
create index if not exists customer_credit_accounts_updated_by_idx
  on public.customer_credit_accounts(updated_by)
  where updated_by is not null;

create index if not exists exchange_settlements_created_by_idx
  on public.exchange_settlements(created_by)
  where created_by is not null;

create index if not exists supplier_payments_created_by_idx
  on public.supplier_payments(created_by);
