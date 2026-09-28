import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { Card, EmptyState } from "../../components/Card";

const BUCKET = "tenant-documents";
const MAX_SIZE_MB = 10;

type DocFile = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
};

export default function Dokumen() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<DocFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    const { data, error: listErr } = await supabase.storage.from(BUCKET).list(profile!.id, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (listErr) {
      setError("Gagal memuat daftar dokumen.");
      return;
    }
    setFiles(
      (data ?? [])
        .filter((f) => f.id)
        .map((f) => ({
          name: f.name,
          path: `${profile!.id}/${f.name}`,
          size: f.metadata?.size ?? 0,
          createdAt: f.created_at ?? "",
        }))
    );
  }

  useEffect(() => {
    if (profile) loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_SIZE_MB}MB.`);
      return;
    }
    setUploading(true);
    try {
      const path = `${profile!.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadErr) {
        setError("Gagal upload dokumen. Coba lagi ya.");
        return;
      }
      await loadFiles();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(path: string, name: string) {
    if (!confirm(`Hapus dokumen "${name}" secara permanen?`)) return;
    await supabase.storage.from(BUCKET).remove([path]);
    await loadFiles();
  }

  async function handleDownload(path: string) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Dokumen</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Simpan dokumen pribadi lo (KTP, kontrak sewa, dll) di sini. Cuma lo dan admin yang bisa lihat.
      </p>

      <Card style={{ marginBottom: 24 }}>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="btn btn-primary" style={{ width: "auto", cursor: "pointer" }}>
          {uploading ? <span className="spinner" /> : "📤 Upload Dokumen"}
          <input ref={inputRef} type="file" hidden onChange={handleUpload} disabled={uploading} />
        </label>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 10 }}>Maksimal {MAX_SIZE_MB}MB per file.</p>
      </Card>

      {files === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : files.length === 0 ? (
        <Card>
          <EmptyState icon="📁" text="Belum ada dokumen yang diupload." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {files.map((f) => (
            <Card key={f.path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: ".88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </div>
                <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn-link" onClick={() => handleDownload(f.path)}>
                  Lihat
                </button>
                <button className="btn-link" style={{ color: "var(--danger)" }} onClick={() => handleDelete(f.path, f.name)}>
                  Hapus
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
