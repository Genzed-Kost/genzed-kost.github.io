import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { functionsUrl } from "../lib/supabaseClient";
import { formatRupiah } from "../lib/format";
import { Countdown } from "../components/Countdown";
import { PaymentAccountInfo } from "../components/PaymentAccountInfo";
import type { PaymentAccount } from "../types/database";

type LinkData = {
  payment_number: string;
  tenant_name: string;
  status: string;
  method: string;
  total_to_transfer: number;
  expires_at: string;
  account?: PaymentAccount | null;
};

const STATUS_MESSAGE: Record<string, string> = {
  LUNAS: "Pembayaran ini sudah lunas. Terima kasih! 🎉",
  KEDALUWARSA: "Link pembayaran ini sudah kedaluwarsa.",
  DIBATALKAN: "Pembayaran ini sudah dibatalkan.",
  MENUNGGU_VERIFIKASI: "Bukti transfer sudah dikirim, menunggu verifikasi admin.",
};

export default function PublikBayar() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LinkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(functionsUrl("resolve-payment-link"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Link tidak valid.");
          return;
        }
        setData(json);
      })
      .catch(() => setError("Gagal memuat link pembayaran."));
  }, [token]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: "40px 5vw" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 28, justifyContent: "center" }}>
          <img src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.3rem" }}>
            Genz<span style={{ color: "var(--accent)" }}>ed</span>
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!data && !error && (
          <div style={{ display: "grid", placeItems: "center", padding: 40 }}>
            <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
          </div>
        )}

        {data && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: 24 }}>
            <p style={{ fontSize: ".82rem", color: "var(--muted)", marginBottom: 4 }}>Tagihan kost untuk</p>
            <h1 style={{ fontSize: "1.3rem", marginBottom: 16 }}>{data.tenant_name}</h1>

            {data.status !== "MENUNGGU" ? (
              <div className="alert alert-success">{STATUS_MESSAGE[data.status] ?? `Status: ${data.status}`}</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Total Transfer</span>
                  <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.2rem" }}>
                    {formatRupiah(data.total_to_transfer)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Batas Waktu</span>
                  <Countdown expiresAt={data.expires_at} />
                </div>

                <div style={{ padding: 14, background: "var(--surface2)", borderRadius: 10 }}>
                  <PaymentAccountInfo account={data.account} />
                </div>

                <p style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
                  Setelah transfer, penghuni yang bersangkutan perlu upload bukti transfer lewat portalnya.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
