import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card, EmptyState } from "../../components/Card";

type Tier = { months: number; discount_percent: number };

export default function AdvanceDiscounts() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [months, setMonths] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error: fetchErr } = await supabase.from("settings").select("value").eq("key", "advance_payment_discounts").maybeSingle();
    if (fetchErr) {
      setError("Gagal memuat jenjang diskon.");
      return;
    }
    setTiers(((data?.value ?? []) as Tier[]).slice().sort((a, b) => a.months - b.months));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(next: Tier[]) {
    const { error: updateErr } = await supabase.from("settings").update({ value: next }).eq("key", "advance_payment_discounts");
    if (updateErr) {
      setError("Gagal menyimpan perubahan.");
      return false;
    }
    return true;
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const m = Number(months);
    const p = Number(discountPercent);
    if (!m || m <= 0) {
      setError("Jumlah bulan wajib diisi angka positif.");
      return;
    }
    if (p < 0 || p > 100) {
      setError("Persen diskon harus antara 0-100.");
      return;
    }
    if ((tiers ?? []).some((t) => t.months === m)) {
      setError(`Jenjang ${m} bulan sudah ada.`);
      return;
    }
    setSaving(true);
    try {
      const next = [...(tiers ?? []), { months: m, discount_percent: p }].sort((a, b) => a.months - b.months);
      if (await save(next)) {
        setTiers(next);
        setMonths("");
        setDiscountPercent("");
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(target: Tier) {
    if (!confirm(`Hapus jenjang ${target.months} bulan?`)) return;
    const next = (tiers ?? []).filter((t) => t.months !== target.months);
    if (await save(next)) setTiers(next);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Batal" : "+ Jenjang Baru"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Penghuni siklus Bulanan bisa pilih salah satu jenjang ini buat bayar beberapa bulan sekaligus dengan diskon.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={handleAdd}>
            <div className="field">
              <label htmlFor="months">Jumlah Bulan</label>
              <input id="months" type="number" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="mis. 3" />
            </div>
            <div className="field">
              <label htmlFor="discountPercent">Diskon (%)</label>
              <input id="discountPercent" type="number" step="0.1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="mis. 2" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: "auto" }}>
              {saving ? <span className="spinner" /> : "Tambah"}
            </button>
          </form>
        </Card>
      )}

      {tiers === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : tiers.length === 0 ? (
        <Card>
          <EmptyState icon="💸" text="Belum ada jenjang diskon — fitur bayar di muka nggak akan muncul buat penghuni." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tiers.map((t) => (
            <Card key={t.months} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                {t.months} bulan — potong {t.discount_percent}%
              </div>
              <button className="btn-link" style={{ color: "var(--danger)" }} onClick={() => handleDelete(t)}>
                Hapus
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
