import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card, EmptyState } from "../../components/Card";

const GALLERY_BUCKET = "landing-gallery";

type Stats = { penghuni_aktif: string; rating: string; berdiri_sejak: string };
type NearbyItem = { icon: string; label: string; sublabel: string; distance: string };
type ImageItem = { icon: string; image_path: string | null; title: string; desc: string };
type PenghuniItem = { name: string; age: string; activity: string; quote: string };

function makeListHelpers<T>(setList: Dispatch<SetStateAction<T[]>>) {
  return {
    update: (index: number, patch: Partial<T>) => setList((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it))),
    remove: (index: number) => setList((prev) => prev.filter((_, i) => i !== index)),
    move: (index: number, dir: -1 | 1) =>
      setList((prev) => {
        const next = [...prev];
        const target = index + dir;
        if (target < 0 || target >= next.length) return prev;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
  };
}

export default function LandingPageSettings() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [stats, setStats] = useState<Stats>({ penghuni_aktif: "", rating: "", berdiri_sejak: "" });
  const [mapsUrl, setMapsUrl] = useState("");
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [facilities, setFacilities] = useState<ImageItem[]>([]);
  const [keunggulan, setKeunggulan] = useState<ImageItem[]>([]);
  const [penghuni, setPenghuni] = useState<PenghuniItem[]>([]);

  const nearbyHelpers = makeListHelpers(setNearby);
  const penghuniHelpers = makeListHelpers(setPenghuni);

  async function load() {
    const { data, error: fetchErr } = await supabase.from("landing_content").select("*").eq("id", true).maybeSingle();
    if (fetchErr) {
      setError("Gagal memuat konten landing page.");
      return;
    }
    setStats((data?.stats as Stats) ?? { penghuni_aktif: "120+", rating: "4.8", berdiri_sejak: "3thn" });
    setMapsUrl(data?.maps_url ?? "");
    setNearby((data?.nearby as NearbyItem[]) ?? []);
    setFacilities((data?.facilities as ImageItem[]) ?? []);
    setKeunggulan((data?.keunggulan as ImageItem[]) ?? []);
    setPenghuni((data?.penghuni as PenghuniItem[]) ?? []);
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
        .update({
          stats,
          maps_url: mapsUrl.trim() || null,
          nearby,
          facilities,
          keunggulan,
          penghuni,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
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
        metadata: {
          stats,
          maps_url: mapsUrl,
          nearby_count: nearby.length,
          facilities_count: facilities.length,
          keunggulan_count: keunggulan.length,
          penghuni_count: penghuni.length,
        },
      });
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  function addNearby() {
    setNearby((prev) => [...prev, { icon: "📍", label: "", sublabel: "", distance: "" }]);
  }

  function addImageItem(setList: Dispatch<SetStateAction<ImageItem[]>>) {
    setList((prev) => [...prev, { icon: "✨", image_path: null, title: "", desc: "" }]);
  }

  function addPenghuni() {
    setPenghuni((prev) => [...prev, { name: "", age: "", activity: "", quote: "" }]);
  }

  async function uploadItemImage(setList: Dispatch<SetStateAction<ImageItem[]>>, index: number, file: File) {
    setUploading(true);
    setError(null);
    try {
      const path = `${crypto.randomUUID()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file);
      if (uploadErr) {
        setError(`Gagal upload ${file.name}: ${uploadErr.message}`);
        return;
      }
      setList((prev) => prev.map((it, i) => (i === index ? { ...it, image_path: path } : it)));
    } finally {
      setUploading(false);
    }
  }

  async function removeItemImage(list: ImageItem[], setList: Dispatch<SetStateAction<ImageItem[]>>, index: number) {
    const path = list[index]?.image_path;
    if (path) await supabase.storage.from(GALLERY_BUCKET).remove([path]);
    setList((prev) => prev.map((it, i) => (i === index ? { ...it, image_path: null } : it)));
  }

  async function removeImageItem(list: ImageItem[], setList: Dispatch<SetStateAction<ImageItem[]>>, index: number) {
    if (!confirm("Hapus item ini?")) return;
    const path = list[index]?.image_path;
    if (path) await supabase.storage.from(GALLERY_BUCKET).remove([path]);
    setList((prev) => prev.filter((_, i) => i !== index));
  }

  function renderImageItemsEditor(items: ImageItem[], setList: Dispatch<SetStateAction<ImageItem[]>>) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}>
              {it.image_path ? (
                <img
                  src={supabase.storage.from(GALLERY_BUCKET).getPublicUrl(it.image_path).data.publicUrl}
                  alt=""
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                />
              ) : (
                <input
                  style={{ width: 48, textAlign: "center" }}
                  value={it.icon}
                  onChange={(e) => makeListHelpers(setList).update(i, { icon: e.target.value })}
                  placeholder="✨"
                />
              )}
              <label className="btn-link" style={{ fontSize: ".68rem", cursor: "pointer" }}>
                {it.image_path ? "Ganti" : "+ Foto"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadItemImage(setList, i, file);
                    e.target.value = "";
                  }}
                />
              </label>
              {it.image_path && (
                <button type="button" className="btn-link" style={{ fontSize: ".68rem", color: "var(--danger)" }} onClick={() => removeItemImage(items, setList, i)}>
                  Hapus foto
                </button>
              )}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={it.title} onChange={(e) => makeListHelpers(setList).update(i, { title: e.target.value })} placeholder="Judul" />
              <input value={it.desc} onChange={(e) => makeListHelpers(setList).update(i, { desc: e.target.value })} placeholder="Deskripsi singkat" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button type="button" className="btn-link" onClick={() => makeListHelpers(setList).move(i, -1)} disabled={i === 0} title="Naikkan urutan">↑</button>
              <button type="button" className="btn-link" onClick={() => makeListHelpers(setList).move(i, 1)} disabled={i === items.length - 1} title="Turunkan urutan">↓</button>
              <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => removeImageItem(items, setList, i)}>Hapus</button>
            </div>
          </div>
        ))}
      </div>
    );
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
        Sesuaikan statistik, lokasi, fasilitas, keunggulan, dan penghuni di halaman promosi (genzed-kost.github.io) — nggak
        perlu developer. Konten HTML utama tetap statis buat SEO, ini cuma nge-override bagian yang ditandai di bawah.
        Kosongkan sebuah bagian kalau mau tetap pakai konten default bawaan.
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
                <input style={{ width: 48, textAlign: "center" }} value={n.icon} onChange={(e) => nearbyHelpers.update(i, { icon: e.target.value })} placeholder="📍" />
                <input style={{ flex: "1 1 160px" }} value={n.label} onChange={(e) => nearbyHelpers.update(i, { label: e.target.value })} placeholder="Nama tempat" />
                <input style={{ flex: "1 1 140px" }} value={n.sublabel} onChange={(e) => nearbyHelpers.update(i, { sublabel: e.target.value })} placeholder="Kategori" />
                <input style={{ width: 90 }} value={n.distance} onChange={(e) => nearbyHelpers.update(i, { distance: e.target.value })} placeholder="500 m" />
                <div style={{ display: "flex", gap: 2 }}>
                  <button type="button" className="btn-link" onClick={() => nearbyHelpers.move(i, -1)} disabled={i === 0} title="Naikkan urutan">↑</button>
                  <button type="button" className="btn-link" onClick={() => nearbyHelpers.move(i, 1)} disabled={i === nearby.length - 1} title="Turunkan urutan">↓</button>
                  <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => nearbyHelpers.remove(i)}>Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: ".95rem" }}>Fasilitas</h3>
          <button type="button" className="btn-link" onClick={() => addImageItem(setFacilities)}>
            + Tambah
          </button>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 12 }}>
          Isi/ubah daftar fasilitas kost. Upload foto asli (opsional) — kalau nggak diupload, pakai ikon emoji aja.
        </p>
        {facilities.length === 0 ? <EmptyState icon="🏠" text="Belum ada fasilitas ditambahkan — landing page pakai daftar default." /> : renderImageItemsEditor(facilities, setFacilities)}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: ".95rem" }}>Keunggulan Kami</h3>
          <button type="button" className="btn-link" onClick={() => addImageItem(setKeunggulan)}>
            + Tambah
          </button>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 12 }}>
          Isi/ubah daftar keunggulan ("Pilihan Kost Nyaman"). Upload foto asli (opsional) — kalau nggak diupload, pakai ikon
          emoji aja.
        </p>
        {keunggulan.length === 0 ? <EmptyState icon="✨" text="Belum ada keunggulan ditambahkan — landing page pakai daftar default." /> : renderImageItemsEditor(keunggulan, setKeunggulan)}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: ".95rem" }}>Penghuni Kost</h3>
          <button type="button" className="btn-link" onClick={addPenghuni}>
            + Tambah
          </button>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 12 }}>
          Teks aja, nggak ada foto — nama, umur, kegiatan, dan sepatah kata dari penghuni. Muncul di section Testimoni
          begitu ada minimal 1 entri.
        </p>
        {penghuni.length === 0 ? (
          <EmptyState icon="🧑" text="Belum ada penghuni ditambahkan." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {penghuni.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <input style={{ flex: "1 1 140px" }} value={p.name} onChange={(e) => penghuniHelpers.update(i, { name: e.target.value })} placeholder="Nama" />
                <input style={{ width: 70 }} value={p.age} onChange={(e) => penghuniHelpers.update(i, { age: e.target.value })} placeholder="Umur" />
                <input style={{ flex: "1 1 140px" }} value={p.activity} onChange={(e) => penghuniHelpers.update(i, { activity: e.target.value })} placeholder="Kegiatan" />
                <input style={{ flex: "1 1 200px" }} value={p.quote} onChange={(e) => penghuniHelpers.update(i, { quote: e.target.value })} placeholder="Sepatah kata" />
                <div style={{ display: "flex", gap: 2 }}>
                  <button type="button" className="btn-link" onClick={() => penghuniHelpers.move(i, -1)} disabled={i === 0} title="Naikkan urutan">↑</button>
                  <button type="button" className="btn-link" onClick={() => penghuniHelpers.move(i, 1)} disabled={i === penghuni.length - 1} title="Turunkan urutan">↓</button>
                  <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => penghuniHelpers.remove(i)}>Hapus</button>
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
