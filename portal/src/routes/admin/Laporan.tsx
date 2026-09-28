import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatRupiah } from "../../lib/format";
import { Card, EmptyState, StatCard } from "../../components/Card";

type MonthIncome = { label: string; total: number };
type Tunggakan = { invoice_number: string; due_date: string; outstanding: number; tenant_name: string };
type Reconciliation = { id: string; our_status: string; midtrans_status: string; detected_at: string; payment_number: string };

// Lazy-load xlsx (lumayan berat) biar nggak ikut kebawa ke bundle halaman penghuni
// yang nggak pernah butuh fitur ekspor ini sama sekali.
async function downloadXlsx(filename: string, rows: Tunggakan[]) {
  const XLSX = await import("xlsx");
  const sheetRows = rows.map((r) => ({
    "No Invoice": r.invoice_number,
    Penghuni: r.tenant_name,
    "Jatuh Tempo": r.due_date,
    Tunggakan: r.outstanding,
  }));
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Tunggakan");
  XLSX.writeFile(book, filename);
}

export default function Laporan() {
  const [monthlyIncome, setMonthlyIncome] = useState<MonthIncome[] | null>(null);
  const [tunggakan, setTunggakan] = useState<Tunggakan[] | null>(null);
  const [occupancy, setOccupancy] = useState<{ occupied: number; total: number } | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[] | null>(null);

  async function loadReconciliations() {
    const { data } = await supabase
      .from("payment_reconciliations")
      .select("id, our_status, midtrans_status, detected_at, payment:payments(payment_number)")
      .order("detected_at", { ascending: false });
    setReconciliations(
      (data ?? []).map((r) => ({
        id: r.id,
        our_status: r.our_status,
        midtrans_status: r.midtrans_status,
        detected_at: r.detected_at,
        payment_number: (r.payment as unknown as { payment_number: string } | null)?.payment_number ?? "-",
      }))
    );
  }

  async function handleDismissReconciliation(id: string) {
    await supabase.from("payment_reconciliations").delete().eq("id", id);
    setReconciliations((prev) => (prev ?? []).filter((r) => r.id !== id));
  }

  useEffect(() => {
    async function load() {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const [paymentsRes, invoicesRes, roomsRes] = await Promise.all([
        supabase.from("payments").select("amount, admin_fee, paid_at").eq("status", "LUNAS").gte("paid_at", sixMonthsAgo.toISOString()),
        supabase
          .from("invoices")
          .select("invoice_number, due_date, total, paid_total, profiles(full_name)")
          .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"])
          .order("due_date", { ascending: true }),
        supabase.from("rooms").select("id, is_occupied"),
      ]);

      const byMonth = new Map<string, number>();
      for (const p of paymentsRes.data ?? []) {
        if (!p.paid_at) continue;
        const d = new Date(p.paid_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount) + Number(p.admin_fee));
      }
      const months: MonthIncome[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({
          label: d.toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
          total: byMonth.get(key) ?? 0,
        });
      }
      setMonthlyIncome(months);

      const tunggakanRows: Tunggakan[] = (invoicesRes.data ?? []).map((inv) => ({
        invoice_number: inv.invoice_number,
        due_date: inv.due_date,
        outstanding: Number(inv.total) - Number(inv.paid_total),
        tenant_name: (inv.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
      }));
      setTunggakan(tunggakanRows);

      const totalRooms = roomsRes.data?.length ?? 0;
      const occupiedRooms = (roomsRes.data ?? []).filter((r) => r.is_occupied).length;
      setOccupancy({ occupied: occupiedRooms, total: totalRooms });
    }
    load();
    loadReconciliations();
  }, []);

  const maxIncome = Math.max(1, ...(monthlyIncome ?? []).map((m) => m.total));
  const totalTunggakan = (tunggakan ?? []).reduce((sum, t) => sum + t.outstanding, 0);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 24 }}>Laporan</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Tunggakan" value={formatRupiah(totalTunggakan)} hint={`${tunggakan?.length ?? 0} tagihan`} />
        <StatCard label="Tingkat Hunian" value={occupancy ? `${occupancy.occupied}/${occupancy.total}` : "…"} />
      </div>

      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 16 }}>Pemasukan 6 Bulan Terakhir</h3>
        {monthlyIncome === null ? (
          <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 140 }}>
            {monthlyIncome.map((m) => (
              <div key={m.label} style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    height: Math.max(4, (m.total / maxIncome) * 100),
                    background: "var(--accent)",
                    borderRadius: "6px 6px 0 0",
                    marginBottom: 6,
                  }}
                  title={formatRupiah(m.total)}
                />
                <div style={{ fontSize: ".7rem", color: "var(--muted)" }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: ".95rem" }}>Daftar Tunggakan</h3>
          {tunggakan && tunggakan.length > 0 && (
            <button className="btn-link" onClick={() => downloadXlsx("tunggakan.xlsx", tunggakan)}>
              📥 Ekspor Excel (.xlsx)
            </button>
          )}
        </div>
        {tunggakan === null ? (
          <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
        ) : tunggakan.length === 0 ? (
          <EmptyState icon="🎉" text="Nggak ada tunggakan. Semua penghuni lunas!" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tunggakan.map((t) => (
              <div key={t.invoice_number} style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span>
                  {t.tenant_name} — {t.invoice_number}
                </span>
                <span style={{ fontWeight: 700, color: "var(--danger)" }}>{formatRupiah(t.outstanding)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: ".95rem", marginBottom: 6 }}>Rekonsiliasi Midtrans</h3>
        <p style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 16 }}>
          Selisih antara status pembayaran di sistem kita vs status asli di Midtrans, dicek otomatis tiap hari. Biasanya artinya notifikasi
          webhook gagal masuk — cek manual transaksinya di dashboard Midtrans sebelum diperbaiki.
        </p>
        {reconciliations === null ? (
          <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
        ) : reconciliations.length === 0 ? (
          <EmptyState icon="✅" text="Nggak ada selisih. Semua status pembayaran gateway cocok." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reconciliations.map((r) => (
              <div
                key={r.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".85rem", padding: "8px 0", borderBottom: "1px solid var(--border)" }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{r.payment_number}</div>
                  <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                    Sistem kita: <strong>{r.our_status}</strong> · Midtrans: <strong>{r.midtrans_status}</strong>
                  </div>
                </div>
                <button className="btn-link" onClick={() => handleDismissReconciliation(r.id)}>
                  Tandai Sudah Dicek
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
