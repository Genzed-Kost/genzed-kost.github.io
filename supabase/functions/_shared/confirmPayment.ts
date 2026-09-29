// Satu-satunya tempat yang boleh "menyelesaikan" pembayaran: pindahkan status
// payment jadi LUNAS, terapkan ke saldo tagihan, kurangi deposit, tandai voucher
// terpakai, dan catat semuanya di ledger. Dipanggil dari:
//   1. create-payment  — kalau deposit+voucher sudah nutup semua (tanpa perlu bayar eksternal)
//   2. (Modul 5) admin menyetujui bukti transfer manual
//
// Pakai "optimistic lock" (update .eq('status','MENUNGGU')) supaya kalau dipanggil
// dobel (mis. webhook retry) tidak diproses dua kali.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { generateInvoicePdfAndNotify } from "./invoicePdf.ts";

export async function confirmPayment(admin: SupabaseClient, paymentId: string): Promise<{ processed: boolean }> {
  const nowIso = new Date().toISOString();

  const { data: payment, error: lockErr } = await admin
    .from("payments")
    .update({ status: "LUNAS", paid_at: nowIso })
    .eq("id", paymentId)
    .eq("status", "MENUNGGU")
    .select("id, tenant_id, deposit_used, voucher_id, voucher_discount")
    .maybeSingle();

  if (lockErr || !payment) {
    return { processed: false }; // sudah diproses sebelumnya, atau status bukan MENUNGGU
  }

  const { data: allocations } = await admin
    .from("payment_allocations")
    .select("id, invoice_id, amount")
    .eq("payment_id", paymentId);

  const affectedInvoiceIds: string[] = [];

  for (const alloc of allocations ?? []) {
    if (alloc.invoice_id) {
      const { data: invoice } = await admin
        .from("invoices")
        .select("id, total, paid_total")
        .eq("id", alloc.invoice_id)
        .single();
      if (!invoice) continue;

      // Invoice co-tenant (Prioritas 4) dibagi jadi invoice_shares per penghuni —
      // yang bertambah itu PORSI penghuni ini, bukan langsung invoices.paid_total.
      // Kontrak biasa (single tenant) nggak punya baris invoice_shares sama sekali,
      // jadi jalur di bawah (else) yang lama tetap dipakai apa adanya.
      const { data: share } = await admin
        .from("invoice_shares")
        .select("id, share_amount, paid_amount")
        .eq("invoice_id", alloc.invoice_id)
        .eq("tenant_id", payment.tenant_id)
        .maybeSingle();

      if (share) {
        const newSharePaid = Math.min(Number(share.share_amount), Number(share.paid_amount) + Number(alloc.amount));
        await admin.from("invoice_shares").update({ paid_amount: newSharePaid }).eq("id", share.id);

        const { data: allShares } = await admin.from("invoice_shares").select("share_amount, paid_amount").eq("invoice_id", alloc.invoice_id);
        const totalPaid = (allShares ?? []).reduce((sum, s) => sum + Number(s.paid_amount), 0);
        const allSharesPaid = (allShares ?? []).every((s) => Number(s.paid_amount) >= Number(s.share_amount));
        const newStatus = allSharesPaid ? "LUNAS" : "SEBAGIAN_DIBAYAR";

        await admin.from("invoices").update({ paid_total: totalPaid, status: newStatus }).eq("id", invoice.id);
        if (newStatus === "LUNAS") affectedInvoiceIds.push(invoice.id);
      } else {
        const newPaidTotal = Number(invoice.paid_total) + Number(alloc.amount);
        const newStatus = newPaidTotal >= Number(invoice.total) ? "LUNAS" : "SEBAGIAN_DIBAYAR";

        await admin.from("invoices").update({ paid_total: newPaidTotal, status: newStatus }).eq("id", invoice.id);
        if (newStatus === "LUNAS") affectedInvoiceIds.push(invoice.id);
      }
    } else {
      // invoice_id null = kelebihan bayar, dicatat sebagai deposit baru
      const { data: newDeposit } = await admin
        .from("deposits")
        .insert({
          tenant_id: payment.tenant_id,
          source_type: "KELEBIHAN_BAYAR",
          source_payment_id: payment.id,
          amount: alloc.amount,
          remaining_amount: alloc.amount,
        })
        .select("id")
        .single();

      if (newDeposit) {
        const balance = await getDepositBalance(admin, payment.tenant_id);
        await admin.from("ledger_entries").insert({
          tenant_id: payment.tenant_id,
          entry_type: "DEPOSIT_MASUK",
          amount: alloc.amount,
          balance_after: balance,
          reference_type: "payment",
          reference_id: payment.id,
          description: "Kelebihan bayar otomatis jadi saldo deposit",
        });
      }
    }
  }

  if (Number(payment.deposit_used) > 0) {
    await deductDeposit(admin, payment.tenant_id, Number(payment.deposit_used), {
      referenceType: "payment",
      referenceId: payment.id,
      description: "Saldo deposit dipakai untuk membayar tagihan",
    });
  }

  if (payment.voucher_id && Number(payment.voucher_discount) > 0) {
    await admin.from("voucher_usages").insert({
      voucher_id: payment.voucher_id,
      tenant_id: payment.tenant_id,
      payment_id: payment.id,
      discount_amount: payment.voucher_discount,
    });
    const { data: voucher } = await admin.from("vouchers").select("used_count").eq("id", payment.voucher_id).single();
    if (voucher) {
      await admin.from("vouchers").update({ used_count: voucher.used_count + 1 }).eq("id", payment.voucher_id);
    }
  }

  await admin.from("audit_logs").insert({
    actor_id: null,
    action: "confirm_payment",
    target_table: "payments",
    target_id: payment.id,
    metadata: { affected_invoices: affectedInvoiceIds },
  });

  for (const invoiceId of affectedInvoiceIds) {
    try {
      await generateInvoicePdfAndNotify(admin, invoiceId);
    } catch {
      // PDF/notifikasi gagal tidak boleh membatalkan pelunasan yang sudah tercatat
    }
  }

  return { processed: true };
}

// Kurangi saldo deposit tenant secara FIFO (deposit terlama dipakai duluan) sejumlah `amount`,
// lalu catat ledger entry-nya. Diekspor juga buat dipakai end-tenancy (checkout & refund deposit).
export async function deductDeposit(
  admin: SupabaseClient,
  tenantId: string,
  amount: number,
  opts: { referenceType: string; referenceId: string | null; description: string; entryType?: "DEPOSIT_KELUAR" | "REFUND" | "PENYESUAIAN" }
) {
  let remaining = amount;
  const { data: deposits } = await admin
    .from("deposits")
    .select("id, remaining_amount")
    .eq("tenant_id", tenantId)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  for (const dep of deposits ?? []) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(dep.remaining_amount));
    await admin
      .from("deposits")
      .update({ remaining_amount: Number(dep.remaining_amount) - take })
      .eq("id", dep.id);
    remaining -= take;
  }

  const balanceAfter = await getDepositBalance(admin, tenantId);
  await admin.from("ledger_entries").insert({
    tenant_id: tenantId,
    entry_type: opts.entryType ?? "DEPOSIT_KELUAR",
    amount: -amount,
    balance_after: balanceAfter,
    reference_type: opts.referenceType,
    reference_id: opts.referenceId,
    description: opts.description,
  });
}

export async function getDepositBalance(admin: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await admin.from("deposits").select("remaining_amount").eq("tenant_id", tenantId);
  return (data ?? []).reduce((sum, d) => sum + Number(d.remaining_amount), 0);
}
