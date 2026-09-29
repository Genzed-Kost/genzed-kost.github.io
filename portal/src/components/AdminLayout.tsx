import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const MENU = [
  { to: "/admin", label: "Dashboard", icon: "📊", end: true },
  { to: "/admin/verifikasi", label: "Verifikasi Bayar", icon: "✅" },
  { to: "/admin/penghuni", label: "Penghuni", icon: "🧑‍🎓" },
  { to: "/admin/kontrak", label: "Kontrak", icon: "📄" },
  { to: "/admin/kamar", label: "Kamar & Tipe", icon: "🛏️" },
  { to: "/admin/komplain", label: "Komplain", icon: "🛠️" },
  { to: "/admin/dokumen", label: "Dokumen", icon: "📁" },
  { to: "/admin/voucher", label: "Voucher", icon: "🎟️" },
  { to: "/admin/pengaturan", label: "Pengaturan", icon: "⚙️" },
  { to: "/admin/audit-log", label: "Audit Log", icon: "📜" },
];

export function AdminLayout() {
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
        className="admin-sidebar"
        style={{
          width: 230,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          position: "sticky",
          top: 0,
          height: "100svh",
          overflowY: "auto",
        }}
      >
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", marginBottom: 24, padding: "0 8px" }}>
          <img src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1rem" }}>
            Genz<span style={{ color: "var(--accent)" }}>ed</span> <span style={{ color: "var(--muted)", fontWeight: 600 }}>Admin</span>
          </span>
        </a>
        {MENU.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 10,
              fontSize: ".85rem",
              fontWeight: 600,
              textDecoration: "none",
              color: isActive ? "var(--accent)" : "var(--muted)",
              background: isActive ? "rgba(200,240,75,.08)" : "transparent",
            })}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </NavLink>
        ))}
        <button className="btn-link" style={{ marginTop: "auto", textAlign: "left", padding: "10px 12px" }} onClick={handleLogout}>
          🚪 Keluar
        </button>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          className="admin-topbar"
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
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700 }}>Admin</span>
          <button className="btn-link" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? "✕ Tutup" : "☰ Menu"}
          </button>
        </header>

        <div style={{ padding: "8px 5vw 12px", borderBottom: "1px solid var(--border)", fontSize: ".8rem", color: "var(--muted)" }}>
          Admin: <strong style={{ color: "var(--text)" }}>{profile?.full_name}</strong>
        </div>

        <main>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .admin-sidebar { display: ${menuOpen ? "flex" : "none"} !important; position: fixed !important; z-index: 20; width: 78vw !important; max-width: 260px; box-shadow: 0 0 40px rgba(0,0,0,.5); }
          .admin-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
