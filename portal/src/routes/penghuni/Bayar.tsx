import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase, functionsUrl } from "../../lib/supabaseClient";
import { loadMyInvoices } from "../../lib/invoices";
import { formatRupiah } from "../../lib/format";
import { checkAndCalculateVoucher, type FeeConfig } from "../../lib/payment";
import { Card, EmptyState } from "../../components/Card";
import { QrisDisplay } from "../../components/QrisDisplay";
import { Countdown } from "../../components/Countdown";
import { PaymentAccountInfo } from "../../components/PaymentAccountInfo";
import { GatewayChannelPicker } from "../../components/GatewayChannelPicker";
import type { PaymentAccount } from "../../types/database";

type OutstandingInvoice = { id: string; invoice_number: string; due_date: string; total: number; paid_total: number; isShared: boolean };
type Method = "TRANSFER_MANUAL" | "QRIS_STATIS" | "GATEWAY";
type DiscountTier = { months: number; discount_percent: number };
type ActiveTenancy = { id: string; billing_cycle: string; monthly_rate: number };

type PaymentResult = {
  payment: { id: string; payment_number: string; method: string; expires_at: string; status: string };
  account?: PaymentAccount | null;
  qris_payload?: string;
  total_to_transfer?: number;
  redirect_url?: string;
};

