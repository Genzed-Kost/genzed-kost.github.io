// Endpoint PUBLIK (tanpa login) buat link pembayaran yang dibagikan ke ortu/wali.
// Akses tabel payments SELALU lewat service role di sini — token acak yang jadi
// satu-satunya kunci akses, makanya wajib random & sulit ditebak (uuid v4).
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const { token } = await req.json();
    if (!token) return jsonResponse({ error: "Token tidak valid." }, 400);

    const admin = getSupabaseAdmin();
    const { data: payment, error: paymentErr } = await admin
      .from("payments")
      .select(
        "id, payment_number, method, status, amount, admin_fee, unique_code, deposit_used, voucher_discount, expires_at, tenant_id, payment_account_id, profiles!payments_tenant_id_fkey(full_name)"
      )
      .eq("public_link_token", token)
      .maybeSingle();

    if (paymentErr) return jsonResponse({ error: paymentErr.message }, 500);
    if (!payment) return jsonResponse({ error: "Link pembayaran tidak ditemukan atau sudah tidak berlaku." }, 404);

    const tenant = payment.profiles as unknown as { full_name: string } | null;
    // amount = total nilai yang dikreditkan ke tagihan (termasuk deposit & voucher) —
    // yang perlu benar-benar ditransfer cuma sisanya, ditambah fee & kode unik.
    const externalAmount = Number(payment.amount) - Number(payment.deposit_used) - Number(payment.voucher_discount);
    const grossTotal = externalAmount + Number(payment.admin_fee) + Number(payment.unique_code ?? 0);

    const result: Record<string, unknown> = {
      payment_number: payment.payment_number,
      tenant_name: tenant?.full_name ?? "Penghuni",
      status: payment.status,
      method: payment.method,
      total_to_transfer: grossTotal,
      expires_at: payment.expires_at,
    };

    if (payment.status === "MENUNGGU" && payment.payment_account_id) {
      const { data: account } = await admin.from("payment_accounts").select("*").eq("id", payment.payment_account_id).maybeSingle();
      result.account = account ?? null;
    }

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
