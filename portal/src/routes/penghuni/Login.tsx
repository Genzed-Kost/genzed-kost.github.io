import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/AuthLayout";
import { supabase, functionsUrl } from "../../lib/supabaseClient";
import { isEmail } from "../../lib/format";

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function resolveEmail(): Promise<string | null> {
    if (isEmail(identifier)) return identifier;
    const res = await fetch(functionsUrl("resolve-identifier"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    return data.email ?? null;
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!identifier || !password) {
      setError("Email/No HP dan password wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      // Login dilewatkan lewat Edge Function (bukan signInWithPassword langsung) supaya
      // percobaan gagal bisa dibatasi (kunci sementara setelah 5x gagal dalam 15 menit).
      const res = await fetch(functionsUrl("login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        setError(data.error ?? "Email/No HP atau password salah.");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError || !sessionData.user) {
        setError("Terjadi kesalahan. Coba lagi ya.");
        return;
      }

      // Arahkan sesuai role — admin ke /admin, penghuni ke dashboard-nya sendiri.
      // Kalau langsung hardcode /penghuni/dashboard, akun admin bakal nyasar ke
      // rute yang nolak dia (requireRole="penghuni") dan bikin halaman kosong.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionData.user.id)
        .single();
      navigate(profile?.role === "admin" ? "/admin" : "/penghuni/dashboard");
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setInfo(null);
    if (!identifier) {
      setError("Isi email/No HP dulu buat kirim magic link.");
      return;
    }
    setMagicLoading(true);
    try {
      const email = await resolveEmail();
      if (!email) {
        setError("Akun tidak ditemukan.");
        return;
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({ email });
      if (otpError) {
        setError("Gagal kirim magic link. Coba lagi.");
        return;
      }
      setInfo("Link login udah dikirim ke email lo. Cek inbox (atau folder spam) ya.");
    } finally {
      setMagicLoading(false);
    }
  }

  return (
    <AuthLayout title="Login Penghuni" subtitle="Masuk buat cek tagihan, bayar, dan pantau kontrak kost lo.">
      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      <form onSubmit={handleLogin}>
        <div className="field">
          <label htmlFor="identifier">Email atau No HP</label>
          <input
            id="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="budi@email.com / 081234567890"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : "Masuk"}
        </button>
      </form>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, flexWrap: "wrap", gap: 10 }}>
        <button className="btn-link" type="button" onClick={handleMagicLink} disabled={magicLoading}>
          {magicLoading ? "Mengirim..." : "Login pakai Magic Link"}
        </button>
        <Link className="btn-link" to="/penghuni/lupa-password">Lupa password?</Link>
      </div>

      <p style={{ marginTop: 24, fontSize: ".82rem", color: "var(--muted)" }}>
        Belum punya akun? Penghuni baru diaktifkan lewat kode undangan dari admin.{" "}
        <Link className="btn-link" to="/penghuni/aktivasi">Aktivasi akun</Link>
      </p>
    </AuthLayout>
  );
}
