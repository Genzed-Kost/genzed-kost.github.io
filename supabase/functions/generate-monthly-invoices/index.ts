// Dipanggil harian oleh pg_cron. Untuk tiap kontrak sewa aktif, cek apakah
// sudah waktunya terbitkan tagihan periode berikutnya (dengan prorata otomatis
// kalau penghuni baru masuk/mau keluar di tengah periode).
//
// Jadwal terbit tagihan (aturan bisnis Genzed Kost): penghuni yang mulai sewa
// tanggal 1-15 masuk siklus anchor tanggal 1 (tagihan tiap periode terbit
// tanggal 25 bulan sebelumnya); yang mulai tanggal 16-31 masuk siklus anchor
// tanggal 16 (tagihan terbit tanggal 10 bulan yang sama). Tagihan PERTAMA
// seorang penghuni selalu langsung terbit begitu kontrak dibuat (nggak nunggu
// jadwal 25/10, yang buat penghuni yang baru daftar kemungkinan udah lewat).
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { nextDocumentNumber } from "../_shared/numbering.ts";
import { sanitizeRoomCode } from "../_shared/roomCode.ts";
import {
  billingAnchorFromStartDate,
  calculateFirstPeriodSewaAmount,
  calculateSewaAmount,
  cycleMonths,
  firstAnchoredPeriodEnd,
  invoicePublishDate,
  nextAnchoredPeriodEnd,
  splitBySharePercent,
  type BillingCycle,
} from "../_shared/billing.ts";

const DEFAULT_DUE_DAYS = 5;

