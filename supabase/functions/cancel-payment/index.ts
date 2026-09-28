// Batalkan pembayaran yang terlanjur diverifikasi (LUNAS) tapi ternyata salah.
// SEMUA efeknya dibalik lewat baris/ledger BARU — baris payment_allocations dan
// ledger_entries lama TIDAK PERNAH dihapus/diubah, supaya riwayat tetap bisa
// ditelusuri (audit trail). Status tagihan terkait dihitung ulang otomatis.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getDepositBalance } from "../_shared/confirmPayment.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";

function rupiah(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = getSupabaseAdmin();
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) return jsonResponse({ error: "Tidak terautentikasi." }, 401);

    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
    if (callerProfile?.role !== "admin") return jsonResponse({ error: "Hanya admin yang bisa membatalkan pembayaran." }, 403);

    const { payment_id, reason } = await req.json();
    if (!payment_id || !reason?.trim()) return jsonResponse({ error: "payment_id dan alasan pembatalan wajib diisi." }, 400);

    const { data: payment } = await admin
      .from("payments")
      .select("id, payment_number, tenant_id, status, amount, deposit_used, voucher_id, voucher_discount, tenant:profiles!payments_tenant_id_fkey(full_name, phone)")
      .eq("id", payment_id)
      .maybeSingle();
    if (!payment) return jsonResponse({ error: "Pembayaran tidak ditemukan." }, 404);
    if (payment.status !== "LUNAS") return jsonResponse({ error: "Cuma pembayaran berstatus LUNAS yang bisa dibatalkan." }, 409);

    const tenant = payment.tenant as unknown as { full_name: string; phone: string };

    // 1) Balikin alokasi ke tiap tagihan (kurangi paid_total, hitung ulang status).
    const { data: allocations } = await admin.from("payment_allocations").select("id, invoice_id, amount").eq("payment_id", payment_id);
    const affectedInvoices: string[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const alloc of allocations ?? []) {
      if (!alloc.invoice_id) continue; // ditangani terpisah di bawah (kelebihan bayar -> deposit)
      const { data: invoice } = await admin.from("invoices").select("id, total, paid_total, due_date").eq("id", alloc.invoice_id).single();
      if (!invoice) continue;

      // Invoice co-tenant (Prioritas 4): balikin ke invoice_shares milik penghuni
      // yang bayar ini, bukan invoices.paid_total langsung — sama seperti logika
      // di confirmPayment.ts. Kontrak biasa nggak punya invoice_shares sama sekali.
      const { data: share } = await admin
        .from("invoice_shares")
        .select("id, share_amount, paid_amount")
        .eq("invoice_id", alloc.invoice_id)
        .eq("tenant_id", payment.tenant_id)
        .maybeSingle();

      if (share) {
        const newSharePaid = Math.max(0, Number(share.paid_amount) - Number(alloc.amount));
        await admin.from("invoice_shares").update({ paid_amount: newSharePaid }).eq("id", share.id);

        const { data: allShares } = await admin.from("invoice_shares").select("share_amount, paid_amount").eq("invoice_id", alloc.invoice_id);
        const totalPaid = (allShares ?? []).reduce((sum, s) => sum + Number(s.paid_amount), 0);
        const allSharesPaid = (allShares ?? []).length > 0 && (allShares ?? []).every((s) => Number(s.paid_amount) >= Number(s.share_amount));
        const newStatus = allSharesPaid ? "LUNAS" : totalPaid <= 0 ? (invoice.due_date < today ? "JATUH_TEMPO" : "TERBIT") : "SEBAGIAN_DIBAYAR";
        await admin.from("invoices").update({ paid_total: totalPaid, status: newStatus }).eq("id", invoice.id);
      } else {
        const newPaidTotal = Math.max(0, Number(invoice.paid_total) - Number(alloc.amount));
        const newStatus = newPaidTotal <= 0 ? (invoice.due_date < today ? "JATUH_TEMPO" : "TERBIT") : newPaidTotal >= Number(invoice.total) ? "LUNAS" : "SEBAGIAN_DIBAYAR";
        await admin.from("invoices").update({ paid_total: newPaidTotal, status: newStatus }).eq("id", invoice.id);
      }
      affectedInvoices.push(invoice.id);
    }

    // 2) Kalau ada kelebihan bayar yang jadi deposit, tarik balik sebisanya
    // (bisa jadi sebagian sudah kepake FIFO oleh transaksi lain setelahnya).
    let clawedBackFromExcessDeposit = 0;
    let unclawedExcessDeposit = 0;
    const excessAlloc = (allocations ?? []).find((a) => !a.invoice_id);
    if (excessAlloc) {
      const { data: excessDeposit } = await admin
        .from("deposits")
        .select("id, remaining_amount")
        .eq("source_payment_id", payment_id)
        .eq("source_type", "KELEBIHAN_BAYAR")
        .maybeSingle();
      if (excessDeposit) {
        const take = Math.min(Number(excessDeposit.remaining_amount), Number(excessAlloc.amount));
        if (take > 0) {
          await admin.from("deposits").update({ remaining_amount: Number(excessDeposit.remaining_amount) - take }).eq("id", excessDeposit.id);
          clawedBackFromExcessDeposit = take;
        }
        unclawedExcessDeposit = Number(excessAlloc.amount) - take;
      } else {
        unclawedExcessDeposit = Number(excessAlloc.amount);
      }
    }

    // 3) Kalau pembayaran ini tadinya pakai saldo deposit, kembalikan sebagai deposit baru.
    if (Number(payment.deposit_used) > 0) {
      await admin.from("deposits").insert({
        tenant_id: payment.tenant_id,
        source_type: "PENYESUAIAN",
        source_payment_id: payment_id,
        amount: payment.deposit_used,
        remaining_amount: payment.deposit_used,
      });
    }

    // 4) Balikin kuota voucher kalau dipakai (bukan bagian buku besar keuangan,
    // jadi baris usage-nya boleh dihapus — beda dari ledger_entries/payment_allocations).
    if (payment.voucher_id) {
      await admin.from("voucher_usages").delete().eq("payment_id", payment_id);
      const { data: voucher } = await admin.from("vouchers").select("used_count").eq("id", payment.voucher_id).single();
      if (voucher) await admin.from("vouchers").update({ used_count: Math.max(0, voucher.used_count - 1) }).eq("id", payment.voucher_id);
    }

    const balanceAfter = await getDepositBalance(admin, payment.tenant_id);

    // 5) Satu ledger entry ringkasan pembatalan — selalu dibuat, apa pun rincian di atas.
    await admin.from("ledger_entries").insert({
      tenant_id: payment.tenant_id,
      entry_type: "PENYESUAIAN",
      amount: 0,
      balance_after: balanceAfter,
      reference_type: "payment",
      reference_id: payment_id,
      description: `Pembayaran ${payment.payment_number} dibatalkan admin. Alasan: ${reason.trim()}`,
    });
    if (Number(payment.deposit_used) > 0) {
      await admin.from("ledger_entries").insert({
        tenant_id: payment.tenant_id,
        entry_type: "PENYESUAIAN",
        amount: Number(payment.deposit_used),
        balance_after: await getDepositBalance(admin, payment.tenant_id),
        reference_type: "payment",
        reference_id: payment_id,
        description: `Deposit dikembalikan karena pembayaran ${payment.payment_number} dibatalkan`,
      });
    }
    if (clawedBackFromExcessDeposit > 0 || unclawedExcessDeposit > 0) {
      await admin.from("ledger_entries").insert({
        tenant_id: payment.tenant_id,
        entry_type: "PENYESUAIAN",
        amount: -clawedBackFromExcessDeposit,
        balance_after: await getDepositBalance(admin, payment.tenant_id),
        reference_type: "payment",
        reference_id: payment_id,
        description:
          `Kelebihan bayar dari ${payment.payment_number} ditarik balik dari deposit` +
          (unclawedExcessDeposit > 0 ? ` (Rp${Math.round(unclawedExcessDeposit).toLocaleString("id-ID")} sudah kepakai duluan, jadi nggak bisa ditarik)` : ""),
      });
    }

    // 6) Status pembayaran -> DIBATALKAN, simpan alasannya (reuse kolom rejected_reason).
    await admin.from("payments").update({ status: "DIBATALKAN", rejected_reason: reason.trim() }).eq("id", payment_id);

    await admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action: "cancel_payment",
      target_table: "payments",
      target_id: payment_id,
      metadata: { reason: reason.trim(), affected_invoices: affectedInvoices, unclawed_excess_deposit: unclawedExcessDeposit },
    });

    try {
      const lines = [
        `Halo ${tenant.full_name}! 👋`,
        "",
        `Pembayaran ${payment.payment_number} sebesar ${rupiah(Number(payment.amount))} DIBATALKAN oleh admin.`,
        `Alasan: ${reason.trim()}`,
        "",
        "Tagihan terkait sudah disesuaikan kembali. Hubungi admin kalau ada pertanyaan.",
      ];
      await sendWhatsApp(tenant.phone, lines.join("\n"));
    } catch {
      // notifikasi gagal tidak menggagalkan pembatalan yang sudah tercatat
    }

    return jsonResponse({ ok: true, affected_invoices: affectedInvoices, unclawed_excess_deposit: unclawedExcessDeposit });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
