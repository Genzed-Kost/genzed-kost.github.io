import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { formatRupiah, formatTanggalWIB } from "../../lib/format";
import { Card, EmptyState, StatCard } from "../../components/Card";

type Stats = {
  pendingVerification: number;
  overdueInvoices: number;
  monthIncome: number;
  occupiedRooms: number;
  totalRooms: number;
};

type MonthIncome = { label: string; total: number };
type Tunggakan = { invoice_number: string; due_date: string; outstanding: number; tenant_name: string };
type PendingVerificationRow = { id: string; payment_number: string; amount: number; created_at: string; tenant_name: string };
type VacantRoom = { id: string; room_number: string; type_name: string };

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

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState<MonthIncome[] | null>(null);
  const [tunggakan, setTunggakan] = useState<Tunggakan[] | null>(null);
  const [pendingVerif, setPendingVerif] = useState<PendingVerificationRow[] | null>(null);
  const [vacantRooms, setVacantRooms] = useState<VacantRoom[] | null>(null);

  useEffect(() => {
    async function load() {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const [pendingRes, overdueRes, sixMonthPaymentsRes, roomsRes, tunggakanRes, pendingListRes] = await Promise.all([
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "MENUNGGU_VERIFIKASI"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "JATUH_TEMPO"),
        supabase.from("payments").select("amount, admin_fee, paid_at").eq("status", "LUNAS").gte("paid_at", sixMonthsAgo.toISOString()),
        supabase.from("rooms").select("id, room_number, is_occupied, room_types(name)"),
        supabase
          .from("invoices")
          .select("invoice_number, due_date, total, paid_total, profiles(full_name)")
          .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"])
          .order("due_date", { ascending: true }),
        supabase
          .from("payments")
          .select("id, payment_number, amount, created_at, tenant:profiles!payments_tenant_id_fkey(full_name)")
          .eq("status", "MENUNGGU_VERIFIKASI")
          .order("created_at", { ascending: true })
          .limit(5),
      ]);

      const rooms = (roomsRes.data ?? []) as unknown as { id: string; room_number: string; is_occupied: boolean; room_types: { name: string } | null }[];
      const totalRooms = rooms.length;
      const occupiedRooms = rooms.filter((r) => r.is_occupied).length;

      const monthIncome = (sixMonthPaymentsRes.data ?? [])
        .filter((p) => p.paid_at && new Date(p.paid_at) >= monthStart)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      setStats({
        pendingVerification: pendingRes.count ?? 0,
        overdueInvoices: overdueRes.count ?? 0,
        monthIncome,
        occupiedRooms,
        totalRooms,
      });

      const byMonth = new Map<string, number>();
      for (const p of sixMonthPaymentsRes.data ?? []) {
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
        months.push({ label: d.toLocaleDateString("id-ID", { month: "short", year: "numeric" }), total: byMonth.get(key) ?? 0 });
      }
      setMonthlyIncome(months);

      setTunggakan(
        (tunggakanRes.data ?? []).map((inv) => ({
          invoice_number: inv.invoice_number,
          due_date: inv.due_date,
          outstanding: Number(inv.total) - Number(inv.paid_total),
          tenant_name: (inv.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
        }))
      );

      setVacantRooms(
        rooms.filter((r) => !r.is_occupied).map((r) => ({ id: r.id, room_number: r.room_number, type_name: r.room_types?.name ?? "-" }))
      );

      setPendingVerif(
        (pendingListRes.data ?? []).map((p) => ({
          id: p.id,
          payment_number: p.payment_number,
          amount: Number(p.amount),
          created_at: p.created_at,
          tenant_name: (p.tenant as unknown as { full_name: string } | null)?.full_name ?? "-",
        }))
      );
    }
    load();
  }, []);

  const maxIncome = Math.max(1, ...(monthlyIncome ?? []).map((m) => m.total));
  const totalTunggakan = (tunggakan ?? []).reduce((sum, t) => sum + t.outstanding, 0);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Dashboard Admin</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Halo, {profile?.full_name}. Ini ringkasan kost hari ini.</p>

      {!stats ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
            <StatCard label="Pemasukan Bulan Ini" value={formatRupiah(stats.monthIncome)} />
            <StatCard label="Tingkat Hunian" value={`${stats.occupiedRooms}/${stats.totalRooms}`} hint="kamar terisi" />
            <StatCard label="Tunggakan Jatuh Tempo" value={stats.overdueInvoices} />
            <StatCard label="Menunggu Verifikasi" value={stats.pendingVerification} />
          </div>

          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 16 }}>Pemasukan 6 Bulan Terakhir</h3>
            {monthlyIncome === null ? (
              <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 140 }}>
                {monthlyIncome.map((m) => (
                  <div key={m.label} style={{ flex: 1, textAlign: "center" }}>
                    <div
                      style={{ height: Math.max(4, (m.total / maxIncome) * 100), background: "var(--accent)", borderRadius: "6px 6px 0 0", marginBottom: 6 }}
                      title={formatRupiah(m.total)}
                    />
                    <div style={{ fontSize: ".7rem", color: "var(--muted)" }}>{m.label}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: ".95rem" }}>💸 Daftar Tunggakan</h3>
                <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                  Total {formatRupiah(totalTunggakan)} · {tunggakan?.length ?? 0} tagihan
                </span>
              </div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: ".95rem" }}>📋 Menunggu Verifikasi</h3>
                {stats.pendingVerification > 0 && (
                  <Link to="/admin/verifikasi" className="btn-link" style={{ fontSize: ".78rem" }}>
                    Verifikasi →
                  </Link>
                )}
              </div>
              {pendingVerif === null ? (
                <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
              ) : pendingVerif.length === 0 ? (
                <EmptyState icon="✅" text="Nggak ada yang perlu diverifikasi." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {pendingVerif.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: ".85rem", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.tenant_name}</div>
                        <div style={{ fontSize: ".76rem", color: "var(--muted)" }}>
                          {p.payment_number} · {formatTanggalWIB(p.created_at)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatRupiah(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: ".95rem" }}>🛏️ Kamar Kosong</h3>
              </div>
              {vacantRooms === null ? (
                <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
              ) : vacantRooms.length === 0 ? (
                <EmptyState icon="🏠" text="Semua kamar terisi penuh!" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {vacantRooms.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: ".85rem", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontWeight: 600 }}>Kamar {r.room_number}</span>
                      <span style={{ color: "var(--muted)" }}>{r.type_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
