import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PortalLayout } from "./components/PortalLayout";
import { AdminLayout } from "./components/AdminLayout";
import Login from "./routes/penghuni/Login";
import Aktivasi from "./routes/penghuni/Aktivasi";
import LupaPassword from "./routes/penghuni/LupaPassword";
import ResetPassword from "./routes/penghuni/ResetPassword";
import Dashboard from "./routes/penghuni/Dashboard";
import Tagihan from "./routes/penghuni/Tagihan";
import Bayar from "./routes/penghuni/Bayar";
import RiwayatBayar from "./routes/penghuni/RiwayatBayar";
import Komplain from "./routes/penghuni/Komplain";
import Dokumen from "./routes/penghuni/Dokumen";
import Profil from "./routes/penghuni/Profil";
import AdminDashboard from "./routes/admin/Dashboard";
import VerifikasiPembayaran from "./routes/admin/VerifikasiPembayaran";
import AdminPenghuni from "./routes/admin/Penghuni";
import Kontrak from "./routes/admin/Kontrak";
import Kamar from "./routes/admin/Kamar";
import AdminKomplain from "./routes/admin/Komplain";
import AdminDokumen from "./routes/admin/Dokumen";
import AdminVoucher from "./routes/admin/Voucher";
import Pengaturan from "./routes/admin/Pengaturan";
import LandingPageSettings from "./routes/admin/LandingPage";
import AuditLog from "./routes/admin/AuditLog";
import PublikBayar from "./routes/PublikBayar";
import NotFoundPortal from "./routes/NotFoundPortal";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/penghuni/login" replace />} />

          <Route path="/penghuni/login" element={<Login />} />
          <Route path="/penghuni/aktivasi" element={<Aktivasi />} />
          <Route path="/penghuni/lupa-password" element={<LupaPassword />} />
          <Route path="/penghuni/reset-password" element={<ResetPassword />} />
          <Route path="/bayar/publik/:token" element={<PublikBayar />} />

          <Route element={<ProtectedRoute requireRole="penghuni" />}>
            <Route element={<PortalLayout />}>
              <Route path="/penghuni/dashboard" element={<Dashboard />} />
              <Route path="/penghuni/tagihan" element={<Tagihan />} />
              <Route path="/penghuni/bayar" element={<Bayar />} />
              <Route path="/penghuni/riwayat-bayar" element={<RiwayatBayar />} />
              <Route path="/penghuni/komplain" element={<Komplain />} />
              <Route path="/penghuni/dokumen" element={<Dokumen />} />
              <Route path="/penghuni/profil" element={<Profil />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requireRole="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/verifikasi" element={<VerifikasiPembayaran />} />
              <Route path="/admin/penghuni" element={<AdminPenghuni />} />
              <Route path="/admin/kontrak" element={<Kontrak />} />
              <Route path="/admin/kamar" element={<Kamar />} />
              <Route path="/admin/komplain" element={<AdminKomplain />} />
              <Route path="/admin/dokumen" element={<AdminDokumen />} />
              <Route path="/admin/voucher" element={<AdminVoucher />} />
              <Route path="/admin/pengaturan" element={<Pengaturan />} />
              <Route path="/admin/landing" element={<LandingPageSettings />} />
              <Route path="/admin/audit-log" element={<AuditLog />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPortal />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
