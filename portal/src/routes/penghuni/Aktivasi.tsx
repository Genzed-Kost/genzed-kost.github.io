import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/AuthLayout";
import { supabase, functionsUrl } from "../../lib/supabaseClient";
import { isPhoneID } from "../../lib/format";
import { PrivacyConsent, usePrivacyPolicy } from "../../components/PrivacyConsent";

type Step = "kode" | "otp" | "password";

export default function Aktivasi() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("kode");
  const [phone, setPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailForRecovery, setEmailForRecovery] = useState("");
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const privacyPolicy = usePrivacyPolicy();

  async function handleVerifyInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPhoneID(phone)) {
      setError("Format No HP nggak valid. Contoh: 081234567890");
      return;
    }
    if (inviteCode.length !== 6) {
      setError("Kode undangan harus 6 digit.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(functionsUrl("verify-invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, invite_code: inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kode undangan tidak valid.");
        return;
      }
      setStep("otp");
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError("Kode OTP harus 6 digit.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(functionsUrl("verify-otp-activate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kode OTP tidak valid.");
        return;
      }

      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: data.token_hash,
      });
      if (verifyErr) {
        setError("Gagal memverifikasi sesi. Coba ulangi proses aktivasi.");
        return;
      }

      setEmailForRecovery(data.email);
      setStep("password");
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password nggak cocok.");
      return;
    }
    if (!privacyAgreed) {
      setError("Centang persetujuan Kebijakan Privasi dulu ya sebelum mengaktifkan akun.");
      return;
    }
    setLoading(true);
    try {
      // Persetujuan privasi dicatat di metadata akun (Supabase Auth → Users → user_metadata).
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          privacy_consent_at: new Date().toISOString(),
          privacy_policy_version: privacyPolicy?.version || null,
        },
      });
      if (updateErr) {
        setError("Gagal menyimpan password. Coba lagi.");
        return;
      }
      navigate("/penghuni/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Aktivasi Akun"
      subtitle={
        step === "kode"
          ? "Masukkan No HP dan kode undangan yang dikirim admin lewat WhatsApp."
          : step === "otp"
          ? `Kode OTP udah dikirim ke ${phone}. Cek WhatsApp lo.`
          : `Buat password baru untuk ${emailForRecovery}.`
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      {step === "kode" && (
        <form onSubmit={handleVerifyInvite}>
          <div className="field">
            <label htmlFor="phone">No HP</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="081234567890" />
          </div>
          <div className="field">
            <label htmlFor="inviteCode">Kode Undangan (6 digit)</label>
            <input
              id="inviteCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : "Kirim OTP"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp}>
          <div className="field">
            <label htmlFor="otp">Kode OTP (6 digit)</label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : "Verifikasi"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handleSetPassword}>
          <div className="field">
            <label htmlFor="newPassword">Password Baru</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Konfirmasi Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password"
            />
          </div>
          <PrivacyConsent policy={privacyPolicy} checked={privacyAgreed} onChange={setPrivacyAgreed} />
          <button className="btn btn-primary" type="submit" disabled={loading || !privacyAgreed}>
            {loading ? <span className="spinner" /> : "Aktifkan Akun"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
