import { useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card, EmptyState } from "../../components/Card";

const GALLERY_BUCKET = "landing-gallery";

type Stats = { penghuni_aktif: string; rating: string; berdiri_sejak: string };
type NearbyItem = { icon: string; label: string; sublabel: string; distance: string };
type GalleryItem = { path: string; caption: string };

export default function LandingPageSettings() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [stats, setStats] = useState<Stats>({ penghuni_aktif: "", rating: "", berdiri_sejak: "" });
  const [mapsUrl, setMapsUrl] = useState("");
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  async function load() {
    const { data, error: fetchErr } = await supabase.from("landing_content").select("*").eq("id", true).maybeSingle();
    if (fetchErr) {
      setError("Gagal memuat konten landing page.");
      return;
    }
    setStats((data?.stats as Stats) ?? { penghuni_aktif: "120+", rating: "4.8", berdiri_sejak: "3thn" });
    setMapsUrl(data?.maps_url ?? "");
    setNearby((data?.nearby as NearbyItem[]) ?? []);
    setGallery((data?.gallery as GalleryItem[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase
        .from("landing_content")
        .update({ stats, maps_url: mapsUrl.trim() || null, nearby, gallery, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (updateErr) {
        setError("Gagal menyimpan: " + updateErr.message);
        return;
      }
      await supabase.from("audit_logs").insert({
        actor_id: user?.id,
        action: "update_landing_content",
        target_table: "landing_content",
        target_id: null,
        metadata: { stats, maps_url: mapsUrl, nearby_count: nearby.length, gallery_count: gallery.length },
      });
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  function updateNearby(index: number, patch: Partial<NearbyItem>) {
    setNearby((prev) => prev.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  }
  function removeNearby(index: number) {
    setNearby((prev) => prev.filter((_, i) => i !== index));
  }
  function addNearby() {
    setNearby((prev) => [...prev, { icon: "📍", label: "", sublabel: "", distance: "" }]);
  }
  function moveNearby(index: number, dir: -1 | 1) {
    setNearby((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateGalleryCaption(index: number, caption: string) {
    setGallery((prev) => prev.map((g, i) => (i === index ? { ...g, caption } : g)));
  }
  async function removeGalleryImage(index: number) {
    if (!confirm("Hapus foto ini dari galeri?")) return;
    const target = gallery[index];
    await supabase.storage.from(GALLERY_BUCKET).remove([target.path]);
    setGallery((prev) => prev.filter((_, i) => i !== index));
  }
  function moveGallery(index: number, dir: -1 | 1) {
    setGallery((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const newItems: GalleryItem[] = [];
      for (const file of Array.from(files)) {
        const path = `${crypto.randomUUID()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file);
        if (uploadErr) {
          setError(`Gagal upload ${file.name}: ${uploadErr.message}`);
          continue;
        }
        newItems.push({ path, caption: "" });
      }
      setGallery((prev) => [...prev, ...newItems]);
    } finally {
      setUploading(false);
      e.target.value = "";
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
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Landing Page</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Sesuaikan statistik, lokasi, dan galeri foto di halaman promosi (genzed-kost.github.io) — nggak perlu developer.
        Konten HTML utama tetap statis buat SEO, ini cuma nge-override bagian yang ditandai di bawah.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">Perubahan tersimpan! Muncul di landing page dalam beberapa detik.</div>}

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Statistik Hero</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div className="field">
            <label>Penghuni Aktif</label>
            <input value={stats.penghuni_aktif} onChange={(e) => setStats((s) => ({ ...s, penghuni_aktif: e.target.value }))} placeholder="120+" />
          </div>
          <div className="field">
            <label>Rating</label>
            <input value={stats.rating} onChange={(e) => setStats((s) => ({ ...s, rating: e.target.value }))} placeholder="4.8" />
          </div>
          <div className="field">
            <label>Berdiri Sejak</label>
            <input value={stats.berdiri_sejak} onChange={(e) => setStats((s) => ({ ...s, berdiri_sejak: e.target.value }))} placeholder="3thn" />
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 8 }}>Lokasi Google Maps</h3>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 10 }}>
          Buka lokasi kost lo di Google Maps, tekan "Bagikan" → salin link, tempel di sini.
        </p>
        <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: ".95rem" }}>Lokasi Strategis (jarak ke tempat penting)</h3>
          <button type="button" className="btn-link" onClick={addNearby}>
            + Tambah
          </button>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 12 }}>
          Buat jarak rute (bukan garis lurus), buka Google Maps sendiri → "Rute" dari tempat itu ke kost lo, lihat jaraknya,
          ketik hasilnya di sini (mis. "500 m").
        </p>
        {nearby.length === 0 ? (
          <EmptyState icon="📍" text="Belum ada tempat penting ditambahkan." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nearby.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <input style={{ width: 48, textAlign: "center" }} value={n.icon} onChange={(e) => updateNearby(i, { icon: e.target.value })} placeholder="📍" />
                <input style={{ flex: "1 1 160px" }} value={n.label} onChange={(e) => updateNearby(i, { label: e.target.value })} placeholder="Nama tempat" />
                <input style={{ flex: "1 1 140px" }} value={n.sublabel} onChange={(e) => updateNearby(i, { sublabel: e.target.value })} placeholder="Kategori" />
                <input style={{ width: 90 }} value={n.distance} onChange={(e) => updateNearby(i, { distance: e.target.value })} placeholder="500 m" />
                <div style={{ display: "flex", gap: 2 }}>
                  <button type="button" className="btn-link" onClick={() => moveNearby(i, -1)} disabled={i === 0} title="Naikkan urutan">↑</button>
                  <button type="button" className="btn-link" onClick={() => moveNearby(i, 1)} disabled={i === nearby.length - 1} title="Turunkan urutan">↓</button>
                  <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => removeNearby(i)}>Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: ".95rem" }}>Galeri Foto</h3>
          <label className="btn-link" style={{ cursor: "pointer" }}>
            {uploading ? <span className="spinner" /> : "+ Upload Foto"}
            <input type="file" hidden accept="image/*" multiple onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 12 }}>
          Foto kamar, fasilitas, area kost, dll — tampil di galeri landing page. Kosongkan galeri kalau belum ada foto siap pakai.
        </p>
        {gallery.length === 0 ? (
          <EmptyState icon="🖼️" text="Belum ada foto di galeri." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {gallery.map((g, i) => (
              <div key={g.path} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <img
                  src={supabase.storage.from(GALLERY_BUCKET).getPublicUrl(g.path).data.publicUrl}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", flexShrink: 0 }}
                />
                <input style={{ flex: 1 }} value={g.caption} onChange={(e) => updateGalleryCaption(i, e.target.value)} placeholder="Keterangan foto (opsional)" />
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button type="button" className="btn-link" onClick={() => moveGallery(i, -1)} disabled={i === 0} title="Naikkan urutan">↑</button>
                  <button type="button" className="btn-link" onClick={() => moveGallery(i, 1)} disabled={i === gallery.length - 1} title="Turunkan urutan">↓</button>
                  <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => removeGalleryImage(i)}>Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: "auto" }}>
        {saving ? <span className="spinner" /> : "Simpan Perubahan"}
      </button>
    </div>
  );
}
