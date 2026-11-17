import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatTanggalWIB } from "../../lib/format";
import { Card, EmptyState } from "../../components/Card";
import { Stars } from "../penghuni/Testimoni";

type Row = {
  id: string;
  display_name: string;
  rating: number;
  message: string;
  is_hidden: boolean;
  updated_at: string;
  author: { full_name: string; phone: string } | null;
};

export default function AdminTestimoni() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: fetchErr } = await supabase
      .from("testimonials")
      .select("id, display_name, rating, message, is_hidden, updated_at, author:profiles(full_name, phone)")
      .order("updated_at", { ascending: false });
    if (fetchErr) {
      setError("Gagal memuat testimoni. Pastikan migrasi database testimoni sudah dijalankan.");
      setRows([]);
      return;
    }
    setRows(data as unknown as Row[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleHidden(r: Row) {
    setBusy(r.id);
    setError(null);
    const { error: e } = await supabase.from("testimonials").update({ is_hidden: !r.is_hidden }).eq("id", r.id);
    setBusy(null);
    if (e) {
      setError("Gagal mengubah status testimoni.");
      return;
    }
    await load();
  }

  async function remove(r: Row) {
    if (!window.confirm(`Hapus permanen testimoni dari ${r.display_name}?`)) return;
    setBusy(r.id);
    setError(null);
    const { error: e } = await supabase.from("testimonials").delete().eq("id", r.id);
    setBusy(null);
    if (e) {
      setError("Gagal menghapus testimoni.");
      return;
    }
    await load();
  }

  const visible = rows?.filter((r) => !r.is_hidden).length ?? 0;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Testimoni Penghuni</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Testimoni yang ditulis penghuni lewat portal langsung tampil di landing page. Sembunyikan yang nggak pantas, atau hapus
        permanen.
        {rows && rows.length > 0 && (
          <>
            {" "}
            <strong>
              {visible} tampil · {rows.length - visible} disembunyikan
            </strong>
          </>
        )}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {rows === null ? (
        <Card>
          <span style={{ color: "var(--muted)" }}>Memuat…</span>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="⭐" text="Belum ada testimoni dari penghuni." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <Card key={r.id} style={{ opacity: r.is_hidden ? 0.65 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {r.display_name}{" "}
                    <span style={{ fontWeight: 400, fontSize: ".8rem", color: "var(--muted)" }}>
                      — akun: {r.author?.full_name ?? "?"} {r.author?.phone ? `(${r.author.phone})` : ""}
                    </span>
                  </div>
                  <Stars value={r.rating} size={18} />
                </div>
                <span
                  style={{
                    alignSelf: "flex-start",
                    fontSize: ".75rem",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 100,
                    background: r.is_hidden ? "#FEF3C7" : "#DCFCE7",
                    color: r.is_hidden ? "#92400E" : "#166534",
                  }}
                >
                  {r.is_hidden ? "Disembunyikan" : "Tampil"}
                </span>
              </div>
              <p style={{ margin: "10px 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>"{r.message}"</p>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: ".75rem", color: "var(--muted)" }}>{formatTanggalWIB(r.updated_at)}</span>
                <button className="btn-link" disabled={busy === r.id} onClick={() => void toggleHidden(r)}>
                  {r.is_hidden ? "👁️ Tampilkan lagi" : "🙈 Sembunyikan"}
                </button>
                <button
                  className="btn-link"
                  disabled={busy === r.id}
                  onClick={() => void remove(r)}
                  style={{ color: "var(--danger)" }}
                >
                  🗑️ Hapus
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
