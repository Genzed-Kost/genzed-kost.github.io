-- Prioritas 5 (Perbaikan Keandalan):
-- 1) Tabel buat catat selisih status pembayaran gateway vs Midtrans asli (rekonsiliasi).
-- 2) Tabel buat catat percobaan login (dasar rate-limit / kunci akun).
-- 3) payment_method_fees diperluas jadi per-channel Midtrans (VA per bank, e-wallet,
--    QRIS, gerai retail) — sebelumnya cuma 1 angka flat buat semua metode gateway.

create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  our_status text not null,
  midtrans_status text not null,
  detected_at timestamptz not null default now()
);
create index payment_reconciliations_payment_id_idx on public.payment_reconciliations (payment_id);

alter table public.payment_reconciliations enable row level security;
create policy payment_reconciliations_admin_all on public.payment_reconciliations
  for all using (public.is_admin()) with check (public.is_admin());

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_identifier_idx on public.login_attempts (identifier, created_at desc);

-- Sengaja TANPA policy sama sekali (RLS aktif, 0 policy) — tabel ini cuma boleh
-- disentuh Edge Function login lewat service_role, nggak boleh kebaca/ketulis klien.
alter table public.login_attempts enable row level security;

update public.settings
set value = jsonb_build_object(
  'manual', coalesce(value->'manual', '{"type":"nominal","value":0}'::jsonb),
  'gateway_channels', jsonb_build_object(
    'bca_va', jsonb_build_object('type', 'nominal', 'value', 4000, 'label', 'VA BCA'),
    'bni_va', jsonb_build_object('type', 'nominal', 'value', 4000, 'label', 'VA BNI'),
    'bri_va', jsonb_build_object('type', 'nominal', 'value', 4000, 'label', 'VA BRI'),
    'permata_va', jsonb_build_object('type', 'nominal', 'value', 4000, 'label', 'VA Permata'),
    'other_va', jsonb_build_object('type', 'nominal', 'value', 4000, 'label', 'VA Bank Lain'),
    'gopay', jsonb_build_object('type', 'percent', 'value', 2, 'label', 'GoPay'),
    'shopeepay', jsonb_build_object('type', 'percent', 'value', 2, 'label', 'ShopeePay'),
    'qris', jsonb_build_object('type', 'percent', 'value', 0.7, 'label', 'QRIS'),
    'indomaret', jsonb_build_object('type', 'nominal', 'value', 5000, 'label', 'Indomaret'),
    'alfamart', jsonb_build_object('type', 'nominal', 'value', 5000, 'label', 'Alfamart')
  )
)
where key = 'payment_method_fees';

-- Rekonsiliasi harian jam 02:30 WIB (19:30 UTC) — mundur sejam dari job billing/reminder
-- biar nggak numpuk. Butuh secret Vault 'reconcile_payments_function_url' + 'reminder_cron_secret' (reuse).
select cron.schedule(
  'reconcile-payments-daily',
  '30 19 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_payments_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'reconcile_payments_function_url');
  $$
);
