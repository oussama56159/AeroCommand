import { create } from 'zustand';

const MAX_HISTORY_POINTS = 200;
const HISTORY_SAMPLE_MS = 250;

function normalizeTelemetry(data) {
  const gps = data?.gps || {};
  const position = data?.position || {};
  const attitude = data?.attitude || {};
  const system = data?.system || {};
  const lat = position.lat ?? gps.lat ?? null;
  const lng = position.lng ?? gps.lng ?? null;
  const alt = position.alt ?? gps.alt ?? null;
  const speed = data?.speed ?? data?.groundspeed ?? data?.airspeed ?? 0;

  return {
    ...data,
    position: {
      lat,
      lng,
      alt,
    },
    gps: {
      ...gps,
      lat: gps.lat ?? lat,
      lng: gps.lng ?? lng,
      alt: gps.alt ?? alt,
    },
    altitude: data?.altitude ?? alt ?? 0,
    lat,
    lng,
    alt,
    speed,
    groundspeed: data?.groundspeed ?? speed ?? 0,
    airspeed: data?.airspeed ?? speed ?? 0,
    climb_rate: data?.climb_rate ?? data?.vertical_speed ?? 0,
    vertical_speed: data?.vertical_speed ?? data?.climb_rate ?? 0,
    heading: data?.heading ?? attitude.yaw ?? 0,
    roll: data?.roll ?? attitude.roll ?? 0,
    pitch: data?.pitch ?? attitude.pitch ?? 0,
    yaw: data?.yaw ?? attitude.yaw ?? 0,
    battery: data?.battery?.remaining ?? data?.battery ?? 0,
    temperature: data?.temperature ?? data?.battery?.temperature ?? null,
    voltage: data?.battery?.voltage ?? data?.voltage ?? 0,
    current: data?.battery?.current ?? data?.current ?? 0,
    throttle: data?.throttle ?? 0,
    satellites: data?.satellites ?? gps.satellites_visible ?? 0,
    gps_fix: data?.gps_fix ?? gps.fix_type ?? 0,
    mode: data?.mode ?? system.mode ?? null,
    armed: data?.armed ?? system.armed ?? false,
    status: data?.status ?? system.status ?? null,
    signal: data?.signal ?? 0,
    health: data?.health ?? system.health ?? null,
  };
}

export const useTelemetryStore = create((set, get) => ({
  vehicleTelemetry: {},
  connectionStatus: {},
  alerts: [],
  unreadAlertCount: 0,

  updateVehicleTelemetry: (vehicleId, data) => {
    set((state) => {
      const now = Date.now();
      const normalized = normalizeTelemetry(data);
      const existing = state.vehicleTelemetry[vehicleId] || { history: [], historyLastSampleAt: 0 };

      const lastSampleAt = Number(existing.historyLastSampleAt) || 0;
      const shouldSample = now - lastSampleAt >= HISTORY_SAMPLE_MS;

      let nextHistory = existing.history || [];
      let nextHistoryLastSampleAt = lastSampleAt;
      if (shouldSample) {
        nextHistory = [...nextHistory, { ...normalized, timestamp: now }];
        if (nextHistory.length > MAX_HISTORY_POINTS) nextHistory.shift();
        nextHistoryLastSampleAt = now;
      }

      return {
        vehicleTelemetry: {
          ...state.vehicleTelemetry,
          [vehicleId]: {
            ...existing,
            ...normalized,
            history: nextHistory,
            historyLastSampleAt: nextHistoryLastSampleAt,
            lastUpdate: now,
          },
        },
      };
    });
  },

  setConnectionStatus: (vehicleId, status) => {
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [vehicleId]: status },
    }));
  },

  addAlert: (alert) => {
    set((state) => ({
      alerts: [{ ...alert, id: alert.id || crypto.randomUUID(), receivedAt: Date.now() }, ...state.alerts].slice(0, 500),
      unreadAlertCount: state.unreadAlertCount + 1,
    }));
  },

  acknowledgeAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)),
      unreadAlertCount: Math.max(0, state.unreadAlertCount - 1),
    }));
  },

  dismissAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== alertId),
    }));
  },

  clearAllAlerts: () => set({ alerts: [], unreadAlertCount: 0 }),

  markAllRead: () => set({ unreadAlertCount: 0 }),

  getVehicleTelemetry: (vehicleId) => get().vehicleTelemetry[vehicleId] || null,

  getConnectionStatus: (vehicleId) => get().connectionStatus[vehicleId] || 'disconnected',

  getCriticalAlerts: () => get().alerts.filter((a) => a.severity === 'critical' && !a.acknowledged),
}));

