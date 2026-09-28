import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import Rekening from "./Rekening";
import Denda from "./Denda";
import AdvanceDiscounts from "./AdvanceDiscounts";
import { GATEWAY_CHANNELS } from "../../lib/paymentChannels";
import type { FeeConfig } from "../../lib/payment";

type ChannelFee = FeeConfig & { label: string };

export default function Pengaturan() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openModal, setOpenModal] = useState<"rekening" | "denda" | "advance" | null>(null);

  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [adminFeeBorneBy, setAdminFeeBorneBy] = useState<"tenant" | "pemilik">("tenant");
  const [minPartialPayment, setMinPartialPayment] = useState("50000");
  const [channelFees, setChannelFees] = useState<Record<string, ChannelFee>>(
    Object.fromEntries(GATEWAY_CHANNELS.map((c) => [c.id, { type: "nominal", value: 0, label: c.label }]))
  );

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["payment_gateway_enabled", "admin_fee_borne_by", "min_partial_payment", "payment_method_fees"]);
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      setGatewayEnabled(map.get("payment_gateway_enabled") === true);
      setAdminFeeBorneBy((map.get("admin_fee_borne_by") as "tenant" | "pemilik") ?? "tenant");
      setMinPartialPayment(String(map.get("min_partial_payment") ?? 50000));
      const fees = map.get("payment_method_fees") as { gateway_channels?: Record<string, ChannelFee> } | undefined;
      setChannelFees((prev) => {
        const next = { ...prev };
        for (const c of GATEWAY_CHANNELS) {
          const saved = fees?.gateway_channels?.[c.id];
          next[c.id] = saved ? { type: saved.type, value: saved.value, label: c.label } : { ...prev[c.id], label: c.label };
        }
        return next;
      });
      setLoaded(true);
    }
    load();
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updates = [
        supabase.from("settings").update({ value: gatewayEnabled }).eq("key", "payment_gateway_enabled"),
        supabase.from("settings").update({ value: adminFeeBorneBy }).eq("key", "admin_fee_borne_by"),
        supabase.from("settings").update({ value: Number(minPartialPayment) }).eq("key", "min_partial_payment"),
        supabase
          .from("settings")
          .update({
            value: {
              manual: { type: "nominal", value: 0 },
              gateway_channels: Object.fromEntries(
                Object.entries(channelFees).map(([id, f]) => [id, { type: f.type, value: Number(f.value), label: f.label }])
              ),
            },
          })
          .eq("key", "payment_method_fees"),
      ];
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        setError("Sebagian pengaturan gagal disimpan.");
        return;
      }
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Pengaturan Pembayaran</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Rekening, biaya admin, dan jalur pembayaran otomatis.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">Pengaturan berhasil disimpan.</div>}

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 8 }}>Rekening Transfer Manual</h3>
        <p style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 12 }}>
          Bisa lebih dari satu rekening (bank, QRIS, e-wallet, kripto).
        </p>
        <button type="button" className="btn-link" onClick={() => setOpenModal("rekening")}>
          Kelola Rekening →
        </button>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 8 }}>Aturan Denda Keterlambatan</h3>
        <p style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 12 }}>Dipakai mesin denda otomatis tiap hari.</p>
        <button type="button" className="btn-link" onClick={() => setOpenModal("denda")}>
          Kelola Aturan Denda →
        </button>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 8 }}>Bayar di Muka (Diskon)</h3>
        <p style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 12 }}>
          Jenjang diskon buat penghuni siklus Bulanan yang mau bayar beberapa bulan sekaligus.
        </p>
        <button type="button" className="btn-link" onClick={() => setOpenModal("advance")}>
          Kelola Jenjang Diskon →
        </button>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Pembayaran Otomatis (Midtrans)</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={gatewayEnabled} onChange={(e) => setGatewayEnabled(e.target.checked)} />
          <span style={{ fontSize: ".85rem" }}>Aktifkan jalur otomatis (VA/E-wallet/QRIS/Retail)</span>
        </label>
        <p style={{ fontSize: ".78rem", color: "var(--warn)" }}>
          ⚠️ Pastikan MIDTRANS_SERVER_KEY sudah di-set di Supabase secrets dan sudah dites di Sandbox sebelum diaktifkan di production.
        </p>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Biaya Admin</h3>
        <div className="field">
          <label>Siapa yang Menanggung Biaya Admin?</label>
          <select
            value={adminFeeBorneBy}
            onChange={(e) => setAdminFeeBorneBy(e.target.value as typeof adminFeeBorneBy)}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "12px 14px", color: "var(--text)", width: "100%" }}
          >
            <option value="tenant">Penghuni</option>
            <option value="pemilik">Pemilik Kost</option>
          </select>
        </div>
        <div className="field">
          <label>Biaya per Channel Jalur Otomatis</label>
          <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 8 }}>
            Beda channel Midtrans beda biaya asli — atur di sini biar ditagihkan sesuai, bukan disamaratakan.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {GATEWAY_CHANNELS.map((c) => {
              const fee = channelFees[c.id];
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: ".82rem", width: 110, flexShrink: 0 }}>{c.label}</span>
                  <select
                    value={fee.type}
                    onChange={(e) =>
                      setChannelFees((prev) => ({ ...prev, [c.id]: { ...prev[c.id], type: e.target.value as "nominal" | "percent" } }))
                    }
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "8px 10px", color: "var(--text)" }}
                  >
                    <option value="nominal">Rp</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    value={fee.value}
                    onChange={(e) => setChannelFees((prev) => ({ ...prev, [c.id]: { ...prev[c.id], value: Number(e.target.value) } }))}
                    style={{ flex: 1 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Bayar Sebagian</h3>
        <div className="field">
          <label>Nominal Minimum (Rp)</label>
          <input type="number" value={minPartialPayment} onChange={(e) => setMinPartialPayment(e.target.value)} />
        </div>
      </Card>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: "auto" }}>
        {saving ? <span className="spinner" /> : "Simpan Pengaturan"}
      </button>

      {openModal === "rekening" && (
        <Modal title="Rekening Transfer Manual" onClose={() => setOpenModal(null)}>
          <Rekening />
        </Modal>
      )}
      {openModal === "denda" && (
        <Modal title="Aturan Denda Keterlambatan" onClose={() => setOpenModal(null)}>
          <Denda />
        </Modal>
      )}
      {openModal === "advance" && (
        <Modal title="Bayar di Muka (Diskon)" onClose={() => setOpenModal(null)}>
          <AdvanceDiscounts />
        </Modal>
      )}
    </div>
  );
}
