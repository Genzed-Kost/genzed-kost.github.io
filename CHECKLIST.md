# Checklist Sebelum Go-Live

Dokumen ini buat pemilik kost (bukan programmer) — daftar yang perlu dicek atau diisi
sebelum sistem ini dipakai penghuni sungguhan. Bagian yang udah dicek otomatis pas
development ditandai ✅; yang masih butuh tindakan manual pemilik kost ditandai ⬜.

---

## 1. Konten Asli (belum ada — perlu diisi manual)

Beberapa bagian sengaja dibiarkan kosong/placeholder daripada diisi konten palsu:

- ⬜ **Foto kamar & fasilitas asli.** Landing page belum punya galeri foto sama sekali
  (cuma logo). Kirim beberapa foto kamar/fasilitas kalau mau ditambahkan section galeri.
- ⬜ **Testimoni asli dari penghuni.** Section Testimoni sekarang isinya CTA "ajak survei
  kamar" (testimoni template lama yang jelas palsu sudah dihapus). Ganti isinya kalau
  udah ada testimoni asli (boleh nama inisial aja).
- ⬜ **Alamat lengkap.** Sekarang cuma "Serang, Banten" (kota doang) + link Google Maps.
  Tambahin nama jalan/patokan kalau mau lebih spesifik buat SEO lokal.
- ⬜ **Review isi `peraturan.html`, `faq.html`, `privasi.html`.** Isinya ditulis generik
  berdasarkan pola kost pada umumnya — sesuaikan sama aturan & kebijakan asli Genzed Kost
  (jam malam, denda, dll) sebelum dianggap final.

## 2. Keputusan Bisnis (Pembayaran)

- ⬜ **Set WhatsApp gateway pakai akun asli** (`FONNTE_TOKEN`) — testing sejauh ini pakai
  akun WA testing, pastikan diganti ke nomor WA resmi kost sebelum kirim notifikasi ke
  penghuni sungguhan.
- ✅ **Minimal 1 rekening transfer manual aktif** — sudah ada Bank Jago, QRIS Kost Genzed,
  dan beberapa wallet kripto di Admin → Pengaturan → Kelola Rekening (satu-satunya jalur
  pembayaran sekarang, jalur otomatis Midtrans sudah dihapus dari sistem).

## 3. Verifikasi Teknis (sudah dicek otomatis, 2026-09-29)

- ✅ Semua 20 file migrasi database ter-apply dan sinkron (`supabase migration list`).
- ✅ Semua 18 Edge Function ter-deploy berstatus ACTIVE.
- ✅ 4 cron job terjadwal & aktif: pengingat jatuh tempo (harian 09:00 WIB), generate
  tagihan bulanan (harian), denda keterlambatan (harian), expire pembayaran kedaluwarsa
  (tiap jam) — semuanya sempat diam-diam gagal karena secret Vault yang salah, sudah
  diperbaiki (lihat catatan di README).
- ✅ Nomor invoice & pembayaran sekarang pakai counter atomik (`number_counters` +
  `next_document_number()`) — dijamin nggak pernah tabrakan antar penghuni walau
  diproses bersamaan, DAN nyantumin kode kamar (format `INV-YYYYMM-KODEKAMAR-NNNN`)
  biar gampang dibedain antar penghuni sekilas.
- ✅ Jalur pembayaran disederhanakan jadi satu ("Transfer Manual" — pilih rekening dari
  daftar, termasuk QRIS), nggak ada lagi 2 opsi metode yang tumpang tindih.
- ✅ 68 unit test (`portal/src/lib/*.test.ts`) lolos semua — logika alokasi pembayaran,
  voucher, denda, bayar di muka, split payment co-tenant.
- ✅ Semua halaman statis (`index.html`, `peraturan.html`, `faq.html`, `privasi.html`,
  `404.html`, `sitemap.xml`, `robots.txt`) live dan bisa diakses (HTTP 200).
- ✅ Login penghuni & admin dites langsung di situs yang sudah di-deploy (bukan cuma lokal).
- ⬜ **Cek histori run cron sesekali** — buka Supabase dashboard → Database → Cron buat
  mastiin nggak ada yang diam-diam gagal lagi (kejadian nyata sebelumnya, lihat README).

## 4. Akun & Akses

- ⬜ Buat akun admin pertama lewat Supabase dashboard (lihat README langkah 11) kalau
  belum ada.
- ⬜ Ganti password akun admin kalau sebelumnya dipakai buat testing.
- ⬜ Pastikan nomor HP/email tiap penghuni yang diundang sudah benar sebelum kirim kode
  undangan — kode undangan cuma bisa dipakai sekali.

## 5. Setelah Live (pantauan rutin)

- ⬜ Kalau ada penghuni komplain "akun terkunci", itu fitur kunci login 5x-gagal (15
  menit) — bukan bug, tapi tetep bisa dicek lewat tabel `login_attempts`.
- ⬜ Backup database berkala lewat Supabase dashboard (Database → Backups) — di luar
  cakupan otomatis proyek ini.

---

*Dokumen ini dibuat otomatis sebagai bagian dari verifikasi deploy akhir. Update manual
kalau ada perubahan besar ke sistem pembayaran atau infrastruktur.*
