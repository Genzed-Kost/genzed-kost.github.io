import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ requireRole }: { requireRole?: "admin" | "penghuni" }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}>
        <div className="spinner" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border)" }} />
      </div>
    );
  }

  if (!session) {
    // Simpan tujuan awal supaya habis login langsung balik ke halaman itu.
    return <Navigate to="/penghuni/login" replace state={{ from: location.pathname }} />;
  }

  if (requireRole && profile?.role !== requireRole) {
    // Arahkan ke home masing-masing role, BUKAN selalu ke /penghuni/dashboard —
    // kalau admin nyasar ke rute requireRole="penghuni", redirect ke situ lagi
    // bikin loop diem (Navigate ke path yang sama persis, Outlet nggak pernah
    // dirender, halaman jadi kosong selamanya).
    return <Navigate to={profile?.role === "admin" ? "/admin" : "/penghuni/dashboard"} replace />;
  }

  return <Outlet />;
}
