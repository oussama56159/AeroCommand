const STATUS_ORDER = [
  'in_flight',
  'online',
  'idle',
  'armed',
  'disarmed',
  'landing',
  'maintenance',
  'charging',
  'offline',
  'emergency',
];

const STATUS_COLORS = {
  in_flight: '#3b82f6',
  online: '#22c55e',
  idle: '#22c55e',
  armed: '#8b5cf6',
  disarmed: '#06b6d4',
  landing: '#f59e0b',
  maintenance: '#f97316',
  charging: '#14b8a6',
  offline: '#64748b',
  emergency: '#ef4444',
};

const CONNECTION_ORDER = ['connected', 'connecting', 'disconnected', 'error'];

const CONNECTION_COLORS = {
  connected: '#22c55e',
  connecting: '#3b82f6',
  disconnected: '#64748b',
  error: '#ef4444',
};

function prettyLabel(value) {
  return String(value || 'unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAge(ms) {
  if (ms <= 0) return 'now';
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s ago`;
  if (seconds === 0) return `${minutes}m ago`;
  return `${minutes}m ${seconds}s ago`;
}

export function buildLiveOpsMetrics({
  vehicles = [],
  missions = [],
  alerts = [],
  telemetryByVehicle = {},
  connectionStatus = {},
} = {}) {
  const telemetryEntries = Object.values(telemetryByVehicle || {});

  let batteryTotal = 0;
  let batteryCount = 0;
  let telemetrySampleCount = 0;
  let recentlyUpdatedCount = 0;

  const statusCounts = new Map();
  const connectionCounts = new Map();

  const batterySeries = vehicles.map((vehicle) => {
    const telemetry = telemetryByVehicle[vehicle.id] || {};
    const history = Array.isArray(telemetry.history) ? telemetry.history : [];
    const battery = Number(telemetry.battery ?? vehicle.battery ?? 0);
    const connection = connectionStatus[vehicle.id] || 'disconnected';
    const lastUpdate = Number(telemetry.lastUpdate || 0);

    batteryTotal += Number.isFinite(battery) ? battery : 0;
    batteryCount += Number.isFinite(battery) ? 1 : 0;
    telemetrySampleCount += history.length;
    if (lastUpdate && Date.now() - lastUpdate <= 15_000) {
      recentlyUpdatedCount += 1;
    }

    statusCounts.set(vehicle.status, (statusCounts.get(vehicle.status) || 0) + 1);
    connectionCounts.set(connection, (connectionCounts.get(connection) || 0) + 1);

    return {
      name: vehicle.callsign || vehicle.name || prettyLabel(vehicle.id).slice(0, 12),
      battery: Math.round(Number.isFinite(battery) ? battery : 0),
      samples: history.length,
      status: vehicle.status || 'offline',
      connection,
      lastUpdate,
    };
  });

  const telemetryWindowMs = 5 * 60_000;
  const bucketCount = 10;
  const bucketSizeMs = telemetryWindowMs / bucketCount;
  const now = Date.now();
  const telemetryThroughput = Array.from({ length: bucketCount }, (_, index) => {
    const ageMs = telemetryWindowMs - index * bucketSizeMs;
    return {
      label: formatAge(ageMs),
      samples: 0,
    };
  });

  for (const entry of telemetryEntries) {
    if (!entry?.history?.length) continue;
    for (const sample of entry.history) {
      const timestamp = Number(sample?.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const ageMs = now - timestamp;
      if (ageMs < 0 || ageMs > telemetryWindowMs) continue;
      const bucketFromNewest = Math.min(bucketCount - 1, Math.floor(ageMs / bucketSizeMs));
      const bucketIndex = bucketCount - 1 - bucketFromNewest;
      telemetryThroughput[bucketIndex].samples += 1;
    }
  }

  const statusDistribution = STATUS_ORDER
    .map((status) => ({
      name: prettyLabel(status),
      value: statusCounts.get(status) || 0,
      color: STATUS_COLORS[status] || '#64748b',
    }))
    .filter((entry) => entry.value > 0);

  const connectionDistribution = CONNECTION_ORDER
    .map((state) => ({
      name: prettyLabel(state),
      value: connectionCounts.get(state) || 0,
      color: CONNECTION_COLORS[state] || '#64748b',
    }))
    .filter((entry) => entry.value > 0);

  const averageBattery = batteryCount > 0 ? batteryTotal / batteryCount : 0;
  const onlineVehicles = vehicles.filter((vehicle) => vehicle.status !== 'offline').length;
  const inFlightVehicles = vehicles.filter((vehicle) => vehicle.status === 'in_flight').length;
  const totalMissions = missions.length;
  const activeMissions = missions.filter((mission) => mission.status === 'in_progress').length;
  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical' && !alert.acknowledged).length;
  const connectedVehicles = Object.values(connectionStatus || {}).filter((value) => value === 'connected').length;

  return {
    totalFleet: vehicles.length,
    totalMissions,
    onlineVehicles,
    inFlightVehicles,
    activeMissions,
    criticalAlerts,
    connectedVehicles,
    averageBattery,
    telemetrySampleCount,
    recentlyUpdatedCount,
    batterySeries,
    statusDistribution,
    connectionDistribution,
    telemetryThroughput,
  };
}