import { Outlet } from 'react-router-dom';
import { Suspense, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import Sidebar from './Sidebar';
import Header from './Header';
import ToastContainer from '@/components/ui/Toast';
import CommandConfirmModal from '@/components/shared/CommandConfirmModal';
import ActionConfirmModal from '@/components/shared/ActionConfirmModal';
import ActionDetailsModal from '@/components/shared/ActionDetailsModal';
import { PageLoader } from '@/components/ui/Spinner';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useFleetStore } from '@/stores/fleetStore';
import { useMissionStore } from '@/stores/missionStore';
import { useAlertStream, useFleetTelemetryStream } from '@/lib/websocket/useTelemetryStream';

const MOCK_MODE_KEY = 'aero_mock_mode';

const isMockMode = () => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(MOCK_MODE_KEY);
  if (stored !== null) return stored === 'true';
  return import.meta.env.VITE_MOCK_MODE === 'true';
};

export default function MainLayout() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const vehicles = useFleetStore((s) => s.vehicles);
  const fetchVehicles = useFleetStore((s) => s.fetchVehicles);
  const fetchFleets = useFleetStore((s) => s.fetchFleets);
  const fetchMissions = useMissionStore((s) => s.fetchMissions);

  const vehicleIds = useMemo(() => vehicles.map((v) => v.id), [vehicles]);

  useFleetTelemetryStream(vehicleIds);
  useAlertStream();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isMockMode()) return;
    fetchVehicles();
    fetchFleets();
    fetchMissions();
  }, [fetchVehicles, fetchFleets, fetchMissions, isAuthenticated]);

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />
      <div className={clsx('transition-all duration-300', collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]')}>
        <Header />
        <main className="p-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <ToastContainer />
      <CommandConfirmModal />
      <ActionConfirmModal />
      <ActionDetailsModal />
    </div>
  );
}