export default function Bayar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const preselectId = (location.state as { preselectInvoiceId?: string } | null)?.preselectInvoiceId;

  const [invoices, setInvoices] = useState<OutstandingInvoice[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [depositBalance, setDepositBalance] = useState(0);
  const [useDeposit, setUseDeposit] = useState(false);
  const [partialMode, setPartialMode] = useState(false);
  const [partialAmountInput, setPartialAmountInput] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherStatus, setVoucherStatus] = useState<{ valid: boolean; discount?: number; reason?: string } | null>(null);
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [method, setMethod] = useState<Method>("TRANSFER_MANUAL");
  const [accounts, setAccounts] = useState<PaymentAccount[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [gatewayChannel, setGatewayChannel] = useState<string | null>(null);
  const [gatewayFees, setGatewayFees] = useState<Record<string, FeeConfig>>({});
  const [tenantBearsFee, setTenantBearsFee] = useState(true);
  const [wantPublicLink, setWantPublicLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);

  const [payMode, setPayMode] = useState<"normal" | "advance">("normal");
  const [tenancy, setTenancy] = useState<ActiveTenancy | null>(null);
  const [discountTiers, setDiscountTiers] = useState<DiscountTier[]>([]);
  const [advanceMonths, setAdvanceMonths] = useState<number | null>(null);
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let mounted = true;

    async function load() {
      const [myInvoices, depRes] = await Promise.all([
        loadMyInvoices(profile!.id),
        supabase.from("deposits").select("remaining_amount").eq("tenant_id", profile!.id),
      ]);
      if (!mounted) return;
      const list: OutstandingInvoice[] = myInvoices
        .filter((inv) => ["TERBIT", "SEBAGIAN_DIBAYAR", "JATUH_TEMPO"].includes(inv.status) && Number(inv.myShareAmount) - Number(inv.myPaidAmount) > 0)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .map((inv) => ({ id: inv.id, invoice_number: inv.invoice_number, due_date: inv.due_date, total: inv.myShareAmount, paid_total: inv.myPaidAmount, isShared: inv.isShared }));
      setInvoices(list);
      setDepositBalance((depRes.data ?? []).reduce((sum, d) => sum + Number(d.remaining_amount), 0));
      if (preselectId && list.some((i) => i.id === preselectId)) {
        setSelected(new Set([preselectId]));
      } else {
        setSelected(new Set(list.map((i) => i.id)));
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [profile, preselectId]);

  useEffect(() => {
    supabase
      .from("payment_accounts")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as PaymentAccount[];
        setAccounts(list);
        if (list.length > 0) setSelectedAccountId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("tenancies")
      .select("id, billing_cycle, monthly_rate")
      .eq("tenant_id", profile.id)
      .eq("status", "AKTIF")
      .maybeSingle()
      .then(({ data }) => setTenancy(data as ActiveTenancy | null));
    supabase
      .from("settings")
      .select("value")
      .eq("key", "advance_payment_discounts")
      .maybeSingle()
      .then(({ data }) => {
        const tiers = ((data?.value ?? []) as DiscountTier[]).slice().sort((a, b) => a.months - b.months);
        setDiscountTiers(tiers);
        if (tiers.length > 0) setAdvanceMonths(tiers[0].months);
      });
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["payment_method_fees", "admin_fee_borne_by"])
      .then(({ data }) => {
        const map = new Map((data ?? []).map((r) => [r.key, r.value]));
        const fees = map.get("payment_method_fees") as { gateway_channels?: Record<string, FeeConfig> } | undefined;
        setGatewayFees(fees?.gateway_channels ?? {});
        setTenantBearsFee((map.get("admin_fee_borne_by") as string | undefined) !== "pemilik");
      });
  }, [profile]);

  const selectedInvoices = useMemo(() => (invoices ?? []).filter((i) => selected.has(i.id)), [invoices, selected]);
  const isSharedSelected = selectedInvoices.some((i) => i.isShared);
  const totalOutstanding = useMemo(
    () => selectedInvoices.reduce((sum, i) => sum + (Number(i.total) - Number(i.paid_total)), 0),
    [selectedInvoices]
  );
  const parsedPartial = Number(partialAmountInput.replace(/\D/g, "")) || 0;
  const transactionAmount = partialMode && parsedPartial > 0 ? Math.min(parsedPartial, totalOutstanding) : totalOutstanding;
  const voucherDiscount = voucherStatus?.valid ? voucherStatus.discount ?? 0 : 0;
  const afterVoucher = Math.max(0, transactionAmount - voucherDiscount);
  const depositApplied = useDeposit ? Math.min(depositBalance, afterVoucher) : 0;
  const amountToPay = Math.max(0, afterVoucher - depositApplied);

  const selectedTier = discountTiers.find((t) => t.months === advanceMonths) ?? null;
  const advanceSubtotal = tenancy && selectedTier ? tenancy.monthly_rate * selectedTier.months : 0;
  const advanceDiscount = selectedTier ? Math.round((advanceSubtotal * selectedTier.discount_percent) / 100) : 0;
  const advanceTotal = advanceSubtotal - advanceDiscount;

  function toggleInvoice(id: string) {
    const inv = (invoices ?? []).find((i) => i.id === id);
    setSelected((prev) => {
      // Tagihan yang dibagi co-tenant cuma bisa dibayar satu-satu (porsi sendiri),
      // nggak bisa digabung sama tagihan lain dalam satu pembayaran.
      if (inv?.isShared) {
        if (!prev.has(id)) {
          setPartialMode(false);
          setPartialAmountInput("");
          setUseDeposit(false);
        }
        return prev.has(id) ? new Set() : new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Kalau ada tagihan shared yang kepilih sebelumnya, lepas dulu — nggak boleh gabung.
      for (const selId of Array.from(next)) {
        if (selId !== id && (invoices ?? []).find((i) => i.id === selId)?.isShared) next.delete(selId);
      }
      return next;
    });
    setVoucherStatus(null);
  }

  async function handleCheckVoucher() {
    setError(null);
    if (!voucherCode.trim()) return;
    setCheckingVoucher(true);
    try {
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", voucherCode.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (!voucher) {
        setVoucherStatus({ valid: false, reason: "Kode voucher tidak ditemukan." });
        return;
      }
      const check = checkAndCalculateVoucher(
        {
          voucherType: voucher.voucher_type,
          value: Number(voucher.value),
          maxDiscount: voucher.max_discount != null ? Number(voucher.max_discount) : null,
          minTransaction: Number(voucher.min_transaction),
          quota: voucher.quota,
          usedCount: voucher.used_count,
          validFrom: voucher.valid_from,
          validUntil: voucher.valid_until,
        },
        transactionAmount
      );
      setVoucherStatus(check.valid ? { valid: true, discount: check.discount } : { valid: false, reason: check.reason });
    } finally {
      setCheckingVoucher(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (selectedInvoices.length === 0) {
      setError("Pilih minimal 1 tagihan yang mau dibayar.");
      return;
    }
    if (method === "TRANSFER_MANUAL" && !selectedAccountId) {
      setError("Pilih rekening tujuan transfer dulu.");
      return;
    }
    if (method === "GATEWAY" && !gatewayChannel) {
      setError("Pilih channel pembayaran otomatis dulu (VA/e-wallet/QRIS/retail).");
      return;
    }
    const isSharedPayment = selectedInvoices.some((i) => i.isShared);
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(functionsUrl(isSharedPayment ? "create-share-payment" : "create-payment"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(
          isSharedPayment
            ? {
                invoice_id: selectedInvoices[0].id,
                method,
                payment_account_id: method === "TRANSFER_MANUAL" ? selectedAccountId : undefined,
                gateway_channel: method === "GATEWAY" ? gatewayChannel : undefined,
                want_public_link: wantPublicLink,
                idempotency_key: crypto.randomUUID(),
              }
            : {
                invoice_ids: selectedInvoices.map((i) => i.id),
                partial_amount: partialMode && parsedPartial > 0 ? parsedPartial : undefined,
                use_deposit_amount: useDeposit ? depositBalance : 0,
                voucher_code: voucherStatus?.valid ? voucherCode.trim() : undefined,
                method,
                payment_account_id: method === "TRANSFER_MANUAL" ? selectedAccountId : undefined,
                gateway_channel: method === "GATEWAY" ? gatewayChannel : undefined,
                want_public_link: wantPublicLink,
                idempotency_key: crypto.randomUUID(),
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat pembayaran. Coba lagi ya.");
        return;
      }

      if (data.payment.status === "LUNAS") {
        navigate("/penghuni/riwayat-bayar", { state: { justPaid: true } });
        return;
      }

      if (method === "GATEWAY" && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      setResult(data);
      if (wantPublicLink && data.payment.public_link_token) {
        setPublicLink(`${window.location.origin}/bayar/publik/${data.payment.public_link_token}`);
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvanceSubmit() {
    setError(null);
    if (!tenancy || !selectedTier) {
      setError("Pilih durasi bayar di muka dulu.");
      return;
    }
    if (method === "TRANSFER_MANUAL" && !selectedAccountId) {
      setError("Pilih rekening tujuan transfer dulu.");
      return;
    }
    if (method === "GATEWAY" && !gatewayChannel) {
      setError("Pilih channel pembayaran otomatis dulu (VA/e-wallet/QRIS/retail).");
      return;
    }
    setAdvanceSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(functionsUrl("create-advance-payment"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tenancy_id: tenancy.id,
          months_count: selectedTier.months,
          method,
          payment_account_id: method === "TRANSFER_MANUAL" ? selectedAccountId : undefined,
          gateway_channel: method === "GATEWAY" ? gatewayChannel : undefined,
          want_public_link: wantPublicLink,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat pembayaran di muka. Coba lagi ya.");
        return;
      }

      if (method === "GATEWAY" && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      setResult(data);
      if (wantPublicLink && data.payment.public_link_token) {
        setPublicLink(`${window.location.origin}/bayar/publik/${data.payment.public_link_token}`);
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setAdvanceSubmitting(false);
    }
  }

  async function handleUploadProof(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !result) return;
    setUploading(true);
    setError(null);
    try {
      const path = `${profile!.id}/${result.payment.id}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("payment-proofs").upload(path, file);
      if (uploadErr) {
        setError("Gagal upload bukti transfer. Coba lagi ya.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(functionsUrl("submit-payment-proof"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ payment_id: result.payment.id, file_path: path }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Gagal mengirim bukti transfer.");
        return;
      }
      setProofSubmitted(true);
    } finally {
      setUploading(false);
    }
  }

  if (!invoices) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      </div>
    );
  }

  if (result) {
    return (
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 480 }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: 16 }}>Selesaikan Pembayaran</h1>
        {error && <div className="alert alert-error">{error}</div>}

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>No. Pembayaran</span>
            <span style={{ fontWeight: 700 }}>{result.payment.payment_number}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Total Transfer</span>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>
              {formatRupiah(result.total_to_transfer ?? 0)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Batas Waktu</span>
            <Countdown expiresAt={result.payment.expires_at} />
          </div>

          {result.qris_payload && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <QrisDisplay payload={result.qris_payload} />
              <p style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 8 }}>Scan pakai m-banking atau e-wallet apapun.</p>
            </div>
          )}
          {result.payment.method === "TRANSFER_MANUAL" && (
            <div style={{ marginTop: 16, padding: 14, background: "var(--surface2)", borderRadius: 10 }}>
              <PaymentAccountInfo account={result.account} />
            </div>
          )}
          <p style={{ fontSize: ".78rem", color: "var(--warn)", marginTop: 12 }}>
            ⚠️ Transfer PAS sesuai nominal di atas (termasuk 3 digit kode unik) supaya admin gampang cocokin pembayaran lo.
          </p>
        </Card>

        {!proofSubmitted ? (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 10 }}>Upload Bukti Transfer</h3>
            <label className="btn btn-primary" style={{ width: "auto", cursor: "pointer" }}>
              {uploading ? <span className="spinner" /> : "📤 Pilih File"}
              <input type="file" hidden accept="image/*,.pdf" onChange={handleUploadProof} disabled={uploading} />
            </label>
          </Card>
        ) : (
          <div className="alert alert-success">
            Bukti transfer terkirim! Tunggu admin verifikasi ya, biasanya nggak lama.
          </div>
        )}

        {publicLink && (
          <Card>
            <h3 style={{ fontSize: ".95rem", marginBottom: 10 }}>Link Buat Ortu/Wali</h3>
            <p style={{ fontSize: ".82rem", color: "var(--muted)", marginBottom: 10 }}>
              Bagikan link ini, mereka bisa bayar tanpa perlu login.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={publicLink} readOnly style={{ flex: 1 }} />
              <button className="btn-link" onClick={() => navigator.clipboard.writeText(publicLink)}>
                Salin
              </button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>Bayar Tagihan</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 24 }}>Pilih tagihan, sumber dana, dan metode bayar.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {tenancy?.billing_cycle === "BULANAN" && discountTiers.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={payMode === "normal" ? "btn btn-primary" : "btn-link"}
            style={{ width: "auto" }}
            onClick={() => setPayMode("normal")}
          >
            Bayar Tagihan
          </button>
          <button
            type="button"
            className={payMode === "advance" ? "btn btn-primary" : "btn-link"}
            style={{ width: "auto" }}
            onClick={() => setPayMode("advance")}
          >
            💸 Bayar di Muka (Diskon)
          </button>
        </div>
      )}

      {payMode === "advance" && tenancy ? (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Pilih Durasi</h3>
            {discountTiers.map((t) => (
              <label key={t.months} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input type="radio" name="advanceMonths" checked={advanceMonths === t.months} onChange={() => setAdvanceMonths(t.months)} />
                <span style={{ fontSize: ".85rem" }}>
                  {t.months} bulan — potong {t.discount_percent}%
                </span>
              </label>
            ))}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>Metode Pembayaran</h3>
            {(["TRANSFER_MANUAL", "QRIS_STATIS", "GATEWAY"] as Method[]).map((m) => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input type="radio" name="advanceMethod" checked={method === m} onChange={() => setMethod(m)} />
                <span style={{ fontSize: ".85rem" }}>
                  {m === "TRANSFER_MANUAL" && "🏦 Transfer Manual"}
                  {m === "QRIS_STATIS" && "📱 QRIS"}
                  {m === "GATEWAY" && "⚡ Otomatis (VA/E-wallet/Retail via Midtrans)"}
                </span>
              </label>
            ))}
            {method === "TRANSFER_MANUAL" && (
              <div style={{ marginTop: 8, marginLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                {accounts === null ? (
                  <span style={{ fontSize: ".8rem", color: "var(--muted)" }}>Memuat rekening…</span>
                ) : accounts.length === 0 ? (
                  <span style={{ fontSize: ".8rem", color: "var(--danger)" }}>Belum ada rekening aktif. Hubungi admin kost.</span>
                ) : (
                  accounts.map((a) => (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="radio" name="advancePaymentAccount" checked={selectedAccountId === a.id} onChange={() => setSelectedAccountId(a.id)} />
                      <span style={{ fontSize: ".82rem" }}>
                        {a.account_type === "QRIS"
                          ? "QRIS"
                          : a.account_type === "EWALLET"
                            ? a.ewallet_provider
                            : a.account_type === "CRYPTO"
                              ? `${a.crypto_asset} (${a.crypto_network})`
                              : a.bank_name}
                        {a.account_type !== "CRYPTO" && a.account_number ? ` · ${a.account_number}` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
            {method === "GATEWAY" && (
              <GatewayChannelPicker
                fees={gatewayFees}
                baseAmount={advanceTotal}
                tenantBearsFee={tenantBearsFee}
                selected={gatewayChannel}
                onSelect={setGatewayChannel}
              />
            )}
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem" }}>
              <span style={{ color: "var(--muted)" }}>Subtotal ({selectedTier?.months ?? 0} bulan × {formatRupiah(tenancy.monthly_rate)})</span>
              <span>{formatRupiah(advanceSubtotal)}</span>
            </div>
            {advanceDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem", color: "var(--accent)" }}>
                <span>Diskon {selectedTier?.discount_percent}%</span>
                <span>-{formatRupiah(advanceDiscount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)", fontWeight: 700 }}>
              <span>Total Bayar</span>
              <span>{formatRupiah(advanceTotal)}</span>
            </div>
          </Card>

          <button className="btn btn-primary" onClick={handleAdvanceSubmit} disabled={advanceSubmitting || !selectedTier}>
            {advanceSubmitting ? <span className="spinner" /> : "Bayar di Muka Sekarang"}
          </button>
        </>
      ) : invoices.length === 0 ? (
        <Card>
          <EmptyState icon="🎉" text="Nggak ada tagihan yang perlu dibayar. Mantap!" />
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>1. Pilih Tagihan</h3>
            {invoices.map((inv) => {
              const outstanding = Number(inv.total) - Number(inv.paid_total);
              return (
                <label key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 600 }}>
                      {inv.invoice_number} {inv.isShared && <span style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600 }}>· porsi lo</span>}
                    </div>
                    <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>Jatuh tempo {inv.due_date}</div>
                  </div>
                  <div style={{ fontSize: ".85rem", fontWeight: 700 }}>{formatRupiah(outstanding)}</div>
                </label>
              );
            })}
          </Card>

          {isSharedSelected && (
            <div className="alert alert-error" style={{ marginBottom: 16, background: "var(--surface2)", color: "var(--muted)" }}>
              Tagihan ini dibagi co-tenant — lo cuma bayar porsi lo sendiri, langsung penuh (nggak bisa sebagian/pakai deposit/voucher).
            </div>
          )}

          {!isSharedSelected && (
            <>
              <Card style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>2. Nominal Bayar</h3>
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: partialMode ? 12 : 0, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={partialMode}
                    onChange={(e) => {
                      setPartialMode(e.target.checked);
                      setVoucherStatus(null);
                    }}
                  />
                  <span style={{ fontSize: ".85rem" }}>Bayar sebagian dulu (sisanya tetap tercatat)</span>
                </label>
                {partialMode && (
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={`Nominal, mis. ${Math.round(totalOutstanding / 2)}`}
                    value={partialAmountInput}
                    onChange={(e) => {
                      setPartialAmountInput(e.target.value.replace(/\D/g, ""));
                      setVoucherStatus(null);
                    }}
                  />
                )}
              </Card>

              <Card style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>3. Sumber Dana</h3>
                {depositBalance > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={useDeposit} onChange={(e) => setUseDeposit(e.target.checked)} />
                    <span style={{ fontSize: ".85rem" }}>Pakai saldo deposit ({formatRupiah(depositBalance)} tersedia)</span>
                  </label>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    placeholder="Kode voucher (opsional)"
                    value={voucherCode}
                    onChange={(e) => {
                      setVoucherCode(e.target.value);
                      setVoucherStatus(null);
                    }}
                  />
                  <button className="btn btn-primary" style={{ width: "auto" }} onClick={handleCheckVoucher} disabled={checkingVoucher}>
                    {checkingVoucher ? <span className="spinner" /> : "Cek"}
                  </button>
                </div>
                {voucherStatus && (
                  <p style={{ fontSize: ".8rem", marginTop: 8, color: voucherStatus.valid ? "var(--accent)" : "var(--danger)" }}>
                    {voucherStatus.valid ? `Voucher valid! Potongan ${formatRupiah(voucherStatus.discount ?? 0)}` : voucherStatus.reason}
                  </p>
                )}
              </Card>
            </>
          )}

          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: ".95rem", marginBottom: 12 }}>4. Metode Pembayaran</h3>
            {(["TRANSFER_MANUAL", "QRIS_STATIS", "GATEWAY"] as Method[]).map((m) => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                <span style={{ fontSize: ".85rem" }}>
                  {m === "TRANSFER_MANUAL" && "🏦 Transfer Manual"}
                  {m === "QRIS_STATIS" && "📱 QRIS"}
                  {m === "GATEWAY" && "⚡ Otomatis (VA/E-wallet/Retail via Midtrans)"}
                </span>
              </label>
            ))}

            {method === "TRANSFER_MANUAL" && (
              <div style={{ marginTop: 8, marginLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                {accounts === null ? (
                  <span style={{ fontSize: ".8rem", color: "var(--muted)" }}>Memuat rekening…</span>
                ) : accounts.length === 0 ? (
                  <span style={{ fontSize: ".8rem", color: "var(--danger)" }}>Belum ada rekening aktif. Hubungi admin kost.</span>
                ) : (
                  accounts.map((a) => (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="radio" name="paymentAccount" checked={selectedAccountId === a.id} onChange={() => setSelectedAccountId(a.id)} />
                      <span style={{ fontSize: ".82rem" }}>
                        {a.account_type === "QRIS"
                          ? "QRIS"
                          : a.account_type === "EWALLET"
                            ? a.ewallet_provider
                            : a.account_type === "CRYPTO"
                              ? `${a.crypto_asset} (${a.crypto_network})`
                              : a.bank_name}
                        {a.account_type !== "CRYPTO" && a.account_number ? ` · ${a.account_number}` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
            {method === "GATEWAY" && (
              <GatewayChannelPicker
                fees={gatewayFees}
                baseAmount={amountToPay}
                tenantBearsFee={tenantBearsFee}
                selected={gatewayChannel}
                onSelect={setGatewayChannel}
              />
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={wantPublicLink} onChange={(e) => setWantPublicLink(e.target.checked)} />
              <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>Buat link buat ortu/wali (bisa bayar tanpa login)</span>
            </label>
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem" }}>
              <span style={{ color: "var(--muted)" }}>Total Tagihan Dipilih</span>
              <span>{formatRupiah(totalOutstanding)}</span>
            </div>
            {partialMode && transactionAmount < totalOutstanding && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem" }}>
                <span style={{ color: "var(--muted)" }}>Dibayar Sekarang</span>
                <span>{formatRupiah(transactionAmount)}</span>
              </div>
            )}
            {voucherDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem", color: "var(--accent)" }}>
                <span>Voucher</span>
                <span>-{formatRupiah(voucherDiscount)}</span>
              </div>
            )}
            {depositApplied > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: ".85rem", color: "var(--accent)" }}>
                <span>Saldo Deposit</span>
                <span>-{formatRupiah(depositApplied)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)", fontWeight: 700 }}>
              <span>Total Bayar</span>
              <span>{formatRupiah(amountToPay)}</span>
            </div>
          </Card>

          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || selectedInvoices.length === 0}>
            {submitting ? <span className="spinner" /> : amountToPay === 0 ? "Selesaikan Pembayaran" : "Lanjut Bayar"}
          </button>
        </>
      )}
    </div>
  );
}
