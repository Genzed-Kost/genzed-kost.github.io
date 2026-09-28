-- ============================================================
-- Prioritas 4: split payment kamar berdua (co-tenant).
--
-- tenancies.tenant_id TETAP ADA (jadi "penghuni utama") — semua kode lama
-- yang baca kolom ini (dashboard, mesin tagihan, checkout, dll) jalan
-- TANPA PERUBAHAN untuk kontrak satu-penghuni. tenancy_members cuma
-- tambahan buat tenancy yang punya lebih dari 1 penghuni.
--
-- invoice_shares cuma dibuat untuk invoice milik tenancy yang anggotanya
-- >1 — invoice kontrak satu-penghuni nggak pernah punya baris di tabel
-- ini sama sekali, jadi nol risiko ke alur yang sudah ada.
-- ============================================================

create table public.tenancy_members (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  share_percent numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenancy_id, tenant_id)
);
create index tenancy_members_tenancy_id_idx on public.tenancy_members(tenancy_id);
create index tenancy_members_tenant_id_idx on public.tenancy_members(tenant_id);

alter table public.tenancy_members enable row level security;
create policy "tenancy_members_select_own_or_admin" on public.tenancy_members
  for select using (tenant_id = auth.uid() or public.is_admin());
create policy "tenancy_members_write_admin_only" on public.tenancy_members
  for all using (public.is_admin()) with check (public.is_admin());

-- Backfill: setiap kontrak yang sudah ada otomatis jadi anggota tunggal 100%.
insert into public.tenancy_members (tenancy_id, tenant_id, share_percent, is_primary)
select id, tenant_id, 100, true from public.tenancies
on conflict (tenancy_id, tenant_id) do nothing;

create table public.invoice_shares (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  share_percent numeric(5,2) not null,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, tenant_id)
);
create index invoice_shares_invoice_id_idx on public.invoice_shares(invoice_id);
create index invoice_shares_tenant_id_idx on public.invoice_shares(tenant_id);

alter table public.invoice_shares enable row level security;
create policy "invoice_shares_select_own_or_admin" on public.invoice_shares
  for select using (tenant_id = auth.uid() or public.is_admin());
create policy "invoice_shares_write_admin_only" on public.invoice_shares
  for all using (public.is_admin()) with check (public.is_admin());

create trigger trg_invoice_shares_updated_at before update on public.invoice_shares
  for each row execute function public.set_updated_at();

-- Co-tenant (bukan invoices.tenant_id utama) juga perlu bisa lihat invoice
-- yang dia punya porsi di dalamnya.
drop policy "invoices_select_own_or_admin" on public.invoices;
create policy "invoices_select_own_or_admin" on public.invoices
  for select using (
    tenant_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.invoice_shares s where s.invoice_id = invoices.id and s.tenant_id = auth.uid())
  );
