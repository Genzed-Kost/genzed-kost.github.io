// Admin menyetujui atau menolak bukti transfer manual. Persetujuan lewat
// confirmPayment.ts supaya jalur pelunasan SELALU lewat satu pintu, konsisten
// untuk semua metode pembayaran.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { confirmPayment } from "../_shared/confirmPayment.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = getSupabaseAdmin();
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) return jsonResponse({ error: "Tidak terautentikasi." }, 401);

    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
    if (callerProfile?.role !== "admin") return jsonResponse({ error: "Hanya admin yang bisa verifikasi pembayaran." }, 403);

    const { payment_id, decision, reason } = await req.json();
    if (!payment_id || !["APPROVE", "REJECT"].includes(decision)) {
      return jsonResponse({ error: "payment_id dan decision (APPROVE/REJECT) wajib diisi." }, 400);
    }

    const { data: payment } = await admin
      .from("payments")
      .select("id, tenant_id, status, payment_number")
      .eq("id", payment_id)
      .maybeSingle();
    if (!payment) return jsonResponse({ error: "Pembayaran tidak ditemukan." }, 404);
    if (payment.status !== "MENUNGGU_VERIFIKASI") {
      return jsonResponse({ error: "Pembayaran ini bukan lagi menunggu verifikasi." }, 409);
    }

    const { data: tenant } = await admin.from("profiles").select("full_name, phone").eq("id", payment.tenant_id).single();

    if (decision === "APPROVE") {
      // confirmPayment butuh status MENUNGGU, jadi mundurkan dulu sebelum diselesaikan lewat jalur yang sama.
      await admin.from("payments").update({ status: "MENUNGGU" }).eq("id", payment.id);
      const result = await confirmPayment(admin, payment.id);
      if (!result.processed) return jsonResponse({ error: "Gagal memproses pelunasan." }, 500);

      await admin
        .from("payment_proofs")
        .update({ review_status: "DISETUJUI", reviewed_by: caller.user.id, reviewed_at: new Date().toISOString() })
        .eq("payment_id", payment.id);

      if (tenant) {
        try {
          await sendWhatsApp(
            tenant.phone,
            `Halo ${tenant.full_name}! 👋\n\nBukti transfer untuk pembayaran ${payment.payment_number} sudah diverifikasi dan LUNAS. Terima kasih! 🎉`
          );
        } catch {
          // notifikasi gagal tidak menggagalkan verifikasi
        }
      }
    } else {
      await admin.from("payments").update({ status: "DITOLAK", rejected_reason: reason ?? null }).eq("id", payment.id);
      await admin
        .from("payment_proofs")
        .update({ review_status: "DITOLAK", review_note: reason ?? null, reviewed_by: caller.user.id, reviewed_at: new Date().toISOString() })
        .eq("payment_id", payment.id);

      if (tenant) {
        try {
          await sendWhatsApp(
            tenant.phone,
            `Halo ${tenant.full_name}! 👋\n\nBukti transfer untuk pembayaran ${payment.payment_number} DITOLAK.\nAlasan: ${reason ?? "Tidak disebutkan"}\n\nSilakan hubungi admin kost atau upload ulang bukti transfer yang benar.`
          );
        } catch {
          // notifikasi gagal tidak menggagalkan penolakan
        }
      }
    }

    await admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action: decision === "APPROVE" ? "approve_payment" : "reject_payment",
      target_table: "payments",
      target_id: payment.id,
      metadata: { reason: reason ?? null },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
