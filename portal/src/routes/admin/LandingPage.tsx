import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { Card } from "../../components/Card";

// Ringkasan konten landing page. Pengeditan dilakukan di editor visual langsung di
// website (panel samping), supaya admin bisa lihat hasilnya di konteks aslinya.
// Tombol "Edit" membuka /#edit=<bagian> → website langsung membuka editor bagian itu.

type Stats = { penghuni_aktif?: string; rating?: string; berdiri_sejak?: string };
type Content = {
  stats: Stats | null;
  maps_url: string | null;
  nearby: { label: string; distance: string }[] | null;
  facilities: { title: string; image_path: string | null }[] | null;
  keunggulan: { title: string; image_path: string | null }[] | null;
  penghuni: { name: string }[] | null;
};

const editUrl = (key?: string) => (key ? `/#edit=${key}` : "/#edit");

function Section({
  icon,
  title,
  desc,
  status,
  custom,
  editKey,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  status: string;
  custom: boolean;
  editKey: string;
  children?: ReactNode;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            fontSize: "1.25rem",
            background: "var(--surface2)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1rem" }}>{title}</h2>
            <span
              style={{
                fontSize: ".7rem",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 100,
                background: custom ? "#DCFCE7" : "var(--surface2)",
                color: custom ? "#166534" : "var(--muted)",
              }}
            >
              {custom ? "Sudah disesuaikan" : "Konten bawaan"}
            </span>
          </div>
          <p style={{ fontSize: ".82rem", color: "var(--muted)", marginTop: 4 }}>{desc}</p>
        </div>
      </div>
      <div style={{ fontSize: ".85rem" }}>{status}</div>
      {children}
      <div style={{ marginTop: "auto" }}>
        <a
          href={editUrl(editKey)}
          className="btn btn-primary"
          style={{ width: "auto", padding: "9px 16px", fontSize: ".84rem", textDecoration: "none" }}
        >
          ✏️ Edit di website
        </a>
      </div>
    </Card>
  );
}

function names(list: { title?: string; label?: string; name?: string }[] | null | undefined, max = 4) {
  const n = (list ?? []).map((x) => x.title || x.label || x.name).filter(Boolean) as string[];
  if (!n.length) return "";
  return n.slice(0, max).join(", ") + (n.length > max ? `, +${n.length - max} lagi` : "");
}

export default function LandingPageSettings() {
  const [c, setC] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("landing_content")
      .select("stats, maps_url, nearby, facilities, keunggulan, penghuni")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError("Gagal memuat konten landing page.");
        setC((data as Content) ?? { stats: null, maps_url: null, nearby: [], facilities: [], keunggulan: [], penghuni: [] });
      });
  }, []);

  const s = c?.stats ?? {};
  const statsCustom = !!(s.penghuni_aktif || s.rating || s.berdiri_sejak);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ maxWidth: 620 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Landing Page</h1>
          <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>
            Ubah isi website langsung di halamannya: aktifkan <strong>Mode edit</strong> di bar admin, klik tombol{" "}
            <strong>Edit</strong> di bagian yang mau diubah, lalu simpan. Perubahan langsung tampil untuk pengunjung.
          </p>
        </div>
        <a href={editUrl()} className="btn btn-primary" style={{ width: "auto", textDecoration: "none" }}>
          Buka editor visual ↗
        </a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!c ? (
        <Card>
          <span style={{ color: "var(--muted)" }}>Memuat…</span>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          <Section
            icon="📊"
            title="Statistik hero"
            desc="Tiga angka di bawah judul utama."
            custom={statsCustom}
            editKey="stats"
            status={statsCustom ? `${s.penghuni_aktif || "—"} penghuni · rating ${s.rating || "—"} · ${s.berdiri_sejak || "—"}` : "Memakai angka bawaan (120+ · 4.8 · 3thn)."}
          />
          <Section
            icon="✨"
            title="Keunggulan kami"
            desc='Kartu di slider "Pilihan Kost Nyaman".'
            custom={!!c.keunggulan?.length}
            editKey="keunggulan"
            status={c.keunggulan?.length ? `${c.keunggulan.length} kartu: ${names(c.keunggulan)}` : "Memakai 6 kartu bawaan."}
          />
          <Section
            icon="🛋️"
            title="Fasilitas"
            desc='Kartu di slider "Fasilitas Lengkap".'
            custom={!!c.facilities?.length}
            editKey="facilities"
            status={c.facilities?.length ? `${c.facilities.length} fasilitas: ${names(c.facilities)}` : "Memakai 7 fasilitas bawaan."}
          />
          <Section
            icon="📍"
            title="Lokasi & tempat terdekat"
            desc="Link Google Maps dan jarak ke tempat penting."
            custom={!!(c.nearby?.length || c.maps_url)}
            editKey="lokasi"
            status={
              (c.maps_url ? "✓ Link Google Maps terpasang. " : "Link Google Maps belum diisi. ") +
              (c.nearby?.length ? `${c.nearby.length} tempat: ${names(c.nearby, 3)}` : "Daftar tempat memakai bawaan.")
            }
          />
          <Section
            icon="💬"
            title="Kutipan penghuni (manual)"
            desc="Kutipan yang ditulis admin, tampil di section Testimoni."
            custom={!!c.penghuni?.length}
            editKey="penghuni"
            status={c.penghuni?.length ? `${c.penghuni.length} kutipan: ${names(c.penghuni)}` : "Belum ada kutipan manual."}
          />
          <Card style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: "1.25rem", background: "#fff", flexShrink: 0 }}>
                ⭐
              </div>
              <div>
                <h2 style={{ fontSize: "1rem" }}>Testimoni penghuni</h2>
                <p style={{ fontSize: ".82rem", color: "var(--muted)", marginTop: 4 }}>
                  Ditulis sendiri oleh penghuni lewat portal dan langsung tampil. Sembunyikan atau hapus dari halaman Testimoni.
                </p>
              </div>
            </div>
            <div style={{ marginTop: "auto" }}>
              <Link to="/admin/testimoni" className="btn-link">
                Kelola testimoni →
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
