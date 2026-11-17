-- AI Kost: catatan request per IP (di-hash) buat membatasi pemakaian fitur tanya-jawab
-- yang bisa dipakai tanpa login. Data otomatis dibersihkan Edge Function ai-kost
-- (umur > 24 jam dihapus).
create table public.ai_kost_requests (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index ai_kost_requests_ip_idx on public.ai_kost_requests (ip_hash, created_at desc);

-- Sengaja TANPA policy (RLS aktif, 0 policy) — cuma boleh disentuh Edge Function
-- ai-kost lewat service_role, nggak bisa dibaca/ditulis klien.
alter table public.ai_kost_requests enable row level security;
