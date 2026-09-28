// Checkout penghuni (akhiri kontrak): hitung refund/kekurangan deposit,
// lunasi tagihan tertunggak pakai sisa deposit, catat semuanya di ledger
// (JANGAN pernah hapus/ubah baris lama — selalu ledger entry baru),
// bebasin kamar, nonaktifkan akun (riwayat tetap ada), kirim rincian via WA.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { allocatePayment } from "../_shared/payment.ts";
import { deductDeposit, getDepositBalance } from "../_shared/confirmPayment.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";
import { inclusiveDayCount } from "../_shared/billing.ts";

function rupiah(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function jakartaToday(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
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
    if (callerProfile?.role !== "admin") return jsonResponse({ error: "Hanya admin yang bisa mengakhiri kontrak." }, 403);

    const { tenancy_id, damage_deduction, damage_note } = await req.json();
    if (!tenancy_id) return jsonResponse({ error: "tenancy_id wajib diisi." }, 400);

    const damageDeduction = Math.max(0, Math.round(Number(damage_deduction) || 0));

    const { data: tenancy } = await admin
      .from("tenancies")
      .select("id, tenant_id, room_id, status, tenant:profiles!tenancies_tenant_id_fkey(full_name, phone)")
      .eq("id", tenancy_id)
      .maybeSingle();
    if (!tenancy) return jsonResponse({ error: "Kontrak tidak ditemukan." }, 404);
    if (tenancy.status !== "AKTIF") return jsonResponse({ error: "Kontrak ini sudah tidak aktif." }, 409);

    const tenant = tenancy.tenant as unknown as { full_name: string; phone: string };

    const { data: invoices } = await admin
      .from("invoices")
      .select("id, invoice_number, due_date, total, paid_total")
      .eq("tenant_id", tenancy.tenant_id)
      .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"]);

    const outstandingTotal = (invoices ?? []).reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.paid_total)), 0);
    const depositBalanceBefore = await getDepositBalance(admin, tenancy.tenant_id);

    // 1) Potongan kerusakan diambil duluan dari deposit.
    if (damageDeduction > 0) {
      const toDeduct = Math.min(damageDeduction, depositBalanceBefore);
      if (toDeduct > 0) {
        await deductDeposit(admin, tenancy.tenant_id, toDeduct, {
          referenceType: "tenancy",
          referenceId: tenancy.id,
          description: `Potongan kerusakan saat checkout${damage_note ? `: ${damage_note}` : ""}`,
          entryType: "PENYESUAIAN",
        });
      }
    }

    const availableAfterDamage = Math.max(0, depositBalanceBefore - damageDeduction);

    // 2) Sisa deposit dipakai lunasi tagihan tertunggak, tertua duluan.
    const allocation = allocatePayment(
      availableAfterDamage,
      (invoices ?? []).map((inv) => ({ id: inv.id, dueDate: inv.due_date, outstanding: Number(inv.total) - Number(inv.paid_total) }))
    );

    if (allocation.totalAllocated > 0) {
      await deductDeposit(admin, tenancy.tenant_id, allocation.totalAllocated, {
        referenceType: "tenancy",
        referenceId: tenancy.id,
        description: "Saldo deposit dipakai melunasi tagihan tertunggak saat checkout",
      });
      for (const alloc of allocation.allocations) {
        const inv = (invoices ?? []).find((i) => i.id === alloc.invoiceId)!;
        const newPaidTotal = Number(inv.paid_total) + alloc.amount;
        const newStatus = newPaidTotal >= Number(inv.total) ? "LUNAS" : "SEBAGIAN_DIBAYAR";
        await admin.from("invoices").update({ paid_total: newPaidTotal, status: newStatus }).eq("id", inv.id);
      }
    }

    // 3) Sisa setelah nutup semua tagihan = refund tunai ke penghuni.
    const refundAmount = allocation.leftover;
    if (refundAmount > 0) {
      await deductDeposit(admin, tenancy.tenant_id, refundAmount, {
        referenceType: "tenancy",
        referenceId: tenancy.id,
        description: "Refund deposit saat checkout",
        entryType: "REFUND",
      });
    }

    const { data: invoicesAfter } = await admin
      .from("invoices")
      .select("total, paid_total")
      .eq("tenant_id", tenancy.tenant_id)
      .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"]);
    const finalOwed = (invoicesAfter ?? []).reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.paid_total)), 0);

    // 3.5) Tagihan LUNAS yang periodenya belum habis (mis. hasil bayar di muka) —
    // bagian yang belum kepake direfund proporsional, di luar hitungan deposit
    // di atas (ini uang yang udah masuk dari pembayaran, bukan saldo deposit).
    const todayStr = jakartaToday().toISOString().slice(0, 10);
    const { data: prepaidInvoices } = await admin
      .from("invoices")
      .select("id, invoice_number, period_start, period_end, total")
      .eq("tenant_id", tenancy.tenant_id)
      .eq("status", "LUNAS")
      .gt("period_end", todayStr);

    let prepaidRefund = 0;
    for (const inv of prepaidInvoices ?? []) {
      const periodStart = new Date(`${inv.period_start}T00:00:00.000Z`);
      const periodEnd = new Date(`${inv.period_end}T00:00:00.000Z`);
      const effectiveStart = periodStart > jakartaToday() ? periodStart : jakartaToday();
      const totalDays = inclusiveDayCount(periodStart, periodEnd);
      const unusedDays = inclusiveDayCount(effectiveStart, periodEnd);
      if (unusedDays <= 0 || totalDays <= 0) continue;
      const unusedAmount = Math.round((Number(inv.total) * unusedDays) / totalDays);
      if (unusedAmount > 0) prepaidRefund += unusedAmount;
    }
    if (prepaidRefund > 0) {
      await admin.from("ledger_entries").insert({
        tenant_id: tenancy.tenant_id,
        entry_type: "REFUND",
        amount: -prepaidRefund,
        balance_after: await getDepositBalance(admin, tenancy.tenant_id),
        reference_type: "tenancy",
        reference_id: tenancy.id,
        description: `Refund sisa periode bayar di muka yang belum kepake saat checkout (${(prepaidInvoices ?? []).map((i) => i.invoice_number).join(", ")})`,
      });
    }

    // 4) Tutup kontrak, bebasin kamar, nonaktifkan akun (riwayat tetap tersimpan).
    await admin
      .from("tenancies")
      .update({ status: "BERAKHIR", end_date: new Date().toISOString().slice(0, 10) })
      .eq("id", tenancy.id);
    await admin.from("rooms").update({ is_occupied: false }).eq("id", tenancy.room_id);
    await admin.from("profiles").update({ is_active: false }).eq("id", tenancy.tenant_id);

    const totalRefund = refundAmount + prepaidRefund;

    await admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action: "end_tenancy",
      target_table: "tenancies",
      target_id: tenancy.id,
      metadata: {
        deposit_balance_before: depositBalanceBefore,
        outstanding_before: outstandingTotal,
        damage_deduction: damageDeduction,
        damage_note: damage_note ?? null,
        refund_amount: refundAmount,
        prepaid_refund: prepaidRefund,
        total_refund: totalRefund,
        final_owed: finalOwed,
      },
    });

    try {
      const lines = [
        `Halo ${tenant.full_name}! 👋`,
        "",
        "Kontrak kost lo sudah resmi diakhiri. Rincian checkout:",
        `Saldo deposit: ${rupiah(depositBalanceBefore)}`,
      ];
      if (damageDeduction > 0) lines.push(`Potongan kerusakan: -${rupiah(damageDeduction)}${damage_note ? ` (${damage_note})` : ""}`);
      if (allocation.totalAllocated > 0) lines.push(`Dipakai lunasi tagihan tertunggak: -${rupiah(allocation.totalAllocated)}`);
      if (prepaidRefund > 0) lines.push(`Sisa periode bayar di muka yang belum kepake: ${rupiah(prepaidRefund)}`);
      if (totalRefund > 0) lines.push(`💰 Refund yang perlu dikembalikan ke lo: ${rupiah(totalRefund)}`);
      if (finalOwed > 0) lines.push(`⚠️ Masih ada tagihan belum lunas: ${rupiah(finalOwed)} — mohon diselesaikan ke admin.`);
      if (totalRefund === 0 && finalOwed === 0) lines.push("Semua tagihan lunas, nggak ada sisa deposit. Makasih ya udah tinggal di Genzed Kost! 🙏");
      await sendWhatsApp(tenant.phone, lines.join("\n"));
    } catch {
      // notifikasi gagal tidak menggagalkan proses checkout yang sudah tercatat
    }

    return jsonResponse({
      ok: true,
      deposit_balance_before: depositBalanceBefore,
      damage_deduction: damageDeduction,
      applied_to_invoices: allocation.totalAllocated,
      refund_amount: totalRefund,
      deposit_refund: refundAmount,
      prepaid_refund: prepaidRefund,
      final_owed: finalOwed,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
