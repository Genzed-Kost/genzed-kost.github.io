-- Ganti pendekatan galeri foto standalone: gambar sekarang nempel di item
-- Fasilitas & Keunggulan Kami (opsional), plus section baru "Penghuni Kost"
-- yang teks doang (nama, umur, kegiatan, sepatah kata) — nggak ada gambar.

alter table public.landing_content
  add column if not exists facilities jsonb not null default '[]'::jsonb,
  add column if not exists keunggulan jsonb not null default '[]'::jsonb,
  add column if not exists penghuni jsonb not null default '[]'::jsonb;

alter table public.landing_content drop column if exists gallery;
