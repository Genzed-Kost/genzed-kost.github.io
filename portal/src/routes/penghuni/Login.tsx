import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/AuthLayout";
import { supabase, functionsUrl } from "../../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
      const from = (location.state as { from?: string } | null)?.from;
      const home = profile?.role === "admin" ? "/admin" : "/penghuni/dashboard";
      // Balik ke halaman tujuan awal kalau masih wilayah role-nya (mis. /penghuni/testimoni).
      const allowed = profile?.role === "admin" ? from?.startsWith("/admin") : from?.startsWith("/penghuni/");
      navigate(allowed && from ? from : home);
    } catch {
      setError("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Login Penghuni" subtitle="Masuk buat cek tagihan, bayar, dan pantau kontrak kost lo.">
      {error && <div className="alert alert-error">{error}</div>}

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

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <Link className="btn-link" to="/penghuni/lupa-password">Lupa password?</Link>
      </div>

      <p style={{ marginTop: 24, fontSize: ".82rem", color: "var(--muted)" }}>
        Belum punya akun? Penghuni baru diaktifkan lewat kode undangan dari admin.{" "}
        <Link className="btn-link" to="/penghuni/aktivasi">Aktivasi akun</Link>
      </p>
    </AuthLayout>
  );
}
