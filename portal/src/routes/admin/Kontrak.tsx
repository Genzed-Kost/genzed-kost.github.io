import { useEffect, useState, type FormEvent } from "react";
import { supabase, functionsUrl } from "../../lib/supabaseClient";
import { formatRupiah } from "../../lib/format";
import { Card, EmptyState } from "../../components/Card";
import { Modal } from "../../components/Modal";
import type { TenancyWithTenant } from "../../types/database";

type SimpleProfile = { id: string; full_name: string };
type SimpleRoom = { id: string; room_number: string; is_occupied: boolean; room_type_id: string; room_types: { name: string; base_price: number } };

const CYCLES = ["BULANAN", "TRIWULAN", "SEMESTER", "TAHUNAN"] as const;

export default function Kontrak() {
  const [tenancies, setTenancies] = useState<TenancyWithTenant[] | null>(null);
  const [penghuniOptions, setPenghuniOptions] = useState<SimpleProfile[]>([]);
  const [roomOptions, setRoomOptions] = useState<SimpleRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [cycle, setCycle] = useState<(typeof CYCLES)[number]>("BULANAN");
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [tenRes, profRes, roomRes] = await Promise.all([
      supabase
        .from("tenancies")
        .select("*, room:rooms(*, room_type:room_types(*)), tenant:profiles(id, full_name, phone)")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("role", "penghuni").eq("is_active", true).order("full_name"),
      supabase.from("rooms").select("id, room_number, is_occupied, room_type_id, room_types(name, base_price)").order("room_number"),
    ]);
    if (tenRes.error) {
      setError("Gagal memuat daftar kontrak.");
      return;
    }
    setTenancies(tenRes.data as unknown as TenancyWithTenant[]);
    setPenghuniOptions((profRes.data ?? []) as SimpleProfile[]);
    setRoomOptions((roomRes.data ?? []) as unknown as SimpleRoom[]);
  }

  useEffect(() => {
    load();
  }, []);

  function handleRoomChange(id: string) {
    setRoomId(id);
    const room = roomOptions.find((r) => r.id === id);
    if (room) setRate(String(room.room_types.base_price));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tenantId || !roomId || !rate || !startDate) {
      setError("Semua field wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from("tenancies").insert({
        tenant_id: tenantId,
        room_id: roomId,
        billing_cycle: cycle,
        monthly_rate: Number(rate),
        start_date: startDate,
        status: "AKTIF",
      });
      if (insertErr) {
        setError("Gagal membuat kontrak: " + insertErr.message);
        return;
      }
      await supabase.from("rooms").update({ is_occupied: true }).eq("id", roomId);
      setShowForm(false);
      setTenantId("");
      setRoomId("");
      setRate("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const [checkoutTarget, setCheckoutTarget] = useState<TenancyWithTenant | null>(null);
  const [membersTarget, setMembersTarget] = useState<TenancyWithTenant | null>(null);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: "1.5rem" }}>Kelola Kontrak</h1>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Batal" : "+ Kontrak Baru"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Tetapkan penghuni ke kamar & atur tarif sewa.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="tenant">Penghuni</label>
              <select id="tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={selectStyle}>
                <option value="">— Pilih penghuni —</option>
                {penghuniOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="room">Kamar</label>
              <select id="room" value={roomId} onChange={(e) => handleRoomChange(e.target.value)} style={selectStyle}>
                <option value="">— Pilih kamar —</option>
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_number} — {r.room_types.name} {r.is_occupied ? "(terisi)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cycle">Siklus Bayar</label>
              <select id="cycle" value={cycle} onChange={(e) => setCycle(e.target.value as typeof cycle)} style={selectStyle}>
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rate">Tarif per Bulan (Rp)</label>
              <input id="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="startDate">Tanggal Mulai</label>
              <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "auto" }}>
              {submitting ? <span className="spinner" /> : "Buat Kontrak"}
            </button>
          </form>
        </Card>
      )}

      {tenancies === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : tenancies.length === 0 ? (
        <Card>
          <EmptyState icon="📄" text="Belum ada kontrak." />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tenancies.map((t) => (
            <Card key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                  {t.tenant.full_name} — Kamar {t.room.room_number}
                </div>
                <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                  {t.room.room_type.name} · {formatRupiah(t.monthly_rate)}/{t.billing_cycle.toLowerCase()} · Mulai {t.start_date}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: ".78rem",
                    fontWeight: 700,
                    color: t.status === "AKTIF" ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {t.status}
                </span>
                {t.status === "AKTIF" && (
                  <button className="btn-link" onClick={() => setMembersTarget(t)}>
                    Co-Tenant
                  </button>
                )}
                {t.status === "AKTIF" && (
                  <button className="btn-link" style={{ color: "var(--danger)" }} onClick={() => setCheckoutTarget(t)}>
                    Akhiri Kontrak
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {checkoutTarget && (
        <CheckoutModal
          tenancy={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onDone={() => {
            setCheckoutTarget(null);
            load();
          }}
        />
      )}

      {membersTarget && (
        <MembersModal tenancy={membersTarget} penghuniOptions={penghuniOptions} onClose={() => setMembersTarget(null)} />
      )}
    </div>
  );
}

type Member = { id: string; tenant_id: string; share_percent: number; is_primary: boolean; tenant: { full_name: string } };

function MembersModal({
  tenancy,
  penghuniOptions,
  onClose,
}: {
  tenancy: TenancyWithTenant;
  penghuniOptions: SimpleProfile[];
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTenantId, setNewTenantId] = useState("");
  const [newShare, setNewShare] = useState("");
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("tenancy_members")
      .select("id, tenant_id, share_percent, is_primary, tenant:profiles(full_name)")
      .eq("tenancy_id", tenancy.id)
      .order("is_primary", { ascending: false });
    const rows = (data ?? []) as unknown as Member[];
    setMembers(rows);
    setShareInputs(Object.fromEntries(rows.map((m) => [m.id, String(m.share_percent)])));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenancy.id]);

  const totalShare = Object.values(shareInputs).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const availableToAdd = penghuniOptions.filter((p) => !(members ?? []).some((m) => m.tenant_id === p.id));

  async function handleAddMember() {
    setError(null);
    setSuccess(false);
    const share = Number(newShare);
    if (!newTenantId || !share || share <= 0 || share > 100) {
      setError("Pilih penghuni dan isi persentase (1-100) dulu.");
      return;
    }
    setSaving(true);
    try {
      const { error: insertErr } = await supabase.from("tenancy_members").insert({
        tenancy_id: tenancy.id,
        tenant_id: newTenantId,
        share_percent: share,
        is_primary: false,
      });
      if (insertErr) {
        setError("Gagal menambah co-tenant: " + insertErr.message);
        return;
      }
      setNewTenantId("");
      setNewShare("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveShares() {
    setError(null);
    setSuccess(false);
    if (Math.round(totalShare) !== 100) {
      setError(`Total persentase harus pas 100% (sekarang ${totalShare}%).`);
      return;
    }
    setSaving(true);
    try {
      const updates = (members ?? []).map((m) => supabase.from("tenancy_members").update({ share_percent: Number(shareInputs[m.id]) }).eq("id", m.id));
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        setError("Sebagian persentase gagal disimpan.");
        return;
      }
      setSuccess(true);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(member: Member) {
    if (member.is_primary) {
      setError("Penghuni utama nggak bisa dihapus dari sini — akhiri kontraknya lewat 'Akhiri Kontrak' kalau memang mau keluar.");
      return;
    }
    if (!confirm(`Hapus ${member.tenant.full_name} dari kontrak ini?`)) return;
    await supabase.from("tenancy_members").delete().eq("id", member.id);
    await load();
  }

  return (
    <Modal title={`Co-Tenant — ${tenancy.tenant.full_name} (Kamar ${tenancy.room.room_number})`} onClose={onClose}>
      <p style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 16 }}>
        Bagi tagihan kamar ini ke beberapa penghuni. Perubahan cuma berlaku buat tagihan yang terbit SETELAH ini disimpan — tagihan yang sudah ada nggak diubah.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">Persentase berhasil disimpan.</div>}

      {members === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: ".88rem" }}>
                  {m.tenant.full_name} {m.is_primary && <span style={{ color: "var(--muted)", fontSize: ".78rem" }}>(utama)</span>}
                </div>
                <input
                  type="number"
                  value={shareInputs[m.id] ?? ""}
                  onChange={(e) => setShareInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>%</span>
                {!m.is_primary && (
                  <button className="btn-link" style={{ color: "var(--danger)" }} onClick={() => handleRemove(m)}>
                    Hapus
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: ".82rem", color: Math.round(totalShare) === 100 ? "var(--accent)" : "var(--warn)", marginBottom: 16 }}>
            Total: {totalShare}% {Math.round(totalShare) !== 100 && "— harus pas 100%"}
          </div>
          <button className="btn btn-primary" style={{ width: "auto", marginBottom: 24 }} disabled={saving} onClick={handleSaveShares}>
            {saving ? <span className="spinner" /> : "Simpan Persentase"}
          </button>

          {availableToAdd.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <h3 style={{ fontSize: ".9rem", marginBottom: 10 }}>+ Tambah Co-Tenant</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={newTenantId} onChange={(e) => setNewTenantId(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 160 }}>
                  <option value="">— Pilih penghuni —</option>
                  {availableToAdd.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="% porsi"
                  value={newShare}
                  onChange={(e) => setNewShare(e.target.value)}
                  style={{ width: 90 }}
                />
                <button className="btn btn-primary" style={{ width: "auto" }} disabled={saving} onClick={handleAddMember}>
                  Tambah
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function CheckoutModal({ tenancy, onClose, onDone }: { tenancy: TenancyWithTenant; onClose: () => void; onDone: () => void }) {
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [depositBalance, setDepositBalance] = useState<number | null>(null);
  const [damageInput, setDamageInput] = useState("");
  const [damageNote, setDamageNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ refund_amount: number; final_owed: number; applied_to_invoices: number } | null>(null);

  useEffect(() => {
    async function load() {
      const [invRes, depRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("total, paid_total")
          .eq("tenant_id", tenancy.tenant_id)
          .in("status", ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"]),
        supabase.from("deposits").select("remaining_amount").eq("tenant_id", tenancy.tenant_id),
      ]);
      setOutstanding((invRes.data ?? []).reduce((sum, i) => sum + (Number(i.total) - Number(i.paid_total)), 0));
      setDepositBalance((depRes.data ?? []).reduce((sum, d) => sum + Number(d.remaining_amount), 0));
    }
    load();
  }, [tenancy.tenant_id]);

  const damage = Math.max(0, Number(damageInput.replace(/\D/g, "")) || 0);
  const net = (depositBalance ?? 0) - (outstanding ?? 0) - damage;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(functionsUrl("end-tenancy"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenancy_id: tenancy.id, damage_deduction: damage, damage_note: damageNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal mengakhiri kontrak.");
        return;
      }
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Akhiri Kontrak — ${tenancy.tenant.full_name}`} onClose={onClose}>
      {result ? (
        <div>
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            Kontrak berhasil diakhiri. Kamar {tenancy.room.room_number} sudah tersedia lagi, akun penghuni dinonaktifkan.
          </div>
          {result.refund_amount > 0 && (
            <p style={{ fontSize: ".9rem", marginBottom: 8 }}>
              💰 Refund yang perlu dikembalikan ke penghuni: <strong>{formatRupiah(result.refund_amount)}</strong>
            </p>
          )}
          {result.final_owed > 0 && (
            <p style={{ fontSize: ".9rem", color: "var(--warn)", marginBottom: 8 }}>
              ⚠️ Penghuni masih punya tunggakan: <strong>{formatRupiah(result.final_owed)}</strong>
            </p>
          )}
          {result.refund_amount === 0 && result.final_owed === 0 && (
            <p style={{ fontSize: ".9rem", marginBottom: 8 }}>Semua tagihan lunas, tidak ada sisa deposit maupun tunggakan.</p>
          )}
          <p style={{ fontSize: ".8rem", color: "var(--muted)" }}>Rincian juga sudah dikirim ke WhatsApp penghuni.</p>
          <button className="btn btn-primary" style={{ width: "auto", marginTop: 12 }} onClick={onDone}>
            Selesai
          </button>
        </div>
      ) : outstanding === null || depositBalance === null ? (
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      ) : (
        <div>
          {error && <div className="alert alert-error">{error}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>Sisa Tagihan Belum Lunas</span>
            <span>{formatRupiah(outstanding)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", marginBottom: 16 }}>
            <span style={{ color: "var(--muted)" }}>Saldo Deposit</span>
            <span>{formatRupiah(depositBalance)}</span>
          </div>

          <div className="field">
            <label htmlFor="damage">Potongan Kerusakan (Rp, opsional)</label>
            <input id="damage" inputMode="numeric" value={damageInput} onChange={(e) => setDamageInput(e.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
          {damage > 0 && (
            <div className="field">
              <label htmlFor="damageNote">Keterangan Potongan</label>
              <input id="damageNote" value={damageNote} onChange={(e) => setDamageNote(e.target.value)} placeholder="mis. Kaca jendela pecah" />
            </div>
          )}

          <div style={{ padding: 14, background: "var(--surface2)", borderRadius: 10, marginBottom: 16 }}>
            {net >= 0 ? (
              <div style={{ fontSize: ".9rem" }}>
                💰 Deposit dikembalikan ke penghuni: <strong>{formatRupiah(net)}</strong>
              </div>
            ) : (
              <div style={{ fontSize: ".9rem", color: "var(--warn)" }}>
                ⚠️ Deposit tidak cukup — penghuni masih punya tunggakan sekitar <strong>{formatRupiah(-net)}</strong>
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={submitting} onClick={handleConfirm} style={{ width: "auto" }}>
            {submitting ? <span className="spinner" /> : "Konfirmasi & Akhiri Kontrak"}
          </button>
        </div>
      )}
    </Modal>
  );
}

const selectStyle = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: "12px 14px",
  fontSize: ".95rem",
  color: "var(--text)",
  width: "100%",
};
