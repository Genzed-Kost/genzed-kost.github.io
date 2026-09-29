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

## 2. Keputusan Bisnis (Midtrans & Pembayaran)

- ⬜ **Cek mode Midtrans sebelum terima uang asli.** `MIDTRANS_IS_PRODUCTION` harus `true`
  dan `MIDTRANS_SERVER_KEY` harus **Production Server Key** (bukan Sandbox) sebelum
  penghuni beneran bayar lewat jalur otomatis. Kalau masih testing, pastikan tetap pakai
  Sandbox key supaya nggak ada transaksi asli yang nyasar.
- ⬜ **Aktifkan channel yang dipakai di dashboard Midtrans** (Settings → Payment Methods) —
  VA bank, GoPay, QRIS, dll harus diaktifkan DI SANA dulu, baru bisa dipilih penghuni di
  halaman Bayar. Channel yang belum aktif bakal muncul "No payment channels available"
  walau kodenya udah bener (kejadian nyata pas tes Sandbox, lihat catatan di README).
- ⬜ **Set WhatsApp gateway pakai akun asli** (`FONNTE_TOKEN`) — testing sejauh ini pakai
  akun WA testing, pastikan diganti ke nomor WA resmi kost sebelum kirim notifikasi ke
  penghuni sungguhan.
- ⬜ **Minimal 1 rekening transfer manual aktif** di Admin → Pengaturan → Kelola Rekening,
  supaya penghuni tetap bisa bayar walau jalur otomatis lagi nggak dipakai.

## 3. Verifikasi Teknis (sudah dicek otomatis, 2026-09-29)

- ✅ Semua 18 file migrasi database ter-apply dan sinkron (`supabase migration list`).
- ✅ Semua 20 Edge Function ter-deploy berstatus ACTIVE.
- ✅ 5 cron job terjadwal & aktif: pengingat jatuh tempo (harian 09:00 WIB), generate
  tagihan bulanan (harian), denda keterlambatan (harian), expire pembayaran kedaluwarsa
  (tiap jam), rekonsiliasi Midtrans (harian).
- ✅ 68 unit test (`portal/src/lib/*.test.ts`) lolos semua — logika alokasi pembayaran,
  voucher, denda, bayar di muka, split payment co-tenant.
- ✅ Semua halaman statis (`index.html`, `peraturan.html`, `faq.html`, `privasi.html`,
  `404.html`, `sitemap.xml`, `robots.txt`) live dan bisa diakses (HTTP 200).
- ✅ Login penghuni & admin dites langsung di situs yang sudah di-deploy (bukan cuma lokal).
- ⬜ **Cek histori run cron 24 jam terakhir nggak ada yang gagal terus-menerus** — buka
  Supabase dashboard → Database → Cron, atau tanya developer buat query
  `cron.job_run_details`.

## 4. Akun & Akses

- ⬜ Buat akun admin pertama lewat Supabase dashboard (lihat README langkah 13) kalau
  belum ada.
- ⬜ Ganti password akun admin kalau sebelumnya dipakai buat testing.
- ⬜ Pastikan nomor HP/email tiap penghuni yang diundang sudah benar sebelum kirim kode
  undangan — kode undangan cuma bisa dipakai sekali.

## 5. Setelah Live (pantauan rutin)

- ⬜ Cek **Admin → Laporan → Rekonsiliasi Midtrans** tiap beberapa hari kalau jalur
  otomatis aktif — ini nangkep transaksi yang statusnya nyasar karena webhook gagal
  masuk. Rekonsiliasi cuma MELAPORKAN, admin yang putuskan tindakannya.
- ⬜ Kalau ada penghuni komplain "akun terkunci", itu fitur kunci login 5x-gagal (15
  menit) — bukan bug, tapi tetep bisa dicek lewat tabel `login_attempts`.
- ⬜ Backup database berkala lewat Supabase dashboard (Database → Backups) — di luar
  cakupan otomatis proyek ini.

---

*Dokumen ini dibuat otomatis sebagai bagian dari verifikasi deploy akhir. Update manual
kalau ada perubahan besar ke sistem pembayaran atau infrastruktur.*
