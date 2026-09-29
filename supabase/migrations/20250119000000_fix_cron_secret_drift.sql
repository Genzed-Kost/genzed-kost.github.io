-- BUG KRITIS ketemu pas investigasi laporan "tagihan nggak muncul buat kontrak
-- yang udah jalan sebulan": generate-monthly-invoices-daily (dan 3 cron job lain)
-- ternyata diam-diam gagal SETIAP KALI jalan dengan status 401 Unauthorized, sejak
-- entah kapan (net._http_response cuma nyimpen ~1 hari terakhir, semuanya 401).
--
-- Akar masalahnya: 4 dari 5 cron job (semua KECUALI reconcile-payments-daily yang
-- baru dibikin belakangan) ternyata nunjuk ke secret Vault 'reminder_cron_secret_v3'
-- di database — BUKAN 'reminder_cron_secret' seperti yang tertulis di file migrasi
-- aslinya (20250103000000, 20250105000000, 20250107000000). Ini artinya command
-- cron job-nya pernah di-replace manual (lewat cron.schedule() ulang / SQL Editor)
-- pas debugging CRON_SECRET di sesi sebelumnya, tapi nilai 'reminder_cron_secret_v3'
-- itu sendiri nggak pernah disinkronkan ulang ke CRON_SECRET yang aktif sekarang —
-- sementara 'reminder_cron_secret' (nama asli, tanpa akhiran) tetap ke-update benar.
--
-- Akibatnya SELAMA INI: tagihan bulanan otomatis, denda keterlambatan, pengingat
-- jatuh tempo WhatsApp, dan pembersihan pembayaran kedaluwarsa SEMUANYA diam-diam
-- nggak jalan — nggak ada log/notifikasi kegagalan karena ini fire-and-forget dari
-- sisi pg_cron (statusnya tetap keliatan "succeeded" di cron.job_run_details walau
-- request HTTP-nya sendiri dapat 401, soalnya net.http_post cuma nge-queue request-nya).
--
-- Perbaikan: reschedule ulang ke-4 job ini SUPAYA balik nunjuk ke 'reminder_cron_secret'
-- (nilai yang sudah divalidasi benar & konsisten dipakai reconcile-payments-daily).
-- cron.schedule() dengan nama job yang sama otomatis REPLACE definisi lama.

select cron.schedule(
  'send-due-reminders-daily',
  '0 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'reminder_function_url');
  $$
);

select cron.schedule(
  'generate-monthly-invoices-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'generate_invoices_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'generate_invoices_function_url');
  $$
);

select cron.schedule(
  'apply-late-penalties-daily',
  '15 23 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'apply_penalties_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'apply_penalties_function_url');
  $$
);

select cron.schedule(
  'expire-stale-payments-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'expire_payments_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'expire_payments_function_url');
  $$
);
