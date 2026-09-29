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

type OverdueRow = { id: string; invoice_number: string; due_date: string; outstanding: number; tenant_name: string };
type PendingVerificationRow = { id: string; payment_number: string; amount: number; created_at: string; tenant_name: string };
type VacantRoom = { id: string; room_number: string; type_name: string };

function daysOverdue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)));
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [overdue, setOverdue] = useState<OverdueRow[] | null>(null);
  const [pendingVerif, setPendingVerif] = useState<PendingVerificationRow[] | null>(null);
  const [vacantRooms, setVacantRooms] = useState<VacantRoom[] | null>(null);

  useEffect(() => {
    async function load() {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [pendingRes, overdueRes, paymentsRes, roomsRes, overdueListRes, pendingListRes] = await Promise.all([
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "MENUNGGU_VERIFIKASI"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "JATUH_TEMPO"),
        supabase.from("payments").select("amount, admin_fee").eq("status", "LUNAS").gte("paid_at", monthStart.toISOString()),
        supabase.from("rooms").select("id, room_number, is_occupied, room_types(name)"),
        supabase
          .from("invoices")
          .select("id, invoice_number, due_date, total, paid_total, profiles(full_name)")
          .eq("status", "JATUH_TEMPO")
          .order("due_date", { ascending: true })
          .limit(5),
        supabase
          .from("payments")
          .select("id, payment_number, amount, created_at, tenant:profiles!payments_tenant_id_fkey(full_name)")
          .eq("status", "MENUNGGU_VERIFIKASI")
          .order("created_at", { ascending: true })
          .limit(5),
      ]);

      const monthIncome = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
      const rooms = (roomsRes.data ?? []) as unknown as { id: string; room_number: string; is_occupied: boolean; room_types: { name: string } | null }[];
      const totalRooms = rooms.length;
      const occupiedRooms = rooms.filter((r) => r.is_occupied).length;

      setStats({
        pendingVerification: pendingRes.count ?? 0,
        overdueInvoices: overdueRes.count ?? 0,
        monthIncome,
        occupiedRooms,
        totalRooms,
      });

      setVacantRooms(
        rooms
          .filter((r) => !r.is_occupied)
          .map((r) => ({ id: r.id, room_number: r.room_number, type_name: r.room_types?.name ?? "-" }))
      );

      setOverdue(
        (overdueListRes.data ?? []).map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          due_date: inv.due_date,
          outstanding: Number(inv.total) - Number(inv.paid_total),
          tenant_name: (inv.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
        }))
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

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Dashboard Admin</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Halo, {profile?.full_name}. Ini ringkasan kost hari ini.</p>

      {!stats ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
            <StatCard label="Pemasukan Bulan Ini" value={formatRupiah(stats.monthIncome)} />
            <StatCard label="Tingkat Hunian" value={`${stats.occupiedRooms}/${stats.totalRooms}`} hint="kamar terisi" />
            <StatCard label="Tunggakan Jatuh Tempo" value={stats.overdueInvoices} />
            <StatCard label="Menunggu Verifikasi" value={stats.pendingVerification} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: ".95rem" }}>⏰ Tunggakan Jatuh Tempo</h3>
                {stats.overdueInvoices > 0 && (
                  <Link to="/admin/laporan" className="btn-link" style={{ fontSize: ".78rem" }}>
                    Lihat Semua →
                  </Link>
                )}
              </div>
              {overdue === null ? (
                <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
              ) : overdue.length === 0 ? (
                <EmptyState icon="🎉" text="Nggak ada tunggakan. Semua penghuni lunas!" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {overdue.map((o) => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: ".85rem", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{o.tenant_name}</div>
                        <div style={{ fontSize: ".76rem", color: "var(--muted)" }}>
                          {o.invoice_number} · telat {daysOverdue(o.due_date)} hari
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--danger)", whiteSpace: "nowrap" }}>{formatRupiah(o.outstanding)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

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
