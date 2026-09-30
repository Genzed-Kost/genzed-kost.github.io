-- ============================================================
-- Konten landing page yang bisa diedit admin lewat portal, TANPA butuh
-- developer atau deploy ulang. Sengaja tabel TERPISAH dari `settings`
-- (yang cuma boleh dibaca user authenticated) karena landing page
-- diakses PENGUNJUNG UMUM tanpa login — butuh baris yang aman dibaca publik.
--
-- Landing page (index.html) tetap statis buat SEO (Google crawl HTML
-- apa adanya) — data di sini cuma dipakai buat OVERRIDE tampilan lewat
-- JS setelah halaman kebuka, sebagai lapisan tambahan di atas konten
-- default yang sudah ada. Kalau fetch gagal/kosong, konten statis default
-- tetap tampil apa adanya (graceful degradation).
-- ============================================================

create table public.landing_content (
  id boolean primary key default true,
  stats jsonb not null default '{"penghuni_aktif":"120+","rating":"4.8","berdiri_sejak":"3thn"}'::jsonb,
  maps_url text,
  nearby jsonb not null default '[]'::jsonb,
  gallery jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint landing_content_singleton check (id = true)
);

insert into public.landing_content (id) values (true);

alter table public.landing_content enable row level security;
create policy "landing_content_select_public" on public.landing_content
  for select using (true);
create policy "landing_content_write_admin_only" on public.landing_content
  for all using (public.is_admin()) with check (public.is_admin());

-- Bucket buat foto galeri landing page (fasilitas, kamar, dll) — sama seperti
-- QRIS merchant, ini bukan data pribadi penghuni, aman diakses publik.
insert into storage.buckets (id, name, public)
values ('landing-gallery', 'landing-gallery', true)
on conflict (id) do nothing;

create policy "landing_gallery_select_public" on storage.objects
  for select using (bucket_id = 'landing-gallery');
create policy "landing_gallery_write_admin_only" on storage.objects
  for all using (bucket_id = 'landing-gallery' and public.is_admin())
  with check (bucket_id = 'landing-gallery' and public.is_admin());
