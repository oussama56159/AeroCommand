import { Routes, Route } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import ProtectedRoute, { PublicRoute } from '@/components/shared/ProtectedRoute';
import { ROLES } from '@/config/constants';

// Pages (lazy imports for code splitting)
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import PasswordRecoveryRequestPage from '@/pages/auth/PasswordRecoveryRequestPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import FleetPage from '@/pages/fleet/FleetPage';
import VehicleDetailPage from '@/pages/fleet/VehicleDetailPage';
import TelemetryPage from '@/pages/telemetry/TelemetryPage';
import CameraPage from '@/pages/camera/CameraPage';
import LiveMapPage from '@/pages/map/LiveMapPage';
import MissionPlannerPage from '@/pages/missions/MissionPlannerPage';
import ControlPanelPage from '@/pages/control/ControlPanelPage';
import AlertsPage from '@/pages/alerts/AlertsPage';
import AnalyticsPage from '@/pages/analytics/AnalyticsPage';
import UsersPage from '@/pages/users/UsersPage';
import AdminPage from '@/pages/admin/AdminPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import MarketingLandingPage from '@/pages/marketing/MarketingLandingPage';

function PublicNotFoundPage() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-700">404</h1>
        <p className="text-slate-400 mt-2">Page not found</p>
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm mt-4 inline-block">Return home</a>
      </div>
    </div>
  );
}

function AppNotFoundPage() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-700">404</h1>
        <p className="text-slate-400 mt-2">Page not found</p>
        <a href="/app" className="text-blue-400 hover:text-blue-300 text-sm mt-4 inline-block">Return to Dashboard</a>
      </div>
    </div>
  );
}

function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-700">403</h1>
        <p className="text-slate-400 mt-2">You don't have permission to access this page</p>
        <a href="/app" className="text-blue-400 hover:text-blue-300 text-sm mt-4 inline-block">Return to Dashboard</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<PublicRoute><MarketingLandingPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/password-recovery" element={<PublicRoute><PasswordRecoveryRequestPage /></PublicRoute>} />

      {/* Protected Routes — wrapped in MainLayout */}
      <Route path="/app" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="fleet" element={<FleetPage />} />
        <Route path="fleet/:id" element={<VehicleDetailPage />} />
        <Route path="telemetry" element={<TelemetryPage />} />
        <Route path="camera" element={<CameraPage />} />
        <Route path="map" element={<LiveMapPage />} />
        <Route path="missions" element={
          <ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PILOT, ROLES.OPERATOR]}>
            <MissionPlannerPage />
          </ProtectedRoute>
        } />
        <Route path="control" element={
          <ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PILOT]}>
            <ControlPanelPage />
          </ProtectedRoute>
        } />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="users" element={
          <ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}>
            <UsersPage />
          </ProtectedRoute>
        } />
        <Route path="admin" element={
          <ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}>
            <AdminPage />
          </ProtectedRoute>
        } />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<AppNotFoundPage />} />
      </Route>

      <Route path="*" element={<PublicNotFoundPage />} />
    </Routes>
  );
}
