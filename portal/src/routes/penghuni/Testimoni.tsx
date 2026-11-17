import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { formatTanggalWIB } from "../../lib/format";
import { Card } from "../../components/Card";

type Testimonial = {
  id: string;
  display_name: string;
  rating: number;
  message: string;
  is_hidden: boolean;
  updated_at: string;
};

const MIN_MSG = 10;
const MAX_MSG = 500;

function firstName(full: string | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div role={onChange ? "radiogroup" : undefined} aria-label="Rating" style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const star = (
          <span
            aria-hidden="true"
            style={{
              fontSize: size,
              lineHeight: 1,
              color: on ? "#F59E0B" : "#DDD6F3",
              transition: "transform .15s",
              display: "inline-block",
            }}
          >
            ★
          </span>
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} bintang`}
            onClick={() => onChange(n)}
            style={{ background: "none", border: "none", padding: 2, cursor: "pointer" }}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

export default function Testimoni() {
  const { profile } = useAuth();
  const [existing, setExisting] = useState<Testimonial | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState("");
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    const { data, error: fetchErr } = await supabase
      .from("testimonials")
      .select("id, display_name, rating, message, is_hidden, updated_at")
      .eq("user_id", profile!.id)
      .maybeSingle();
    if (fetchErr) {
      setError("Gagal memuat testimoni. Coba muat ulang halaman.");
      setExisting(null);
      return;
    }
    setExisting(data as Testimonial | null);
    if (data) {
      setDisplayName(data.display_name);
      setRating(data.rating);
      setMessage(data.message);
    } else {
      setDisplayName(firstName(profile?.full_name));
      setEditing(true);
    }
  }

  useEffect(() => {
    if (profile) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const name = displayName.trim();
    const msg = message.trim();
    if (name.length < 2 || name.length > 40) {
      setError("Nama yang ditampilkan 2–40 karakter.");
      return;
    }
    if (msg.length < MIN_MSG) {
      setError(`Ceritanya minimal ${MIN_MSG} karakter ya.`);
      return;
    }
    setSaving(true);
    try {
      const payload = { display_name: name, rating, message: msg };
      const { error: saveErr } = existing
        ? await supabase.from("testimonials").update(payload).eq("id", existing.id)
        : await supabase.from("testimonials").insert({ ...payload, user_id: profile!.id });
      if (saveErr) {
        setError("Gagal menyimpan testimoni. Coba lagi ya.");
        return;
      }
      setSuccess(existing ? "Testimoni berhasil diperbarui." : "Makasih! Testimonimu sudah tampil di website Genzed Kost 🎉");
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing || !window.confirm("Hapus testimonimu dari website?")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: delErr } = await supabase.from("testimonials").delete().eq("id", existing.id);
    setSaving(false);
    if (delErr) {
      setError("Gagal menghapus testimoni.");
      return;
    }
    setSuccess("Testimoni sudah dihapus.");
    setExisting(null);
    setMessage("");
    setRating(5);
    setEditing(true);
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 720 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>
        Testimoni <span aria-hidden="true">⭐</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Ceritain pengalamanmu tinggal di Genzed Kost. Testimonimu bakal tampil di bagian <strong>Testimoni Penghuni</strong> di
        website, biar calon penghuni tau rasanya ngekos di sini.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {existing === undefined ? (
        <Card>
          <span style={{ color: "var(--muted)" }}>Memuat…</span>
        </Card>
      ) : existing && !editing ? (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{existing.display_name}</div>
              <Stars value={existing.rating} size={20} />
            </div>
            <span
              style={{
                fontSize: ".75rem",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 100,
                background: existing.is_hidden ? "#FEF3C7" : "#DCFCE7",
                color: existing.is_hidden ? "#92400E" : "#166534",
              }}
            >
              {existing.is_hidden ? "Disembunyikan admin" : "Tampil di website"}
            </span>
          </div>
          <p style={{ margin: "12px 0", fontStyle: "italic", whiteSpace: "pre-wrap" }}>"{existing.message}"</p>
          <div style={{ fontSize: ".75rem", color: "var(--muted)", marginBottom: 14 }}>
            Terakhir diperbarui {formatTanggalWIB(existing.updated_at)}
          </div>
          {existing.is_hidden && (
            <p style={{ fontSize: ".8rem", color: "var(--muted)", marginBottom: 14 }}>
              Admin menyembunyikan testimoni ini dari website. Kalau ada pertanyaan, hubungi admin lewat menu Komplain.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setEditing(true)} disabled={saving}>
              ✏️ Edit Testimoni
            </button>
            <button className="btn-link" onClick={handleDelete} disabled={saving} style={{ color: "var(--danger)" }}>
              Hapus
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Rating</label>
              <Stars value={rating} onChange={setRating} />
            </div>
            <div className="field">
              <label htmlFor="tName">Nama yang ditampilkan</label>
              <input
                id="tName"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Misal: Budi, mahasiswa Untirta"
              />
            </div>
            <div className="field">
              <label htmlFor="tMsg">Ceritamu</label>
              <textarea
                id="tMsg"
                value={message}
                maxLength={MAX_MSG}
                rows={5}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Gimana rasanya tinggal di Genzed Kost? Kamar, fasilitas, suasana, adminnya…"
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  padding: "12px 14px",
                  font: "inherit",
                  fontSize: ".95rem",
                  color: "var(--text)",
                  resize: "vertical",
                }}
              />
              <span style={{ fontSize: ".75rem", color: "var(--muted)", textAlign: "right" }}>
                {message.trim().length}/{MAX_MSG}
              </span>
            </div>
            <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 14 }}>
              Testimoni langsung tampil di website publik. Jangan cantumin data pribadi (No HP, alamat, dsb). Admin bisa
              menyembunyikan testimoni yang nggak sesuai.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: "auto" }}>
                {saving ? <span className="spinner" /> : existing ? "Simpan Perubahan" : "Kirim Testimoni"}
              </button>
              {existing && (
                <button type="button" className="btn-link" onClick={() => setEditing(false)} disabled={saving}>
                  Batal
                </button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
