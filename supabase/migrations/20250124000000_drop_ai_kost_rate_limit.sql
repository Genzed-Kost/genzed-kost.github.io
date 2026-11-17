-- AI Kost sekarang jalan 100% di browser (gratis, tanpa Edge Function / API berbayar),
-- jadi tabel pembatas request-nya tidak dipakai lagi.
drop table if exists public.ai_kost_requests;
