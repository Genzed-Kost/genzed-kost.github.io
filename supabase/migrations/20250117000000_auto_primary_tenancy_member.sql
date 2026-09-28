-- ============================================================
-- Ketauan pas tes live: migrasi tenancy_co_members cuma nge-backfill
-- kontrak yang SUDAH ADA saat migrasi jalan — kontrak BARU yang dibuat
-- setelahnya nggak otomatis dapat baris tenancy_members (is_primary),
-- padahal RLS invoices/logika co-tenant bergantung ke situ. Trigger ini
-- nutup celahnya: setiap insert tenancies baru otomatis bikin 1 baris
-- tenancy_members (100%, is_primary=true) buat tenant_id-nya.
-- ============================================================

create or replace function public.create_primary_tenancy_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenancy_members (tenancy_id, tenant_id, share_percent, is_primary)
  values (new.id, new.tenant_id, 100, true)
  on conflict (tenancy_id, tenant_id) do nothing;
  return new;
end;
$$;

create trigger trg_tenancies_create_primary_member
  after insert on public.tenancies
  for each row execute function public.create_primary_tenancy_member();
