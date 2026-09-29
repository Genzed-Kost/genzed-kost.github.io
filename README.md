# Genzed Kost — Landing Page + Portal Penghuni

Website Genzed Kost (Serang, Banten) terdiri dari dua bagian:

1. **Landing page** ([`index.html`](index.html)) — halaman promosi statis, plus 3 halaman info statis: [`peraturan.html`](peraturan.html) (tata tertib), [`faq.html`](faq.html) (pertanyaan umum), [`privasi.html`](privasi.html) (kebijakan privasi). Semuanya di-link dari footer. Section testimoni sengaja diganti CTA "ajak survei kamar" (bukan testimoni palsu) sampai ada testimoni asli dari penghuni — sama, galeri foto kamar belum ditambahkan karena belum ada foto asli yang bisa dipakai.
2. **Portal Penghuni & Admin** ([`portal/`](portal/)) — aplikasi login, tagihan, pembayaran, dan panel admin. Dibangun pakai React + TypeScript (Vite), backend-nya Supabase.

Status pembangunan:
- ✅ **Modul 1 — Autentikasi** (login, aktivasi akun via undangan WhatsApp, lupa password)
- ✅ **Modul 2 — Dashboard Penghuni** (info kamar, ringkasan tagihan/deposit/voucher, pengingat jatuh tempo H-7/H-3/H-1/H-0, komplain, profil read-only — ubah data lewat komplain kategori "Ubah Data Diri", dokumen)
- ✅ **Modul 3 — Tagihan** (generate tagihan bulanan otomatis dengan prorata, denda keterlambatan otomatis, halaman rincian tagihan, bayar di muka dengan diskon bertingkat — jenjang diatur admin di Pengaturan)
- ✅ **Modul 4 — Pembayaran** (manual multi-rekening — bank/QRIS statis/e-wallet, kombinasi deposit+voucher, link bayar tanpa login, invoice PDF otomatis)
- ✅ **Modul 5 — Panel Admin** (`/admin`) — verifikasi transfer manual (+ batalkan pembayaran yang salah verifikasi, efeknya otomatis dibalik lewat ledger), kelola rekening pembayaran, kamar/tipe kamar/penghuni/kontrak (+ akhiri kontrak/checkout dengan hitung refund deposit otomatis, + kelola co-tenant/split payment kamar berdua), voucher/denda/pengaturan pembayaran, laporan (pemasukan, tunggakan, hunian, ekspor Excel `.xlsx`), audit log, balas komplain, login dikunci sementara setelah 5x gagal beruntun

**Semua 5 modul dari brief awal sudah selesai dibangun**, ditambah beberapa prioritas lanjutan: bayar di muka dengan diskon, split payment kamar berdua, dan perbaikan keandalan (kunci login, nomor invoice/pembayaran atomik biar nggak pernah tabrakan). Lihat [`CHECKLIST.md`](CHECKLIST.md) buat daftar yang perlu dicek/diisi sebelum dipakai penghuni sungguhan (banyak yang udah dites live, tapi beberapa hal — foto, testimoni asli, alamat lengkap — sengaja nunggu data asli dari pemilik kost).

**Catatan:** jalur pembayaran otomatis via Midtrans sempat dibangun tapi DIHAPUS lagi (keputusan bisnis — biaya MDR & kerumitan aktivasi channel nggak sepadan buat skala kost ini). Yang tersedia sekarang: Transfer Manual dan QRIS statis (gambar QR sendiri, bukan Midtrans) — keduanya gratis, nggak ada biaya potongan pihak ketiga.

---

## 1. Cara Kerja Singkat (buat yang bukan programmer)

- GitHub Pages cuma bisa nampilin file statis (HTML/CSS/JS jadi), nggak bisa jalanin server sendiri.
- Makanya semua "otak" backend (login, database, kirim WhatsApp, proses pembayaran) jalan di **Supabase** — layanan backend gratis (ada batas kuota gratis yang cukup besar buat usaha kecil).
- Setiap kali ada perubahan kode di-push ke branch `main`, **GitHub Actions** otomatis nge-build portal-nya dan publish ke GitHub Pages. Lo nggak perlu build manual.

---

## 2. Setup Supabase (sekali di awal)

