import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatTanggalWIB } from "../../lib/format";
import { Card, EmptyState } from "../../components/Card";
import type { AuditLog as AuditLogType } from "../../types/database";

const ACTION_LABEL: Record<string, string> = {
  create_invite: "Undang penghuni baru",
  activate_account: "Aktivasi akun",
  generate_invoice: "Terbitkan tagihan otomatis",
  confirm_payment: "Konfirmasi pelunasan",
  submit_payment_proof: "Upload bukti transfer",
  approve_payment: "Setujui pembayaran",
  reject_payment: "Tolak pembayaran",
  delete_tenant: "Hapus penghuni",
  create_payment_account: "Tambah rekening",
  update_payment_account: "Ubah rekening",
  activate_payment_account: "Aktifkan rekening",
  deactivate_payment_account: "Nonaktifkan rekening",
  delete_payment_account: "Hapus rekening",
  end_tenancy: "Akhiri kontrak (checkout)",
  cancel_payment: "Batalkan pembayaran",
  create_advance_payment: "Bayar di muka",
};

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: fetchErr } = await supabase
        .from("audit_logs")
        .select("id, action, target_table, target_id, metadata, created_at, actor:profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (fetchErr) {
        setError("Gagal memuat audit log.");
        return;
      }
      setLogs(data as unknown as AuditLogType[]);
    }
    load();
  }, []);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Audit Log</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>100 aktivitas terakhir di sistem.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {logs === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState icon="📜" text="Belum ada aktivitas tercatat." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map((log) => (
            <Card key={log.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: ".85rem" }}>{ACTION_LABEL[log.action] ?? log.action}</span>
                  <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                    {" "}
                    oleh {log.actor?.full_name ?? "sistem"}
                  </span>
                </div>
                <span style={{ fontSize: ".75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{formatTanggalWIB(log.created_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
