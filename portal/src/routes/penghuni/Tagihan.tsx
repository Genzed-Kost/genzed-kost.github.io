import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadMyInvoices } from "../../lib/invoices";
import { formatRupiah, formatTanggalWIB } from "../../lib/format";
import { Card, EmptyState } from "../../components/Card";
import type { MyInvoiceView, InvoiceStatus } from "../../types/database";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draf",
  TERBIT: "Belum Dibayar",
  SEBAGIAN_DIBAYAR: "Dibayar Sebagian",
  LUNAS: "Lunas",
  JATUH_TEMPO: "Jatuh Tempo",
  DIBATALKAN: "Dibatalkan",
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT: "var(--muted)",
  TERBIT: "var(--text)",
  SEBAGIAN_DIBAYAR: "var(--warn)",
  LUNAS: "var(--accent)",
  JATUH_TEMPO: "var(--danger)",
  DIBATALKAN: "var(--muted)",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  SEWA_KAMAR: "Sewa Kamar",
  LAUNDRY: "Laundry",
  PARKIR_TAMBAHAN: "Parkir Tambahan",
  TAMU_MENGINAP: "Tamu Menginap",
  PERBAIKAN: "Perbaikan",
  DENDA: "Denda Keterlambatan",
  DISKON: "Diskon",
  LAINNYA: "Lainnya",
};

export default function Tagihan() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<MyInvoiceView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let mounted = true;

    loadMyInvoices(profile.id)
      .then((list) => {
        if (mounted) setInvoices(list);
      })
      .catch(() => {
        if (mounted) setError("Gagal memuat daftar tagihan. Coba refresh halaman ya.");
      });

    return () => {
      mounted = false;
    };
  }, [profile]);

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Tagihan</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>
        Daftar tagihan kost lo, dari yang terbaru.
      </p>

      {invoices === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : invoices.length === 0 ? (
        <Card>
          <EmptyState icon="🧾" text="Belum ada tagihan. Tagihan diterbitkan otomatis tiap periode sewa." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {invoices.map((inv) => {
            const sisa = Number(inv.myShareAmount) - Number(inv.myPaidAmount);
            const isExpanded = expandedId === inv.id;
            return (
              <Card key={inv.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  style={{
                    background: "none",
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                    padding: 0,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: ".92rem", marginBottom: 3 }}>
                        {inv.invoice_number} {inv.isShared && <span style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600 }}>· kamar dibagi</span>}
                      </div>
                      <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                        Periode {inv.period_start} s/d {inv.period_end} · Jatuh tempo {formatTanggalWIB(inv.due_date).split(",")[0]}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
                        {formatRupiah(sisa > 0 ? sisa : Number(inv.myShareAmount))}
                      </div>
                      {inv.isShared && <div style={{ fontSize: ".72rem", color: "var(--muted)" }}>porsi lo</div>}
                      <div style={{ fontSize: ".78rem", fontWeight: 700, color: STATUS_COLOR[inv.status] }}>
                        {STATUS_LABEL[inv.status]}
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    {inv.items.map((item) => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "6px 0" }}>
                        <span style={{ color: "var(--muted)" }}>
                          {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type} — {item.description}
                        </span>
                        <span style={{ whiteSpace: "nowrap", marginLeft: 12 }}>{formatRupiah(item.amount)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "3px 0" }}>
                        <span style={{ color: "var(--muted)" }}>Subtotal</span>
                        <span>{formatRupiah(inv.subtotal)}</span>
                      </div>
                      {inv.discount_total > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "3px 0", color: "var(--accent)" }}>
                          <span>Diskon</span>
                          <span>-{formatRupiah(inv.discount_total)}</span>
                        </div>
                      )}
                      {inv.penalty_total > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "3px 0", color: "var(--danger)" }}>
                          <span>Denda</span>
                          <span>+{formatRupiah(inv.penalty_total)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".9rem", fontWeight: 700, padding: "6px 0" }}>
                        <span>Total Tagihan (sekamar)</span>
                        <span>{formatRupiah(inv.total)}</span>
                      </div>
                      {inv.paid_total > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "3px 0", color: "var(--muted)" }}>
                          <span>Sudah dibayar (sekamar)</span>
                          <span>-{formatRupiah(inv.paid_total)}</span>
                        </div>
                      )}
                      {inv.isShared && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".9rem", fontWeight: 700, color: "var(--accent)" }}>
                            <span>Porsi Lo</span>
                            <span>{formatRupiah(inv.myShareAmount)}</span>
                          </div>
                          {inv.myPaidAmount > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", color: "var(--muted)", marginTop: 2 }}>
                              <span>Porsi lo yang sudah dibayar</span>
                              <span>-{formatRupiah(inv.myPaidAmount)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {sisa > 0 && (
                      <button
                        className="btn btn-primary"
                        style={{ width: "auto", marginTop: 14 }}
                        onClick={() => navigate("/penghuni/bayar", { state: { preselectInvoiceId: inv.id } })}
                      >
                        💸 Bayar Sekarang
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
