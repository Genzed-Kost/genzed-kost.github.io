// Dipanggil harian oleh pg_cron. Bandingkan status pembayaran gateway (Midtrans) di
// tabel kita vs status ASLI di Midtrans — nangkep kasus webhook gagal terkirim/gagal
// diproses (mis. server down pas notifikasi masuk). Sengaja CUMA LAPOR selisihnya
// (payment_reconciliations), nggak auto-perbaiki — biar admin yang review manual
// sebelum status pembayaran (duit beneran) diutak-atik.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { getTransactionStatus } from "../_shared/midtrans.ts";

// Status kita yang "settled" secara logis kalau Midtrans bilang settlement/capture-accept.
const SETTLED_OUR_STATUSES = ["LUNAS"];
const FAILED_OUR_STATUSES = ["KEDALUWARSA", "DIBATALKAN"];

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Tidak diizinkan." }, 401);
  }

  const admin = getSupabaseAdmin();
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: payments, error } = await admin
      .from("payments")
      .select("id, payment_number, status")
      .eq("gateway_provider", "midtrans")
      .gte("created_at", thirtyDaysAgo);
    if (error) return jsonResponse({ error: error.message }, 500);

    let checked = 0;
    let mismatches = 0;
    for (const payment of payments ?? []) {
      let midtransResult;
      try {
        midtransResult = await getTransactionStatus(payment.payment_number);
      } catch {
        continue; // gangguan jaringan/API Midtrans sesaat — coba lagi besok, jangan gagalkan seluruh batch
      }
      if (!midtransResult) continue; // belum ada transaksi di sisi Midtrans (jarang, tapi aman diabaikan)
      checked++;

      const { transactionStatus, fraudStatus } = midtransResult;
      const midtransSettled = transactionStatus === "settlement" || (transactionStatus === "capture" && fraudStatus === "accept");
      const midtransFailed = ["expire", "cancel", "deny", "failure"].includes(transactionStatus);

      const ourSettled = SETTLED_OUR_STATUSES.includes(payment.status);
      const ourFailed = FAILED_OUR_STATUSES.includes(payment.status);

      const mismatch = (midtransSettled && !ourSettled) || (midtransFailed && !ourFailed && !ourSettled);
      if (mismatch) {
        mismatches++;
        // Hapus dulu selisih lama buat payment ini biar nggak numpuk duplikat tiap hari.
        await admin.from("payment_reconciliations").delete().eq("payment_id", payment.id);
        await admin.from("payment_reconciliations").insert({
          payment_id: payment.id,
          our_status: payment.status,
          midtrans_status: transactionStatus,
        });
      } else {
        // Udah cocok lagi (mis. admin udah benerin manual) — bersihin catatan lama kalau ada.
        await admin.from("payment_reconciliations").delete().eq("payment_id", payment.id);
      }
    }

    return jsonResponse({ ok: true, checked, mismatches });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
