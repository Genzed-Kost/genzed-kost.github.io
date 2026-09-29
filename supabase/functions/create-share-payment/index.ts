// Co-tenant (Prioritas 4): penghuni bayar PORSINYA SENDIRI dari tagihan yang
// dibagi rame-rame (invoice_shares). Settlement-nya tetap lewat confirmPayment
// (satu pintu) begitu payment ini LUNAS — confirmPayment yang sudah tau cara
// nambah paid_amount ke invoice_shares yang bersangkutan, bukan invoices.paid_total
// langsung. Sengaja TANPA deposit/voucher buat jaga alur ini tetap simpel.
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { calculateAdminFee, generateUniqueCode, type FeeConfig } from "../_shared/payment.ts";
import { nextDocumentNumber } from "../_shared/numbering.ts";
import { getActiveRoomCode } from "../_shared/roomCode.ts";

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
      invoice_id,
      payment_account_id,
      want_public_link,
      idempotency_key,
    }: {
      invoice_id: string;
      payment_account_id?: string;
      want_public_link?: boolean;
      idempotency_key: string;
    } = body;

    if (!idempotency_key) return jsonResponse({ error: "idempotency_key wajib diisi." }, 400);
    if (!invoice_id) return jsonResponse({ error: "invoice_id wajib diisi." }, 400);
    if (!payment_account_id) {
      return jsonResponse({ error: "Pilih rekening tujuan transfer dulu." }, 400);
    }

    const { data: existingPayment } = await admin.from("payments").select("*").eq("idempotency_key", idempotency_key).maybeSingle();
    if (existingPayment) {
      return jsonResponse({ ok: true, payment: existingPayment, already_existed: true });
    }

    const { data: invoice } = await admin.from("invoices").select("id, invoice_number, status").eq("id", invoice_id).maybeSingle();
    if (!invoice) return jsonResponse({ error: "Tagihan tidak ditemukan." }, 404);

    const { data: share } = await admin
      .from("invoice_shares")
      .select("id, share_amount, paid_amount")
      .eq("invoice_id", invoice_id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!share) return jsonResponse({ error: "Lo nggak punya porsi di tagihan ini." }, 403);

    const outstanding = Math.round(Number(share.share_amount) - Number(share.paid_amount));
    if (outstanding <= 0) return jsonResponse({ error: "Porsi lo di tagihan ini sudah lunas." }, 409);

    const { data: feeSetting } = await admin.from("settings").select("value").eq("key", "payment_method_fees").maybeSingle();
    const fees = (feeSetting?.value ?? {}) as Record<string, FeeConfig>;
    const { data: borneSetting } = await admin.from("settings").select("value").eq("key", "admin_fee_borne_by").maybeSingle();
    const borneBy = (borneSetting?.value as string) ?? "tenant";
    const { data: expirySetting } = await admin.from("settings").select("value").eq("key", "payment_expiry_hours").maybeSingle();
    const expiryHours = Number(expirySetting?.value ?? 24);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
    const monthKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const roomCode = await getActiveRoomCode(admin, tenant.id);
    const paymentNumber = await nextDocumentNumber(admin, "PAY", monthKey, roomCode);

    const adminFee = calculateAdminFee(outstanding, fees.manual);
    const uniqueCode = generateUniqueCode();
    const grossToTransfer = outstanding + (borneBy === "tenant" ? adminFee : 0) + uniqueCode;

    const { data: account } = await admin.from("payment_accounts").select("*").eq("id", payment_account_id).eq("is_active", true).maybeSingle();
    if (!account) return jsonResponse({ error: "Rekening yang dipilih tidak ditemukan atau sudah nonaktif." }, 400);
    const extra: Record<string, unknown> = { account, total_to_transfer: grossToTransfer };

    const { data: payment, error: payInsertErr } = await admin
      .from("payments")
      .insert({
        payment_number: paymentNumber,
        tenant_id: tenant.id,
        method: "TRANSFER_MANUAL",
        status: "MENUNGGU",
        amount: outstanding,
        admin_fee: adminFee,
        unique_code: uniqueCode,
        idempotency_key,
        expires_at: expiresAt.toISOString(),
        deposit_used: 0,
        voucher_id: null,
        voucher_discount: 0,
        created_by: tenant.id,
        public_link_token: want_public_link ? crypto.randomUUID() : null,
        payment_account_id,
      })
      .select("*")
      .single();
    if (payInsertErr || !payment) return jsonResponse({ error: payInsertErr?.message ?? "Gagal membuat pembayaran." }, 500);

    await admin.from("payment_allocations").insert({ payment_id: payment.id, invoice_id, amount: outstanding });

    await admin.from("audit_logs").insert({
      actor_id: tenant.id,
      action: "create_share_payment",
      target_table: "payments",
      target_id: payment.id,
      metadata: { invoice_id, share_id: share.id, amount: outstanding },
    });

    return jsonResponse({ ok: true, payment, ...extra });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
