// Titik masuk utama alur pembayaran. Semua perhitungan (voucher, deposit, alokasi,
// biaya admin) dihitung ULANG di server — klien cuma kirim pilihan, tidak pernah
// dipercaya untuk kirim nominal akhir.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { allocatePayment, calculateAdminFee, checkAndCalculateVoucher, generateUniqueCode, type FeeConfig } from "../_shared/payment.ts";
import { createGatewayTransaction } from "../_shared/midtrans.ts";
import { buildQrisPayload } from "../_shared/qris.ts";
import { confirmPayment } from "../_shared/confirmPayment.ts";
import { isGatewayChannelId } from "../_shared/paymentChannels.ts";

type Method = "TRANSFER_MANUAL" | "QRIS_STATIS" | "GATEWAY";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = getSupabaseAdmin();
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) return jsonResponse({ error: "Tidak terautentikasi." }, 401);

    const { data: tenant } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", caller.user.id)
      .single();
    if (!tenant) return jsonResponse({ error: "Profil tidak ditemukan." }, 404);

    const body = await req.json();
    const {
      invoice_ids,
      pay_all_outstanding,
      partial_amount,
      use_deposit_amount,
      voucher_code,
      method,
      payment_account_id,
      gateway_channel,
      want_public_link,
      idempotency_key,
    }: {
      invoice_ids?: string[];
      pay_all_outstanding?: boolean;
      partial_amount?: number;
      use_deposit_amount?: number;
      voucher_code?: string;
      method: Method;
      payment_account_id?: string;
      gateway_channel?: string;
      want_public_link?: boolean;
      idempotency_key: string;
    } = body;

    if (!idempotency_key) return jsonResponse({ error: "idempotency_key wajib diisi." }, 400);
    if (!["TRANSFER_MANUAL", "QRIS_STATIS", "GATEWAY"].includes(method)) {
      return jsonResponse({ error: "Metode pembayaran tidak valid." }, 400);
    }
    if (method === "TRANSFER_MANUAL" && !payment_account_id) {
      return jsonResponse({ error: "Pilih rekening tujuan transfer dulu." }, 400);
    }
    if (method === "GATEWAY" && !isGatewayChannelId(gateway_channel)) {
      return jsonResponse({ error: "Pilih channel pembayaran otomatis dulu (VA/e-wallet/QRIS/retail)." }, 400);
    }

    // Idempotency: kalau request ini pernah diproses, balikin hasil yang sama, jangan bikin baru.
    const { data: existingPayment } = await admin
      .from("payments")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (existingPayment) {
      const replayExtra: Record<string, unknown> = {};
      if (existingPayment.gateway_redirect_url) replayExtra.redirect_url = existingPayment.gateway_redirect_url;
      const replayExternal =
        Number(existingPayment.amount) - Number(existingPayment.deposit_used) - Number(existingPayment.voucher_discount);
      const replayGross = replayExternal + Number(existingPayment.admin_fee) + Number(existingPayment.unique_code ?? 0);
      if (existingPayment.method === "TRANSFER_MANUAL") {
        if (existingPayment.payment_account_id) {
          const { data: acc } = await admin.from("payment_accounts").select("*").eq("id", existingPayment.payment_account_id).maybeSingle();
          replayExtra.account = acc ?? null;
        }
        replayExtra.total_to_transfer = replayGross;
      } else if (existingPayment.method === "QRIS_STATIS") {
        const merchantAccount = Deno.env.get("QRIS_MERCHANT_ACCOUNT");
        if (merchantAccount) {
          replayExtra.qris_payload = buildQrisPayload({ merchantAccount, amount: replayGross, referenceCode: existingPayment.payment_number });
          replayExtra.total_to_transfer = replayGross;
        }
      }
      return jsonResponse({ ok: true, payment: existingPayment, already_existed: true, ...replayExtra });
    }

    const PAYABLE_STATUSES = ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"];
    let invoicesQuery = admin
      .from("invoices")
      .select("id, invoice_number, due_date, total, paid_total, status")
      .eq("tenant_id", tenant.id)
      .in("status", PAYABLE_STATUSES);
    if (!pay_all_outstanding) {
      if (!invoice_ids || invoice_ids.length === 0) {
        return jsonResponse({ error: "Pilih minimal 1 tagihan." }, 400);
      }
      invoicesQuery = invoicesQuery.in("id", invoice_ids);
    }
    const { data: invoices, error: invErr } = await invoicesQuery;
    if (invErr) return jsonResponse({ error: invErr.message }, 500);
    if (!invoices || invoices.length === 0) {
      return jsonResponse({ error: "Tagihan tidak ditemukan atau sudah lunas." }, 404);
    }

    const totalOutstanding = invoices.reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.paid_total)), 0);
    const transactionAmount = Math.min(
      partial_amount != null ? Math.round(partial_amount) : totalOutstanding,
      totalOutstanding
    );
    if (transactionAmount <= 0) {
      return jsonResponse({ error: "Nominal pembayaran tidak valid." }, 400);
    }

    // Voucher
    let voucherDiscount = 0;
    let voucherId: string | null = null;
    if (voucher_code) {
      const { data: voucher } = await admin
        .from("vouchers")
        .select("*")
        .eq("code", voucher_code.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (!voucher) return jsonResponse({ error: "Kode voucher tidak ditemukan." }, 404);

      const check = checkAndCalculateVoucher(
        {
          voucherType: voucher.voucher_type,
          value: Number(voucher.value),
          maxDiscount: voucher.max_discount != null ? Number(voucher.max_discount) : null,
          minTransaction: Number(voucher.min_transaction),
          quota: voucher.quota,
          usedCount: voucher.used_count,
          validFrom: voucher.valid_from,
          validUntil: voucher.valid_until,
        },
        transactionAmount
      );
      if (!check.valid) return jsonResponse({ error: check.reason }, 400);
      voucherDiscount = check.discount;
      voucherId = voucher.id;
    }

    // PENTING: voucherDiscount bukan pengurang nilai yang dialokasikan ke tagihan —
    // itu "kredit gratis" yang tetap dianggap melunasi sebesar nilainya, persis kayak
    // deposit. Yang dialokasikan ke invoice.paid_total tetap `transactionAmount` penuh
    // (voucher + deposit + yang benar-benar ditransfer). Kalau ini dikurangi duluan,
    // tagihan yang "dibayar" pakai voucher nggak akan pernah kesentuh LUNAS.
    const remainingAfterVoucher = transactionAmount - voucherDiscount;

    // Saldo deposit — isi sisa kebutuhan setelah voucher
    const { data: deposits } = await admin.from("deposits").select("remaining_amount").eq("tenant_id", tenant.id);
    const availableDeposit = (deposits ?? []).reduce((sum, d) => sum + Number(d.remaining_amount), 0);
    const depositUsed = Math.max(
      0,
      Math.min(use_deposit_amount != null ? Math.round(use_deposit_amount) : 0, availableDeposit, remainingAfterVoucher)
    );

    const amountToPayExternally = remainingAfterVoucher - depositUsed;

    // Minimum bayar sebagian — cuma berlaku kalau pembayaran ini TIDAK menutup semua outstanding.
    const fullyCovers = transactionAmount >= totalOutstanding;
    if (!fullyCovers) {
      const { data: minSetting } = await admin.from("settings").select("value").eq("key", "min_partial_payment").maybeSingle();
      const minPartial = Number(minSetting?.value ?? 50000);
      if (transactionAmount < minPartial) {
        return jsonResponse({ error: `Nominal pembayaran sebagian minimal Rp${minPartial.toLocaleString("id-ID")}.` }, 400);
      }
    }

    const { data: feeSetting } = await admin.from("settings").select("value").eq("key", "payment_method_fees").maybeSingle();
    const fees = (feeSetting?.value ?? {}) as Record<string, FeeConfig>;
    const { data: borneSetting } = await admin.from("settings").select("value").eq("key", "admin_fee_borne_by").maybeSingle();
    const borneBy = (borneSetting?.value as string) ?? "tenant";
    const { data: expirySetting } = await admin.from("settings").select("value").eq("key", "payment_expiry_hours").maybeSingle();
    const expiryHours = Number(expirySetting?.value ?? 24);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

    const monthKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const { count: paymentCount } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .like("payment_number", `PAY-${monthKey}-%`);
    const paymentNumber = `PAY-${monthKey}-${String((paymentCount ?? 0) + 1).padStart(4, "0")}`;

    let dbMethod: string = method === "GATEWAY" ? "VIRTUAL_ACCOUNT" : method; // dikoreksi setelah webhook Midtrans
    let adminFee = 0;
    let uniqueCode: number | null = null;
    let extra: Record<string, unknown> = {};
    let resolvedAccountId: string | null = null;

    if (amountToPayExternally <= 0) {
      // Deposit + voucher udah nutup semua, nggak butuh transfer eksternal sama sekali.
      dbMethod = depositUsed > 0 ? "SALDO_DEPOSIT" : "VOUCHER";
    } else if (method === "TRANSFER_MANUAL" || method === "QRIS_STATIS") {
      adminFee = calculateAdminFee(amountToPayExternally, fees.manual);
      uniqueCode = generateUniqueCode();
      const grossToTransfer = amountToPayExternally + (borneBy === "tenant" ? adminFee : 0) + uniqueCode;

      if (method === "TRANSFER_MANUAL") {
        const { data: account } = await admin
          .from("payment_accounts")
          .select("*")
          .eq("id", payment_account_id)
          .eq("is_active", true)
          .maybeSingle();
        if (!account) return jsonResponse({ error: "Rekening yang dipilih tidak ditemukan atau sudah nonaktif." }, 400);
        resolvedAccountId = account.id;
        extra = { account, total_to_transfer: grossToTransfer };
      } else {
        const merchantAccount = Deno.env.get("QRIS_MERCHANT_ACCOUNT");
        if (!merchantAccount) {
          return jsonResponse({ error: "QRIS belum dikonfigurasi admin. Pakai transfer manual dulu ya." }, 503);
        }
        const payload = buildQrisPayload({ merchantAccount, amount: grossToTransfer, referenceCode: paymentNumber });
        extra = { qris_payload: payload, total_to_transfer: grossToTransfer };
      }
    } else {
      // GATEWAY
      const { data: gatewayEnabled } = await admin.from("settings").select("value").eq("key", "payment_gateway_enabled").maybeSingle();
      if (gatewayEnabled?.value !== true) {
        return jsonResponse({ error: "Pembayaran otomatis lagi nggak aktif. Pakai transfer manual dulu ya." }, 503);
      }
      const channelFees = (fees.gateway_channels ?? {}) as Record<string, FeeConfig>;
      adminFee = calculateAdminFee(amountToPayExternally, channelFees[gateway_channel!]);
      const grossCharge = amountToPayExternally + (borneBy === "tenant" ? adminFee : 0);

      const itemName =
        invoices.length === 1
          ? `Tagihan Kost ${invoices[0].invoice_number}`
          : `Tagihan Kost (${invoices.length} tagihan)`;

      const gateway = await createGatewayTransaction({
        orderId: paymentNumber,
        grossAmount: grossCharge,
        itemName,
        customerName: tenant.full_name,
        customerEmail: tenant.email,
        customerPhone: tenant.phone,
        expiryHours,
        enabledPayments: [gateway_channel!],
      });
      extra = { redirect_url: gateway.redirectUrl, snap_token: gateway.token };
    }

    const { data: payment, error: payInsertErr } = await admin
      .from("payments")
      .insert({
        payment_number: paymentNumber,
        tenant_id: tenant.id,
        method: dbMethod,
        status: "MENUNGGU",
        amount: transactionAmount,
        admin_fee: adminFee,
        unique_code: uniqueCode,
        gateway_provider: method === "GATEWAY" ? "midtrans" : null,
        gateway_redirect_url: (extra as { redirect_url?: string }).redirect_url ?? null,
        idempotency_key,
        expires_at: expiresAt.toISOString(),
        deposit_used: depositUsed,
        voucher_id: voucherId,
        voucher_discount: voucherDiscount,
        created_by: tenant.id,
        public_link_token: want_public_link ? crypto.randomUUID() : null,
        payment_account_id: resolvedAccountId,
      })
      .select("*")
      .single();
    if (payInsertErr || !payment) return jsonResponse({ error: payInsertErr?.message ?? "Gagal membuat pembayaran." }, 500);

    const allocation = allocatePayment(
      transactionAmount,
      invoices.map((inv) => ({ id: inv.id, dueDate: inv.due_date, outstanding: Number(inv.total) - Number(inv.paid_total) }))
    );
    const rows = allocation.allocations.map((a) => ({ payment_id: payment.id, invoice_id: a.invoiceId, amount: a.amount }));
    if (allocation.leftover > 0) rows.push({ payment_id: payment.id, invoice_id: null as unknown as string, amount: allocation.leftover });
    if (rows.length > 0) await admin.from("payment_allocations").insert(rows);

    if (amountToPayExternally <= 0) {
      await confirmPayment(admin, payment.id);
      payment.status = "LUNAS";
      payment.paid_at = new Date().toISOString();
    }

    return jsonResponse({ ok: true, payment, ...extra });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
