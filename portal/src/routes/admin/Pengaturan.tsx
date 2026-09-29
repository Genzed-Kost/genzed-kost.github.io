import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import Rekening from "./Rekening";
import Denda from "./Denda";
import AdvanceDiscounts from "./AdvanceDiscounts";

export default function Pengaturan() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openModal, setOpenModal] = useState<"rekening" | "denda" | "advance" | null>(null);

  const [adminFeeBorneBy, setAdminFeeBorneBy] = useState<"tenant" | "pemilik">("tenant");
  const [minPartialPayment, setMinPartialPayment] = useState("50000");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["admin_fee_borne_by", "min_partial_payment"]);
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      setAdminFeeBorneBy((map.get("admin_fee_borne_by") as "tenant" | "pemilik") ?? "tenant");
      setMinPartialPayment(String(map.get("min_partial_payment") ?? 50000));
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
        supabase.from("settings").update({ value: adminFeeBorneBy }).eq("key", "admin_fee_borne_by"),
        supabase.from("settings").update({ value: Number(minPartialPayment) }).eq("key", "min_partial_payment"),
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
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Rekening, biaya admin, dan aturan denda.</p>

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
