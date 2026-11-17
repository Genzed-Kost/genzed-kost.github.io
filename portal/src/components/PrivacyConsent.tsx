import { useEffect, useState } from "react";

// Teks Kebijakan Privasi diambil dari /ai-kost-data.json (sumber yang sama dengan
// jawaban AI Kost), jadi cukup diedit di satu tempat.
type Section = { bagian: string; isi: string[] };
export type PrivacyPolicy = { version: string; sections: Section[] };

const FALLBACK: PrivacyPolicy = {
  version: "",
  sections: [
    {
      bagian: "Ringkasan",
      isi: [
        "Kami menyimpan data identitas (nama, No HP, email, dokumen identitas) serta data kontrak & pembayaran untuk mengelola sewa, tagihan, dan notifikasi.",
        "Data tidak dijual ke pihak ketiga dan hanya bisa dilihat penghuni yang bersangkutan & admin.",
        "Kamu berhak minta koreksi data lewat menu Komplain atau admin.",
      ],
    },
  ],
};

export function usePrivacyPolicy(): PrivacyPolicy | null {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/ai-kost-data.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { privasi?: Section[]; privasi_versi?: string }) => {
        if (!alive) return;
        const sections = (d.privasi ?? []).filter((s) => s.isi?.length);
        setPolicy(sections.length ? { version: d.privasi_versi ?? "", sections } : FALLBACK);
      })
      .catch(() => alive && setPolicy(FALLBACK));
    return () => {
      alive = false;
    };
  }, []);
  return policy;
}

export function PrivacyConsent({
  policy,
  checked,
  onChange,
}: {
  policy: PrivacyPolicy | null;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        borderRadius: "var(--r)",
        padding: 14,
        marginBottom: 16,
        fontSize: ".82rem",
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🔒 Kebijakan Privasi</div>
      <p style={{ color: "var(--muted)", marginBottom: 8 }}>
        Sebelum akunmu aktif, baca dulu gimana Genzed Kost mengelola data pribadimu.
      </p>
      <div
        style={{
          maxHeight: 180,
          overflowY: "auto",
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          marginBottom: 12,
        }}
        tabIndex={0}
        aria-label="Isi Kebijakan Privasi"
      >
        {!policy ? (
          <span style={{ color: "var(--muted)" }}>Memuat…</span>
        ) : (
          policy.sections.map((s) => (
            <div key={s.bagian} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{s.bagian}</div>
              <ul style={{ paddingLeft: 18, color: "var(--muted)" }}>
                {s.isi.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: "#DB2777" }}
        />
        <span>
          Saya sudah membaca dan <strong>menyetujui Kebijakan Privasi</strong> Genzed Kost, termasuk pemakaian data saya untuk
          pengelolaan sewa, tagihan, dan notifikasi.
        </span>
      </label>
    </div>
  );
}
