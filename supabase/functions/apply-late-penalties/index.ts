// Dipanggil harian oleh pg_cron. Hitung ulang denda keterlambatan untuk semua
// tagihan yang sudah lewat jatuh tempo dan belum lunas, lalu update status jadi JATUH_TEMPO.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { calculatePenalty, splitBySharePercent, type PenaltyCalcType } from "../_shared/billing.ts";

function jakartaToday(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Tidak diizinkan." }, 401);
  }

  const admin = getSupabaseAdmin();
  const today = jakartaToday();
  const todayStr = today.toISOString().slice(0, 10);
  let updatedCount = 0;

  try {
    const { data: penalty } = await admin
      .from("penalties")
      .select("calc_type, value, grace_period_days, max_amount")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const { data: invoices, error: invErr } = await admin
      .from("invoices")
      .select("id, subtotal, discount_total, paid_total, due_date, status")
      .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"])
      .lt("due_date", todayStr);
    if (invErr) return jsonResponse({ error: invErr.message }, 500);

    for (const inv of invoices ?? []) {
      const daysLate = daysBetween(new Date(`${inv.due_date}T00:00:00.000Z`), today);
      const principal = Number(inv.subtotal) - Number(inv.discount_total);
      const unpaidPrincipal = Math.max(0, principal - Number(inv.paid_total));

      let penaltyAmount = 0;
      if (penalty && unpaidPrincipal > 0) {
        penaltyAmount = calculatePenalty({
          outstandingAmount: unpaidPrincipal,
          calcType: penalty.calc_type as PenaltyCalcType,
          value: Number(penalty.value),
          gracePeriodDays: penalty.grace_period_days,
          maxAmount: penalty.max_amount != null ? Number(penalty.max_amount) : null,
          daysLate,
        });
      }

      const newTotal = principal + penaltyAmount;
      const newStatus = inv.status === "TERBIT" || inv.status === "SEBAGIAN_DIBAYAR" ? "JATUH_TEMPO" : inv.status;

      await admin
        .from("invoices")
        .update({ penalty_total: penaltyAmount, total: newTotal, status: newStatus })
        .eq("id", inv.id);

      await admin.from("invoice_items").delete().eq("invoice_id", inv.id).eq("item_type", "DENDA");
      if (penaltyAmount > 0) {
        await admin.from("invoice_items").insert({
          invoice_id: inv.id,
          item_type: "DENDA",
          description: `Denda keterlambatan (${daysLate} hari)`,
          quantity: 1,
          unit_price: penaltyAmount,
          amount: penaltyAmount,
        });
      }

      // Co-tenant (Prioritas 4): invoice yang dibagi ke beberapa penghuni juga
      // perlu share_amount-nya disesuaikan ulang (total baru = sewa + denda),
      // dipecah pakai share_percent ASLI yang tersimpan di tiap baris.
      // paid_amount TIDAK disentuh — yang sudah dibayar tetap dianggap dibayar.
      const { data: shares } = await admin.from("invoice_shares").select("id, tenant_id, share_percent").eq("invoice_id", inv.id);
      if (shares && shares.length > 0) {
        const newShareAmounts = splitBySharePercent(
          newTotal,
          shares.map((s) => ({ tenantId: s.tenant_id, sharePercent: Number(s.share_percent) }))
        );
        for (let i = 0; i < shares.length; i++) {
          await admin.from("invoice_shares").update({ share_amount: newShareAmounts[i].amount }).eq("id", shares[i].id);
        }
      }

      updatedCount += 1;
    }

    return jsonResponse({ ok: true, updated: updatedCount });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
