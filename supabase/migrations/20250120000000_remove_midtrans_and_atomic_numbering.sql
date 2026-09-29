-- ============================================================
-- 1) Hapus jalur pembayaran otomatis Midtrans sepenuhnya (keputusan bisnis:
--    biaya MDR & kerumitan aktivasi channel nggak sepadan buat skala kost ini
--    sekarang). Transfer Manual & QRIS statis (bukan Midtrans) TETAP ada.
--    Data histori (payments.gateway_*, payment_reconciliations lama) TIDAK
--    disentuh strukturnya biar riwayat lama tetap bisa ditelusuri kalau perlu,
--    tapi jalur baru & otomasi terkait dimatikan semua.
-- ============================================================

select cron.unschedule('reconcile-payments-daily');

drop table if exists public.payment_reconciliations;

delete from public.settings where key in ('payment_gateway_enabled', 'payment_gateway_provider');

update public.settings
set value = jsonb_build_object('manual', coalesce(value->'manual', '{"type":"nominal","value":0}'::jsonb))
where key = 'payment_method_fees';

-- ============================================================
-- 2) Counter atomik buat nomor invoice/pembayaran — ganti pola lama
--    "hitung baris yang ada lalu +1" yang punya celah race condition kalau
--    2 transaksi (dari penghuni berbeda) diproses nyaris bersamaan.
-- ============================================================

create table public.number_counters (
  counter_key text primary key,
  value integer not null default 0
);

-- Sengaja TANPA policy (RLS aktif, 0 policy) — cuma boleh disentuh lewat
-- fungsi next_document_number() di bawah (security definer), bukan langsung.
alter table public.number_counters enable row level security;

create or replace function public.next_document_number(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.number_counters (counter_key, value)
  values (p_key, 1)
  on conflict (counter_key) do update set value = number_counters.value + 1
  returning value into v_next;
  return v_next;
end;
$$;

-- Backfill: mulai counter bulan berjalan dari jumlah baris yang sudah ada,
-- supaya nomor nggak mundur/tabrakan sama data lama yang dibuat pola sebelumnya.
insert into public.number_counters (counter_key, value)
select 'INV-' || to_char(now(), 'YYYYMM'), count(*) from public.invoices
where invoice_number like 'INV-' || to_char(now(), 'YYYYMM') || '-%'
on conflict (counter_key) do nothing;

insert into public.number_counters (counter_key, value)
select 'PAY-' || to_char(now(), 'YYYYMM'), count(*) from public.payments
where payment_number like 'PAY-' || to_char(now(), 'YYYYMM') || '-%'
on conflict (counter_key) do nothing;
