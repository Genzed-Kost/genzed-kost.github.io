import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const MENU = [
  { to: "/penghuni/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/penghuni/tagihan", label: "Tagihan", icon: "🧾" },
  { to: "/penghuni/bayar", label: "Bayar", icon: "💸" },
  { to: "/penghuni/riwayat-bayar", label: "Riwayat Bayar", icon: "💳" },
  { to: "/penghuni/komplain", label: "Komplain", icon: "🛠️" },
  { to: "/penghuni/ai-kost", label: "AI Kost", icon: "🤖" },
  { to: "/penghuni/dokumen", label: "Dokumen", icon: "📁" },
  { to: "/penghuni/profil", label: "Profil", icon: "👤" },
];

export function PortalLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/penghuni/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100svh" }}>
      <aside
        style={{
          width: 240,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "sticky",
          top: 0,
          height: "100svh",
        }}
        className="portal-sidebar"
      >
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", marginBottom: 28, padding: "0 8px" }}>
          <img src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>
            Genz<span style={{ color: "var(--accent)" }}>ed</span>
          </span>
        </a>
        {MENU.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: ".88rem",
              fontWeight: 600,
              textDecoration: "none",
              color: isActive ? "var(--accent)" : "var(--muted)",
              background: isActive ? "rgba(192,132,252,.12)" : "transparent",
            })}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </NavLink>
        ))}
        <button
          className="btn-link"
          style={{ marginTop: "auto", textAlign: "left", padding: "10px 12px" }}
          onClick={handleLogout}
        >
          🚪 Keluar
        </button>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          className="portal-topbar"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 5vw",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
            Genz<span style={{ color: "var(--accent)" }}>ed</span>
          </span>
          <button className="btn-link" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? "✕ Tutup" : "☰ Menu"}
          </button>
        </header>

        <div style={{ padding: "8px 5vw 12px", borderBottom: "1px solid var(--border)", fontSize: ".8rem", color: "var(--muted)" }}>
          Masuk sebagai <strong style={{ color: "var(--text)" }}>{profile?.full_name}</strong>
        </div>

        <main>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .portal-sidebar { display: ${menuOpen ? "flex" : "none"} !important; position: fixed !important; z-index: 20; width: 78vw !important; max-width: 280px; box-shadow: 0 0 40px rgba(0,0,0,.5); }
          .portal-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
