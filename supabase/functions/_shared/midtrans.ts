// Integrasi Midtrans Snap — sengaja dibuat modular (semua panggilan Midtrans lewat
// file ini) supaya gampang diganti provider lain (mis. Xendit) nanti: cukup buat
// createGatewayTransaction() versi baru dengan signature yang sama.

function midtransBaseUrl(): string {
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  return isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
}

function authHeader(): string {
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum di-set di Supabase secrets");
  return "Basic " + btoa(`${serverKey}:`);
}

export async function createGatewayTransaction(params: {
  orderId: string;
  grossAmount: number;
  itemName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  expiryHours: number;
  // Batasi Snap cuma nampilin channel ini aja (mis. ["bca_va"]) — dipakai supaya
  // biaya admin per channel bisa dihitung DI MUKA (lihat paymentChannels.ts),
  // karena tanpa ini penghuni bisa pilih channel apapun di dalam Snap dan kita baru
  // tau channel-nya lewat webhook, telat buat nge-charge biaya yang sesuai.
  enabledPayments?: string[];
}): Promise<{ token: string; redirectUrl: string }> {
  const res = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: params.orderId,
        gross_amount: Math.round(params.grossAmount),
      },
      // Tanpa item_details, Snap kadang nampilin nama produk default dari
      // akun merchant (bukan generik/kosong) — bikin bingung penghuni pas
      // checkout. Kirim eksplisit biar selalu jelas ini bayar apa.
      item_details: [
        {
          id: params.orderId,
          price: Math.round(params.grossAmount),
          quantity: 1,
          name: params.itemName.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: params.customerName,
        email: params.customerEmail,
        phone: params.customerPhone,
      },
      expiry: { unit: "hours", duration: params.expiryHours },
      ...(params.enabledPayments && params.enabledPayments.length > 0
        ? { enabled_payments: params.enabledPayments }
        : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal membuat transaksi Midtrans (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { token: data.token, redirectUrl: data.redirect_url };
}

// Verifikasi signature notifikasi webhook Midtrans:
// SHA512(order_id + status_code + gross_amount + ServerKey)
export async function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): Promise<boolean> {
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  if (!serverKey) return false;

  const raw = `${params.orderId}${params.statusCode}${params.grossAmount}${serverKey}`;
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === params.signatureKey;
}

// Cek status transaksi asli di Midtrans (dipakai reconcile-payments buat bandingin
// sama status di tabel payments kita — nangkep kasus webhook yang gagal/kelewat).
export async function getTransactionStatus(orderId: string): Promise<{ transactionStatus: string; fraudStatus: string | null } | null> {
  const res = await fetch(`${midtransBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (res.status === 404) return null; // transaksi belum pernah dibuat di Midtrans
  if (!res.ok) throw new Error(`Gagal cek status Midtrans (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return { transactionStatus: data.transaction_status, fraudStatus: data.fraud_status ?? null };
}

// Map payment_type dari Midtrans ke enum payment_method kita.
export function mapMidtransPaymentType(paymentType: string): "VIRTUAL_ACCOUNT" | "EWALLET" | "QRIS_DINAMIS" | "GERAI_RETAIL" {
  if (paymentType === "bank_transfer" || paymentType === "echannel" || paymentType === "permata_va") return "VIRTUAL_ACCOUNT";
  if (paymentType === "gopay" || paymentType === "shopeepay") return "EWALLET";
  if (paymentType === "qris") return "QRIS_DINAMIS";
  if (paymentType === "cstore") return "GERAI_RETAIL";
  return "VIRTUAL_ACCOUNT";
}