function jakartaToday(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Tidak diizinkan." }, 401);
  }

  const admin = getSupabaseAdmin();
  const today = jakartaToday();
  let createdCount = 0;

  try {
    const { data: dueSetting } = await admin
      .from("settings")
      .select("value")
      .eq("key", "invoice_due_days_after_period_start")
      .maybeSingle();
    const dueDays = Number(dueSetting?.value ?? DEFAULT_DUE_DAYS);

    const { data: tenancies, error: tenErr } = await admin
      .from("tenancies")
      .select("id, tenant_id, room_id, billing_cycle, monthly_rate, start_date, end_date, status, rooms(room_number, room_types(name)), profiles(full_name, phone)")
      .eq("status", "AKTIF");
    if (tenErr) return jsonResponse({ error: tenErr.message }, 500);

    for (const tenancy of tenancies ?? []) {
      const tenancyStart = new Date(`${tenancy.start_date}T00:00:00.000Z`);
      const anchor = billingAnchorFromStartDate(tenancyStart);
      const cycle = tenancy.billing_cycle as BillingCycle;

      const { data: lastInvoice } = await admin
        .from("invoices")
        .select("period_end")
        .eq("tenancy_id", tenancy.id)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isFirstInvoice = !lastInvoice;
      const periodStart = isFirstInvoice ? tenancyStart : addDays(new Date(`${lastInvoice.period_end}T00:00:00.000Z`), 1);
      const tenancyEnd = tenancy.end_date ? new Date(`${tenancy.end_date}T00:00:00.000Z`) : null;

      if (tenancyEnd && periodStart > tenancyEnd) continue; // kontrak sudah lunas sampai berakhir

      // Tagihan pertama langsung terbit begitu kontrak dibuat. Tagihan berikutnya
      // nunggu jadwal terbit resmi (tanggal 25/10) sesuai anchor billing-nya.
      if (!isFirstInvoice) {
        const publishDate = invoicePublishDate(periodStart, anchor);
        if (today < publishDate) continue; // belum waktunya terbitkan
      }

      const periodEndFull = isFirstInvoice
        ? firstAnchoredPeriodEnd(tenancyStart, cycle, anchor)
        : nextAnchoredPeriodEnd(periodStart, cycle, anchor);
      const periodEnd = tenancyEnd && tenancyEnd < periodEndFull ? tenancyEnd : periodEndFull;

      const { data: exists } = await admin
        .from("invoices")
        .select("id")
        .eq("tenancy_id", tenancy.id)
        .eq("period_start", toDateOnlyString(periodStart))
        .maybeSingle();
      if (exists) continue; // sudah pernah dibuat, jangan duplikat

      const fullPeriodRate = tenancy.monthly_rate * cycleMonths(cycle);
      // Aturan bisnis Genzed Kost: tagihan PERTAMA seorang penghuni SELALU tarif
      // penuh, nggak peduli masuk tanggal berapa dalam periode anchornya (cuma
      // tanggal TERBIT tagihan yang beda, bukan nominalnya) — kecuali penghuni
      // itu KEBETULAN juga udah dijadwalkan keluar (end_date) sebelum periode
      // pertamanya berakhir, baru diprorata buat bagian yang ditempati aja.
      let sewa: { amount: number; isProrated: boolean; occupiedDays: number; totalDays: number };
      if (isFirstInvoice) {
        sewa =
          tenancyEnd && tenancyEnd < periodEndFull
            ? calculateFirstPeriodSewaAmount(fullPeriodRate, tenancyStart, periodEnd, anchor)
            : { amount: Math.round(fullPeriodRate), isProrated: false, occupiedDays: 0, totalDays: 0 };
      } else {
        sewa = calculateSewaAmount(fullPeriodRate, periodStart, periodEnd, tenancyStart, tenancyEnd);
      }

      const room = tenancy.rooms as unknown as { room_number: string; room_types: { name: string } } | null;
      const tenant = tenancy.profiles as unknown as { full_name: string; phone: string } | null;

      const monthKey = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
      const invoiceNumber = await nextDocumentNumber(admin, "INV", monthKey, sanitizeRoomCode(room?.room_number));

      const dueDate = toDateOnlyString(addDays(periodStart, dueDays));

      const { data: invoice, error: invInsertErr } = await admin
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          tenant_id: tenancy.tenant_id,
          tenancy_id: tenancy.id,
          period_start: toDateOnlyString(periodStart),
          period_end: toDateOnlyString(periodEnd),
          due_date: dueDate,
          status: "TERBIT",
          subtotal: sewa.amount,
          discount_total: 0,
          penalty_total: 0,
          total: sewa.amount,
          paid_total: 0,
        })
        .select("id")
        .single();
      if (invInsertErr || !invoice) continue;

      const desc = sewa.isProrated
        ? `Sewa kamar ${room?.room_number ?? ""} (${room?.room_types?.name ?? ""}) — prorata ${sewa.occupiedDays}/${sewa.totalDays} hari`
        : `Sewa kamar ${room?.room_number ?? ""} (${room?.room_types?.name ?? ""}) — periode ${toDateOnlyString(periodStart)} s/d ${toDateOnlyString(periodEnd)}`;

      await admin.from("invoice_items").insert({
        invoice_id: invoice.id,
        item_type: "SEWA_KAMAR",
        description: desc,
        quantity: 1,
        unit_price: sewa.amount,
        amount: sewa.amount,
      });

      // Co-tenant (Prioritas 4): kalau kontrak ini punya >1 anggota, pecah
      // tagihannya ke invoice_shares sesuai share_percent masing-masing.
      // Kontrak satu-penghuni (mayoritas) nggak pernah sampai sini.
      const { data: members } = await admin
        .from("tenancy_members")
        .select("tenant_id, share_percent")
        .eq("tenancy_id", tenancy.id);
      if (members && members.length > 1) {
        const shares = splitBySharePercent(
          sewa.amount,
          members.map((m) => ({ tenantId: m.tenant_id, sharePercent: Number(m.share_percent) }))
        );
        await admin.from("invoice_shares").insert(
          shares.map((s, i) => ({
            invoice_id: invoice.id,
            tenant_id: s.tenantId,
            share_percent: Number(members[i].share_percent),
            share_amount: s.amount,
            paid_amount: 0,
          }))
        );
      }

      await admin.from("audit_logs").insert({
        actor_id: null,
        action: "generate_invoice",
        target_table: "invoices",
        target_id: invoice.id,
        metadata: { invoice_number: invoiceNumber, tenancy_id: tenancy.id, prorated: sewa.isProrated, anchor, is_first_invoice: isFirstInvoice },
      });

      const rupiahFmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

      if (members && members.length > 1) {
        // Co-tenant: tiap anggota dinotif porsinya masing-masing, bukan nominal sekamar penuh.
        const { data: memberProfiles } = await admin.from("profiles").select("id, full_name, phone").in(
          "id",
          members.map((m) => m.tenant_id)
        );
        const { data: shareRows } = await admin.from("invoice_shares").select("tenant_id, share_amount").eq("invoice_id", invoice.id);
        for (const m of memberProfiles ?? []) {
          const shareAmount = Number((shareRows ?? []).find((s) => s.tenant_id === m.id)?.share_amount ?? 0);
          const body = `Tagihan baru ${invoiceNumber} sudah terbit (kamar dibagi rame-rame). Porsi lo: ${rupiahFmt(shareAmount)}. Jatuh tempo ${dueDate}. Cek detail di portal ya.`;
          await admin.from("notifications").insert({
            tenant_id: m.id,
            channel: "whatsapp",
            category: "pembayaran",
            title: `Tagihan baru: ${invoiceNumber}`,
            body,
          });
          try {
            await sendWhatsApp(m.phone, `Halo ${m.full_name}! 👋\n\n${body}`);
          } catch {
            // gagal kirim WA tidak menggagalkan pembuatan tagihan
          }
        }
      } else if (tenant) {
        const body = `Tagihan baru ${invoiceNumber} sebesar ${rupiahFmt(sewa.amount)} sudah terbit. Jatuh tempo ${dueDate}. Cek detail di portal ya.`;
        await admin.from("notifications").insert({
          tenant_id: tenancy.tenant_id,
          channel: "whatsapp",
          category: "pembayaran",
          title: `Tagihan baru: ${invoiceNumber}`,
          body,
        });
        try {
          await sendWhatsApp(tenant.phone, `Halo ${tenant.full_name}! 👋\n\n${body}`);
        } catch {
          // gagal kirim WA tidak menggagalkan pembuatan tagihan
        }
      }

      createdCount += 1;
    }

    return jsonResponse({ ok: true, created: createdCount });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