1. Bikin akun & project baru di [supabase.com](https://supabase.com) (gratis).
2. Di dashboard project, buka **SQL Editor** → jalankan SEMUA file di folder [`supabase/migrations/`](supabase/migrations/) **berurutan sesuai nama filenya** (dimulai dari `20250101000000_init_schema.sql`). Ini bikin semua tabel, RLS, storage bucket dokumen, dan jadwal pengingat otomatis.
   - Kalau punya [Supabase CLI](https://supabase.com/docs/guides/cli) terinstall, lebih gampang pakai satu perintah ini (otomatis jalanin semua migrasi berurutan):
     ```bash
     supabase link --project-ref <project-ref-lo>
     supabase db push
     ```
3. Buka **Project Settings → API** dan catat:
   - `Project URL` → ini nilai `VITE_SUPABASE_URL`
   - `anon public` key → ini nilai `VITE_SUPABASE_ANON_KEY`
4. Deploy Edge Functions (fungsi backend untuk login/undangan):
   ```bash
   supabase functions deploy create-invite
   supabase functions deploy verify-invite
   supabase functions deploy verify-otp-activate
   supabase functions deploy resolve-identifier
   supabase functions deploy login --no-verify-jwt
   ```
   `login` (bukan `signInWithPassword` langsung dari klien) yang ngunci akun sementara
   15 menit setelah 5x gagal login beruntun — datanya di tabel `login_attempts`.
5. Set secrets buat Edge Functions (bukan lewat `.env`, tapi lewat Supabase CLI — supaya nggak pernah kebocor ke frontend):
   ```bash
   supabase secrets set FONNTE_TOKEN=isi_token_fonnte_lo
   supabase secrets set WA_PROVIDER=fonnte
   supabase secrets set APP_BASE_URL=https://genzed-kost.github.io
   ```
   - `FONNTE_TOKEN` didapat dari dashboard [Fonnte](https://fonnte.com) (WhatsApp gateway yang dipakai buat kirim kode undangan & OTP).
6. Deploy Edge Function pengingat jatuh tempo & aktifkan jadwalnya:
   ```bash
   supabase functions deploy send-due-reminders
   supabase secrets set CRON_SECRET=isi_dengan_string_acak_panjang
   ```
   Lalu di **SQL Editor** Supabase, jalankan (ganti `<project-ref>` dan `<CRON_SECRET>` sesuai punya lo — nilai `<CRON_SECRET>` HARUS sama persis dengan yang di-set lewat `supabase secrets set` di atas):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-due-reminders', 'reminder_function_url');
   select vault.create_secret('<CRON_SECRET>', 'reminder_cron_secret');
   ```
   Setelah itu migrasi [`20250103000000_schedule_due_reminders.sql`](supabase/migrations/20250103000000_schedule_due_reminders.sql) bakal otomatis jalanin pengingat tiap hari jam 09:00 WIB.
7. Deploy Edge Function mesin tagihan (generate tagihan bulanan otomatis + denda keterlambatan otomatis):
   ```bash
   supabase functions deploy generate-monthly-invoices
   supabase functions deploy apply-late-penalties
   ```
   Lalu di **SQL Editor**, tambahkan 2 secret Vault lagi (pakai `reminder_cron_secret` yang sama seperti langkah 6):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/generate-monthly-invoices', 'generate_invoices_function_url');
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/apply-late-penalties', 'apply_penalties_function_url');
   ```
   Setelah itu migrasi [`20250105000000_schedule_billing_jobs.sql`](supabase/migrations/20250105000000_schedule_billing_jobs.sql) otomatis jalanin mesin tagihan tiap hari jam 06:00 WIB. Aturan denda default: Rp10.000/hari, masa tenggang 3 hari, maksimal Rp150.000 (bisa diubah lewat tabel `penalties` — UI pengaturannya nyusul di Modul 5).
8. Deploy Edge Functions Modul Pembayaran:
   ```bash
   supabase functions deploy create-payment
   supabase functions deploy submit-payment-proof
   supabase functions deploy expire-stale-payments
   supabase functions deploy resolve-payment-link
   supabase functions deploy review-payment
   supabase functions deploy end-tenancy
   supabase functions deploy cancel-payment
   supabase functions deploy create-advance-payment
   supabase functions deploy create-share-payment
   ```
   Lalu tambahkan secret Vault buat jadwal cek transaksi kedaluwarsa (pakai `reminder_cron_secret` yang sama):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/expire-stale-payments', 'expire_payments_function_url');
   ```
9. Setup pembayaran **manual** (selalu aktif, gratis) — bisa lebih dari satu rekening (bank, QRIS gambar statis, e-wallet, kripto). Kelola lewat popup **Admin → Pengaturan → Kelola Rekening** di portal setelah akun admin dibuat (langkah 11): tambah, ubah, aktif/nonaktifkan, urutkan, hapus. Minimal 1 rekening harus aktif sebelum penghuni bisa pakai jalur transfer manual. Migrasi [`20250112000000_payment_accounts.sql`](supabase/migrations/20250112000000_payment_accounts.sql) otomatis mindahin rekening lama (kalau sudah pernah diisi lewat setting `bank_transfer_info`) jadi baris pertama.
   - (Opsional) Kalau mau QRIS **dinamis** yang otomatis nampilin nominal + kode unik (beda dari QRIS gambar statis di atas — ini generate ulang tiap transaksi), set nomor akun QRIS sebagai secret (JANGAN taruh di kode/migrasi):
     ```bash
     supabase secrets set QRIS_MERCHANT_ACCOUNT=nomor_akun_qris_kost
     ```
10. (Opsional) Kirim invoice PDF juga lewat email, selain WhatsApp — daftar gratis di [resend.com](https://resend.com):
    ```bash
    supabase secrets set RESEND_API_KEY=isi_api_key_resend
    supabase secrets set RESEND_FROM_EMAIL="Genzed Kost <noreply@domainlo.com>"
    ```
    Kalau nggak di-set, email dilewati otomatis (WhatsApp tetap terkirim seperti biasa).
11. Buat akun admin pertama secara manual (karena penghuni cuma bisa dibuat oleh admin, jadi admin pertama harus dibuat lewat dashboard):
    - Di Supabase dashboard → **Authentication → Users → Add user**, buat 1 user pakai email lo.
    - Di **Table Editor → profiles**, insert 1 row manual: `id` = ID user yang baru dibuat, `role` = `admin`, isi `full_name`, `email`, `phone`.

---

## 3. Setup Frontend (portal) secara lokal

```bash
cd portal
npm install
cp .env.example .env
```
Isi `.env` dengan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari langkah 2.3 di atas.

Jalankan dev server:
```bash
npm run dev
```
Buka `http://localhost:5173/penghuni/login`.

Jalankan test:
```bash
npm run test
```

---

## 4. Setup GitHub Actions (deploy otomatis)

1. Di GitHub repo → **Settings → Pages** → ubah "Build and deployment" source jadi **GitHub Actions** (bukan "Deploy from a branch" lagi).
2. Di **Settings → Secrets and variables → Actions**, tambahkan 2 repository secret:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push ke branch `main` → workflow [`deploy.yml`](.github/workflows/deploy.yml) otomatis jalan: build portal, gabungkan sama landing page statis, publish ke GitHub Pages.
4. Landing page tetap di `https://genzed-kost.github.io/`, portal penghuni di `https://genzed-kost.github.io/penghuni/login` (otomatis diarahkan ke aplikasi lewat trik `404.html`, URL tetap rapi).

---

## 5. Struktur Folder

```
/                    ← landing page statis (index.html + peraturan/faq/privasi.html)
portal/              ← source code React + TypeScript (login, dashboard, admin)
supabase/
  migrations/        ← skema database SQL
  functions/         ← Edge Functions (Deno) — backend serverless
.github/workflows/   ← otomatisasi build & deploy
404.html             ← trik routing SPA di GitHub Pages
```

---

## Catatan Keamanan

- **Tidak ada** service role key atau API key WhatsApp di kode frontend (`portal/`). Semua itu cuma ada di Supabase Edge Functions secrets.
- Semua tabel database punya Row Level Security (RLS) aktif — penghuni cuma bisa lihat data miliknya sendiri, admin bisa lihat semua.

---

## Catatan Keterbatasan

- **Sudah dites live berkali-kali** selama pengembangan — bukan cuma `npm run test` (68 unit test buat logika billing/pembayaran), tapi juga tes ujung-ke-ujung langsung ke project Supabase asli, plus verifikasi di situs yang sudah di-deploy. Tetap disarankan ulang tes serupa kalau lo fork/pindah ke project Supabase baru, karena environment production lo beda dari yang dipakai testing.
- Belum ada galeri foto kamar & testimoni asli di landing page — sengaja nunggu foto dan testimoni asli dari pemilik kost, bukan isi placeholder/palsu.
- Admin pertama **harus** dibuat manual lewat Supabase dashboard (langkah 11) — nggak ada cara bikin admin dari dalam aplikasi, ini memang disengaja demi keamanan.
