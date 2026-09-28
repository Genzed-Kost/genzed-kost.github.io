// Bayar di muka: penghuni siklus BULANAN sekalian bayar beberapa bulan ke
// depan dapat diskon. Bikin N tagihan periode depan (persis pola anchor yang
// sama kayak generate-monthly-invoices, jadi mesin tagihan otomatis nanti
// nyambung mulus tanpa dobel), lalu langsung dibuatkan SATU pembayaran yang
// melunasi semuanya — settlement-nya tetap lewat confirmPayment (satu pintu),
// sama kayak metode pembayaran lain.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { calculateAdminFee, generateUniqueCode, type FeeConfig } from "../_shared/payment.ts";
import { createGatewayTransaction } from "../_shared/midtrans.ts";
import { buildQrisPayload } from "../_shared/qris.ts";
import {
  billingAnchorFromStartDate,
  calculateAdvancePaymentTotal,
  distributeDiscount,
  formatInvoiceNumber,
  generateAdvancePeriods,
} from "../_shared/billing.ts";

type Method = "TRANSFER_MANUAL" | "QRIS_STATIS" | "GATEWAY";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = getSupabaseAdmin();
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) return jsonResponse({ error: "Tidak terautentikasi." }, 401);

    const { data: tenant } = await admin.from("profiles").select("id, full_name, email, phone").eq("id", caller.user.id).single();
    if (!tenant) return jsonResponse({ error: "Profil tidak ditemukan." }, 404);

    const body = await req.json();
    const {
      tenancy_id,
      months_count,
      method,
      payment_account_id,
      want_public_link,
      idempotency_key,
    }: {
      tenancy_id: string;
      months_count: number;
      method: Method;
      payment_account_id?: string;
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

    const { data: existingPayment } = await admin.from("payments").select("*").eq("idempotency_key", idempotency_key).maybeSingle();
    if (existingPayment) {
      return jsonResponse({ ok: true, payment: existingPayment, already_existed: true });
    }

    const { data: tenancy } = await admin
      .from("tenancies")
      .select("id, tenant_id, billing_cycle, monthly_rate, start_date, status")
      .eq("id", tenancy_id)
      .maybeSingle();
    if (!tenancy || tenancy.tenant_id !== tenant.id) return jsonResponse({ error: "Kontrak tidak ditemukan." }, 404);
    if (tenancy.status !== "AKTIF") return jsonResponse({ error: "Kontrak ini sudah tidak aktif." }, 409);
    if (tenancy.billing_cycle !== "BULANAN") {
      return jsonResponse({ error: "Bayar di muka cuma tersedia untuk kontrak siklus Bulanan." }, 400);
    }

    const { data: discountSetting } = await admin.from("settings").select("value").eq("key", "advance_payment_discounts").maybeSingle();
    const tiers = (discountSetting?.value ?? []) as { months: number; discount_percent: number }[];
    const tier = tiers.find((t) => t.months === months_count);
    if (!tier) return jsonResponse({ error: "Durasi bayar di muka itu nggak tersedia." }, 400);

    const { data: lastInvoice } = await admin
      .from("invoices")
      .select("period_end")
      .eq("tenancy_id", tenancy.id)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastInvoice) {
      return jsonResponse({ error: "Kontrak ini belum punya tagihan pertama, coba lagi nanti." }, 409);
    }

    const tenancyStart = new Date(`${tenancy.start_date}T00:00:00.000Z`);
    const anchor = billingAnchorFromStartDate(tenancyStart);
    const startAfter = addDays(new Date(`${lastInvoice.period_end}T00:00:00.000Z`), 1);
    const periods = generateAdvancePeriods(startAfter, months_count, anchor);

    // Jaga-jaga dobel klik / retry: kalau periode pertamanya udah ada tagihan, tolak.
    const { data: alreadyExists } = await admin
      .from("invoices")
      .select("id")
      .eq("tenancy_id", tenancy.id)
      .eq("period_start", toDateOnlyString(periods[0].periodStart))
      .maybeSingle();
    if (alreadyExists) return jsonResponse({ error: "Periode ini sudah ada tagihannya. Refresh halaman ya." }, 409);

    const { subtotal, discount, total: netTotal } = calculateAdvancePaymentTotal(tenancy.monthly_rate, months_count, tier.discount_percent);
    const perPeriodDiscount = distributeDiscount(
      periods.map(() => tenancy.monthly_rate),
      discount
    );

    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const newInvoiceIds: string[] = [];
    for (let i = 0; i < periods.length; i++) {
      const { count } = await admin.from("invoices").select("id", { count: "exact", head: true }).like("invoice_number", `INV-${monthKey}-%`);
      const invoiceNumber = formatInvoiceNumber(now, (count ?? 0) + 1);
      const periodTotal = tenancy.monthly_rate - perPeriodDiscount[i];

      const { data: invoice, error: invErr } = await admin
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          tenant_id: tenant.id,
          tenancy_id: tenancy.id,
          period_start: toDateOnlyString(periods[i].periodStart),
          period_end: toDateOnlyString(periods[i].periodEnd),
          due_date: toDateOnlyString(periods[i].periodStart),
          status: "TERBIT",
          subtotal: tenancy.monthly_rate,
          discount_total: perPeriodDiscount[i],
          penalty_total: 0,
          total: periodTotal,
          paid_total: 0,
          notes: `Bayar di muka — bulan ke-${i + 1} dari ${months_count} (diskon ${tier.discount_percent}%)`,
        })
        .select("id")
        .single();
      if (invErr || !invoice) {
        return jsonResponse({ error: "Gagal membuat tagihan prabayar: " + (invErr?.message ?? "unknown") }, 500);
      }
      await admin.from("invoice_items").insert({
        invoice_id: invoice.id,
        item_type: "SEWA_KAMAR",
        description: `Sewa kamar (bayar di muka) — periode ${toDateOnlyString(periods[i].periodStart)} s/d ${toDateOnlyString(periods[i].periodEnd)}`,
        quantity: 1,
        unit_price: tenancy.monthly_rate,
        amount: tenancy.monthly_rate,
      });
      if (perPeriodDiscount[i] > 0) {
        await admin.from("invoice_items").insert({
          invoice_id: invoice.id,
          item_type: "DISKON",
          description: `Diskon bayar di muka ${tier.discount_percent}%`,
          quantity: 1,
          unit_price: -perPeriodDiscount[i],
          amount: -perPeriodDiscount[i],
        });
      }
      newInvoiceIds.push(invoice.id);
    }

    const { data: feeSetting } = await admin.from("settings").select("value").eq("key", "payment_method_fees").maybeSingle();
    const fees = (feeSetting?.value ?? {}) as Record<string, FeeConfig>;
    const { data: borneSetting } = await admin.from("settings").select("value").eq("key", "admin_fee_borne_by").maybeSingle();
    const borneBy = (borneSetting?.value as string) ?? "tenant";
    const { data: expirySetting } = await admin.from("settings").select("value").eq("key", "payment_expiry_hours").maybeSingle();
    const expiryHours = Number(expirySetting?.value ?? 24);
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

    const { count: paymentCount } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .like("payment_number", `PAY-${monthKey}-%`);
    const paymentNumber = `PAY-${monthKey}-${String((paymentCount ?? 0) + 1).padStart(4, "0")}`;

    let dbMethod: string = method === "GATEWAY" ? "VIRTUAL_ACCOUNT" : method;
    let adminFee = 0;
    let uniqueCode: number | null = null;
    let extra: Record<string, unknown> = {};

    if (method === "TRANSFER_MANUAL" || method === "QRIS_STATIS") {
      adminFee = calculateAdminFee(netTotal, fees.manual);
      uniqueCode = generateUniqueCode();
      const grossToTransfer = netTotal + (borneBy === "tenant" ? adminFee : 0) + uniqueCode;

      if (method === "TRANSFER_MANUAL") {
        const { data: account } = await admin.from("payment_accounts").select("*").eq("id", payment_account_id).eq("is_active", true).maybeSingle();
        if (!account) return jsonResponse({ error: "Rekening yang dipilih tidak ditemukan atau sudah nonaktif." }, 400);
        extra = { account, total_to_transfer: grossToTransfer };
      } else {
        const merchantAccount = Deno.env.get("QRIS_MERCHANT_ACCOUNT");
        if (!merchantAccount) return jsonResponse({ error: "QRIS belum dikonfigurasi admin. Pakai transfer manual dulu ya." }, 503);
        const payload = buildQrisPayload({ merchantAccount, amount: grossToTransfer, referenceCode: paymentNumber });
        extra = { qris_payload: payload, total_to_transfer: grossToTransfer };
      }
    } else {
      const { data: gatewayEnabled } = await admin.from("settings").select("value").eq("key", "payment_gateway_enabled").maybeSingle();
      if (gatewayEnabled?.value !== true) {
        return jsonResponse({ error: "Pembayaran otomatis lagi nggak aktif. Pakai transfer manual dulu ya." }, 503);
      }
      adminFee = calculateAdminFee(netTotal, fees.gateway);
      const grossCharge = netTotal + (borneBy === "tenant" ? adminFee : 0);
      const gateway = await createGatewayTransaction({
        orderId: paymentNumber,
        grossAmount: grossCharge,
        itemName: `Bayar di Muka ${months_count} Bulan`,
        customerName: tenant.full_name,
        customerEmail: tenant.email,
        customerPhone: tenant.phone,
        expiryHours,
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
        amount: netTotal,
        admin_fee: adminFee,
        unique_code: uniqueCode,
        gateway_provider: method === "GATEWAY" ? "midtrans" : null,
        gateway_redirect_url: (extra as { redirect_url?: string }).redirect_url ?? null,
        idempotency_key,
        expires_at: expiresAt.toISOString(),
        deposit_used: 0,
        voucher_id: null,
        voucher_discount: 0,
        created_by: tenant.id,
        public_link_token: want_public_link ? crypto.randomUUID() : null,
        payment_account_id: method === "TRANSFER_MANUAL" ? payment_account_id : null,
      })
      .select("*")
      .single();
    if (payInsertErr || !payment) return jsonResponse({ error: payInsertErr?.message ?? "Gagal membuat pembayaran." }, 500);

    const rows = newInvoiceIds.map((invoiceId, i) => ({
      payment_id: payment.id,
      invoice_id: invoiceId,
      amount: tenancy.monthly_rate - perPeriodDiscount[i],
    }));
    await admin.from("payment_allocations").insert(rows);

    await admin.from("audit_logs").insert({
      actor_id: tenant.id,
      action: "create_advance_payment",
      target_table: "payments",
      target_id: payment.id,
      metadata: { tenancy_id: tenancy.id, months_count, discount_percent: tier.discount_percent, subtotal, discount, invoice_ids: newInvoiceIds },
    });

    return jsonResponse({ ok: true, payment, subtotal, discount, ...extra });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
