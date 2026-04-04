import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { Select } from '@/components/ui/Input';
import { useFleetStore } from '@/stores/fleetStore';
import { useMissionStore } from '@/stores/missionStore';
import { useTelemetryStore } from '@/stores/telemetryStore';

const ENVIRONMENTS = [
  { value: 'farm', label: 'Farm' },
  { value: 'city', label: 'City' },
  { value: 'forest', label: 'Forest' },
];

const CONTROL_MODES = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Auto' },
];

const UNIT_METERS = 10; // 1 world unit = 10 meters (keeps waypoint deltas manageable)
const METERS_PER_DEG_LAT = 111_320;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function formatNum(v, digits = 2) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function radiansToDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function degreesToRadians(deg) {
  return (deg * Math.PI) / 180;
}

function computeMetersPerDegLon(latDeg) {
  const latRad = degreesToRadians(latDeg);
  return METERS_PER_DEG_LAT * Math.cos(latRad);
}

function buildMissionPathPoints(mission, originLatLng) {
  const waypoints = mission?.waypoints || [];
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];

  const originLat = Number(originLatLng?.lat) || Number(waypoints[0]?.lat) || 0;
  const originLng = Number(originLatLng?.lng) || Number(waypoints[0]?.lng) || 0;
  const metersPerDegLon = computeMetersPerDegLon(originLat);

  return waypoints
    .filter((wp) => Number.isFinite(Number(wp?.lat)) && Number.isFinite(Number(wp?.lng)))
    .sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0))
    .map((wp) => {
      const dLatM = (Number(wp.lat) - originLat) * METERS_PER_DEG_LAT;
      const dLonM = (Number(wp.lng) - originLng) * metersPerDegLon;
      const altM = Number(wp?.alt ?? wp?.altitude ?? 50);
      return {
        x: dLonM / UNIT_METERS,
        y: altM / UNIT_METERS,
        z: dLatM / UNIT_METERS,
      };
    });
}

function EnvironmentFarm() {
  return (
    <group>
      {/* Barns */}
      <mesh position={[-10, 1.5, -8]} castShadow>
        <boxGeometry args={[6, 3, 5]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[-10, 3.4, -8]} castShadow>
        <coneGeometry args={[3.5, 2, 4]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Crop rows (very low poly) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`row-${i}`} position={[8, 0.25, -18 + i * 5]} receiveShadow>
          <boxGeometry args={[18, 0.5, 1.2]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      ))}

      {/* Hay bales */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={`bale-${i}`} position={[-2 + i * 2.8, 0.6, 14]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 1.2, 12]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
    </group>
  );
}

function EnvironmentCity() {
  const buildings = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => {
      const x = -18 + (i % 6) * 6;
      const z = -18 + Math.floor(i / 6) * 8;
      const h = 2 + (i % 5) * 2.2;
      return { x, z, h };
    });
  }, []);

  return (
    <group>
      {buildings.map((b, i) => (
        <mesh key={`b-${i}`} position={[b.x, b.h / 2, b.z]} castShadow>
          <boxGeometry args={[3.5, b.h, 3.5]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
      {/* Road strips */}
      <mesh position={[0, 0.02, -2]} receiveShadow>
        <boxGeometry args={[42, 0.04, 4]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>
      <mesh position={[0, 0.02, 10]} receiveShadow>
        <boxGeometry args={[42, 0.04, 4]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>
      <mesh position={[-6, 0.02, 4]} receiveShadow>
        <boxGeometry args={[4, 0.04, 44]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>
      <mesh position={[8, 0.02, 4]} receiveShadow>
        <boxGeometry args={[4, 0.04, 44]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>
    </group>
  );
}

function EnvironmentForest() {
  const trees = useMemo(() => {
    const points = [];
    for (let i = 0; i < 40; i++) {
      const x = -22 + (i * 7) % 44;
      const z = -22 + ((i * 11) % 44);
      const h = 2.8 + (i % 5) * 0.7;
      points.push({ x, z, h });
    }
    return points;
  }, []);

  return (
    <group>
      {trees.map((t, i) => (
        <group key={`t-${i}`} position={[t.x, 0, t.z]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 1.8, 10]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 2.0, 0]} castShadow>
            <coneGeometry args={[1.3, t.h, 10]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ground({ environment }) {
  const groundColor = environment === 'city' ? '#0f172a' : '#0b1220';
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color={groundColor} />
    </mesh>
  );
}

function VehicleModel({ vehicleType }) {
  const isRover = String(vehicleType || '').toLowerCase() === 'rover';
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[isRover ? 1.6 : 1.2, isRover ? 0.5 : 0.35, isRover ? 2.2 : 1.2]} />
        <meshStandardMaterial color="#60a5fa" />
      </mesh>
      <mesh position={[0, 0.35, 0.65]} castShadow>
        <coneGeometry args={[0.35, 0.75, 14]} />
        <meshStandardMaterial color="#93c5fd" />
      </mesh>
      {!isRover && (
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.8, 0.08, 0.18]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      )}
    </group>
  );
}

function VehicleActor({ vehicleType, simRef }) {
  const meshRef = useRef(null);

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const { position, yawRad } = simRef.current;
    m.position.set(position.x, position.y, position.z);
    m.rotation.set(0, yawRad, 0);
  });

  return (
    <group ref={meshRef}>
      <VehicleModel vehicleType={vehicleType} />
    </group>
  );
}

function SimulationController({ simRef, controlsRef, pathRef, isRunning, controlMode, onTelemetryTick }) {
  const telemetryAccumulatorRef = useRef(0);

  useFrame((_, delta) => {
    if (!isRunning) return;

    const sim = simRef.current;
    const dt = clamp(delta, 0, 0.05);

    if (controlMode === 'auto') {
      const path = pathRef.current;
      if (Array.isArray(path) && path.length > 0) {
        const idx = sim.auto.targetIndex;
        const target = path[idx] || path[path.length - 1];

        const dx = target.x - sim.position.x;
        const dy = target.y - sim.position.y;
        const dz = target.z - sim.position.z;

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const arriveDist = 0.6;

        if (dist < arriveDist) {
          const next = idx + 1;
          if (next < path.length) {
            sim.auto.targetIndex = next;
          } else {
            sim.velocity.x = 0;
            sim.velocity.y = 0;
            sim.velocity.z = 0;
            sim.auto.completed = true;
          }
        } else {
          const speedUnitsPerSec = sim.params.autoSpeedMps / UNIT_METERS;
          const ux = dx / dist;
          const uy = dy / dist;
          const uz = dz / dist;
          sim.velocity.x = ux * speedUnitsPerSec;
          sim.velocity.y = uy * speedUnitsPerSec;
          sim.velocity.z = uz * speedUnitsPerSec;
          sim.yawRad = Math.atan2(sim.velocity.x, sim.velocity.z);
        }
      }
    } else {
      const keys = controlsRef.current;
      const accelUnits = sim.params.manualAccelMps2 / UNIT_METERS;
      const maxSpeedUnits = sim.params.manualMaxSpeedMps / UNIT_METERS;

      let ax = 0;
      let ay = 0;
      let az = 0;

      if (keys.forward) az += 1;
      if (keys.back) az -= 1;
      if (keys.left) ax -= 1;
      if (keys.right) ax += 1;
      if (keys.up) ay += 1;
      if (keys.down) ay -= 1;

      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len > 0) {
        ax /= len;
        ay /= len;
        az /= len;
      }

      sim.velocity.x += ax * accelUnits * dt;
      sim.velocity.y += ay * accelUnits * dt;
      sim.velocity.z += az * accelUnits * dt;

      // Simple drag
      const drag = Math.exp(-sim.params.drag * dt);
      sim.velocity.x *= drag;
      sim.velocity.y *= drag;
      sim.velocity.z *= drag;

      // Clamp speed
      const speed = Math.sqrt(sim.velocity.x ** 2 + sim.velocity.y ** 2 + sim.velocity.z ** 2);
      if (speed > maxSpeedUnits && speed > 0) {
        const s = maxSpeedUnits / speed;
        sim.velocity.x *= s;
        sim.velocity.y *= s;
        sim.velocity.z *= s;
      }

      if (speed > 0.01) {
        sim.yawRad = Math.atan2(sim.velocity.x, sim.velocity.z);
      }
    }

    // Integrate
    sim.position.x += sim.velocity.x * dt;
    sim.position.y = Math.max(0, sim.position.y + sim.velocity.y * dt);
    sim.position.z += sim.velocity.z * dt;

    // Telemetry tick
    telemetryAccumulatorRef.current += dt;
    const period = 1 / sim.params.updateHz;
    if (telemetryAccumulatorRef.current >= period) {
      telemetryAccumulatorRef.current = telemetryAccumulatorRef.current % period;
      onTelemetryTick();
    }
  });

  useEffect(() => {
    // Reset auto completion when switching mode
    simRef.current.auto.completed = false;
  }, [controlMode, simRef]);

  return null;
}

export default function DroneSimulation3DPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const fetchVehicles = useFleetStore((s) => s.fetchVehicles);
  const missions = useMissionStore((s) => s.missions);
  const fetchMissions = useMissionStore((s) => s.fetchMissions);

  const telemetryByVehicle = useTelemetryStore((s) => s.vehicleTelemetry);
  const connectionStatus = useTelemetryStore((s) => s.connectionStatus);
  const updateVehicleTelemetry = useTelemetryStore((s) => s.updateVehicleTelemetry);
  const setConnectionStatus = useTelemetryStore((s) => s.setConnectionStatus);

  const [environment, setEnvironment] = useState('farm');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [controlMode, setControlMode] = useState('manual');
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [autoProgress, setAutoProgress] = useState(null);

  const controlsRef = useRef({ forward: false, back: false, left: false, right: false, up: false, down: false });
  const pathRef = useRef([]);

  const simRef = useRef({
    position: { x: 0, y: 4, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yawRad: 0,
    origin: { lat: 0, lng: 0 },
    battery: 100,
    elapsedSec: 0,
    params: {
      updateHz: 5,
      manualAccelMps2: 18,
      manualMaxSpeedMps: 25,
      autoSpeedMps: 10,
      drag: 2.4,
    },
    auto: { targetIndex: 0, completed: false },
  });

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) || null,
    [missions, selectedMissionId]
  );

  const telemetry = selectedVehicleId ? telemetryByVehicle[selectedVehicleId] : null;

  useEffect(() => {
    fetchVehicles();
    fetchMissions();
  }, [fetchVehicles, fetchMissions]);

  useEffect(() => {
    if (selectedVehicleId) return;
    const preferred = vehicles.find((v) => v.status !== 'offline')?.id || vehicles[0]?.id || '';
    if (!preferred) return;
    const t = setTimeout(() => setSelectedVehicleId(preferred), 0);
    return () => clearTimeout(t);
  }, [vehicles, selectedVehicleId]);

  useEffect(() => {
    const onKey = (e, isDown) => {
      const k = e.key.toLowerCase();
      const c = controlsRef.current;
      if (k === 'w' || k === 'arrowup') c.forward = isDown;
      if (k === 's' || k === 'arrowdown') c.back = isDown;
      if (k === 'a' || k === 'arrowleft') c.left = isDown;
      if (k === 'd' || k === 'arrowright') c.right = isDown;
      if (k === 'q') c.down = isDown;
      if (k === 'e') c.up = isDown;
    };

    const down = (e) => onKey(e, true);
    const up = (e) => onKey(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const vehicleOptions = useMemo(() => {
    const opts = vehicles.map((v) => ({ value: v.id, label: `${v.name} (${v.callsign || v.type})` }));
    if (opts.length === 0) return [{ value: '', label: 'No vehicles available' }];
    return [{ value: '', label: 'Select vehicle…' }, ...opts];
  }, [vehicles]);

  const missionOptions = useMemo(() => {
    const opts = missions.map((m) => ({ value: m.id, label: m.name || m.id }));
    return [{ value: '', label: 'No mission selected' }, ...opts];
  }, [missions]);

  const spawnVehicle = useCallback(() => {
    if (!selectedVehicleId) return;

    const v = vehicles.find((vv) => vv.id === selectedVehicleId);
    const t = telemetryByVehicle[selectedVehicleId];

    const originLat = Number(t?.position?.lat ?? v?.position?.lat ?? v?.latitude ?? 0);
    const originLng = Number(t?.position?.lng ?? v?.position?.lng ?? v?.longitude ?? 0);

    simRef.current.origin = { lat: originLat, lng: originLng };
    simRef.current.position = { x: 0, y: 4, z: 0 };
    simRef.current.velocity = { x: 0, y: 0, z: 0 };
    simRef.current.yawRad = 0;
    simRef.current.battery = clamp(Number(t?.battery ?? v?.battery ?? 100), 0, 100);
    simRef.current.elapsedSec = 0;
    simRef.current.auto = { targetIndex: 0, completed: false };

    if (selectedMissionId) {
      pathRef.current = buildMissionPathPoints(selectedMission, simRef.current.origin);
    } else {
      pathRef.current = [];
    }

    // Prime telemetry so the UI updates immediately
    const metersPerDegLon = computeMetersPerDegLon(originLat);
    updateVehicleTelemetry(selectedVehicleId, {
      position: { lat: originLat, lng: originLng, alt: simRef.current.position.y * UNIT_METERS },
      altitude: simRef.current.position.y * UNIT_METERS,
      groundspeed: 0,
      heading: 0,
      battery: simRef.current.battery,
      satellites: 12,
      mode: controlMode === 'auto' ? 'AUTO' : 'MANUAL',
      armed: true,
      voltage: 15.8,
      current: 4.2,
      climb_rate: 0,
      airspeed: 0,
      meters_per_deg_lon: metersPerDegLon,
    });
  }, [selectedVehicleId, selectedMissionId, selectedMission, vehicles, telemetryByVehicle, updateVehicleTelemetry, controlMode]);

  useEffect(() => {
    // Update mission path when selected mission changes.
    if (!selectedMissionId) {
      pathRef.current = [];
      return;
    }
    pathRef.current = buildMissionPathPoints(selectedMission, simRef.current.origin);
    simRef.current.auto.targetIndex = 0;
    simRef.current.auto.completed = false;
  }, [selectedMissionId, selectedMission]);

  const startSimulation = useCallback(() => {
    if (!selectedVehicleId) return;
    setConnectionStatus(selectedVehicleId, 'connected');
    setIsRunning(true);
  }, [selectedVehicleId, setConnectionStatus]);

  const stopSimulation = useCallback(() => {
    if (!selectedVehicleId) return;
    simRef.current.velocity = { x: 0, y: 0, z: 0 };
    setIsRunning(false);
    setConnectionStatus(selectedVehicleId, 'disconnected');
  }, [selectedVehicleId, setConnectionStatus]);

  const onTelemetryTick = useCallback(() => {
    if (!selectedVehicleId) return;

    const sim = simRef.current;
    sim.elapsedSec += 1 / sim.params.updateHz;

    const originLat = Number(sim.origin.lat) || 0;
    const originLng = Number(sim.origin.lng) || 0;
    const metersPerDegLon = computeMetersPerDegLon(originLat);

    const lat = originLat + (sim.position.z * UNIT_METERS) / METERS_PER_DEG_LAT;
    const lng = originLng + (sim.position.x * UNIT_METERS) / metersPerDegLon;
    const alt = sim.position.y * UNIT_METERS;

    const speedUnits = Math.sqrt(sim.velocity.x ** 2 + sim.velocity.y ** 2 + sim.velocity.z ** 2);
    const groundspeed = speedUnits * UNIT_METERS;

    const climbRate = sim.velocity.y * UNIT_METERS;
    const headingDeg = (radiansToDegrees(sim.yawRad) + 360) % 360;

    // Battery drain: modest, capped.
    if (isRunning) {
      sim.battery = clamp(sim.battery - 0.01, 0, 100);
    }

    const voltage = 14.5 + (sim.battery / 100) * 2.0;
    const current = 3.5 + Math.min(12, groundspeed) * 0.15;

    updateVehicleTelemetry(selectedVehicleId, {
      position: { lat, lng, alt },
      latitude: lat,
      longitude: lng,
      altitude: alt,
      groundspeed,
      airspeed: groundspeed,
      heading: headingDeg,
      climb_rate: climbRate,
      battery: sim.battery,
      satellites: 12,
      mode: controlMode === 'auto' ? 'AUTO' : 'MANUAL',
      armed: true,
      voltage,
      current,
    });

    if (controlMode === 'auto') {
      const path = pathRef.current;
      const total = Array.isArray(path) ? path.length : 0;
      const current = sim.auto.targetIndex;
      const completed = sim.auto.completed;
      const percent = total === 0 ? 0 : (completed ? 100 : Math.round((current / Math.max(1, total - 1)) * 100));
      setAutoProgress({ current, total, percent, completed });
    } else {
      setAutoProgress(null);
    }
  }, [selectedVehicleId, updateVehicleTelemetry, isRunning, controlMode]);

  const wsStatus = selectedVehicleId ? (connectionStatus[selectedVehicleId] || 'disconnected') : 'disconnected';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">3D Simulation</h1>
          <p className="text-sm text-slate-400 mt-1">Simulate a vehicle in a 3D environment and stream telemetry into the dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={isRunning ? 'green' : 'gray'}>{isRunning ? 'Running' : 'Stopped'}</Badge>
          {selectedVehicleId && (
            <div className="flex items-center gap-2">
              <StatusIndicator status={wsStatus} size="sm" />
              <span className="text-xs text-slate-400">Telemetry</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle subtitle="Environment, vehicle, mode, and mission">Simulation Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                label="Environment"
                value={environment}
                options={ENVIRONMENTS}
                onChange={(e) => setEnvironment(e.target.value)}
                disabled={isRunning}
              />
              <Select
                label="Vehicle"
                value={selectedVehicleId}
                options={vehicleOptions}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (isRunning) stopSimulation();
                  setSelectedVehicleId(nextId);
                }}
              />
              <Select
                label="Control Mode"
                value={controlMode}
                options={CONTROL_MODES}
                onChange={(e) => setControlMode(e.target.value)}
                disabled={isRunning}
              />
              <Select
                label="Mission (Auto mode)"
                value={selectedMissionId}
                options={missionOptions}
                onChange={(e) => setSelectedMissionId(e.target.value)}
                disabled={isRunning || controlMode !== 'auto'}
              />

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="secondary" onClick={spawnVehicle} disabled={!selectedVehicleId || isRunning}>
                  Spawn
                </Button>
                {!isRunning ? (
                  <Button onClick={startSimulation} disabled={!selectedVehicleId}>
                    Start
                  </Button>
                ) : (
                  <Button variant="danger" onClick={stopSimulation}>
                    Stop
                  </Button>
                )}
              </div>

              {controlMode === 'manual' && (
                <div className="text-xs text-slate-500">
                  Manual controls: <span className="text-slate-400">W/A/S/D</span> move, <span className="text-slate-400">E/Q</span> up/down.
                </div>
              )}

              {controlMode === 'auto' && (
                <div className="text-xs text-slate-500">
                  Auto mode follows the selected mission waypoints (if provided).
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle subtitle="Live simulated values">Telemetry</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedVehicleId && (
                <div className="text-sm text-slate-400">Select a vehicle to see telemetry.</div>
              )}

              {selectedVehicleId && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'LAT', value: telemetry?.position?.lat ?? telemetry?.latitude, digits: 5 },
                    { label: 'LNG', value: telemetry?.position?.lng ?? telemetry?.longitude, digits: 5 },
                    { label: 'ALT (m)', value: telemetry?.altitude, digits: 1 },
                    { label: 'SPD (m/s)', value: telemetry?.groundspeed, digits: 1 },
                    { label: 'HDG (°)', value: telemetry?.heading, digits: 0 },
                    { label: 'BAT (%)', value: telemetry?.battery, digits: 0 },
                    { label: 'MODE', value: telemetry?.mode ?? (controlMode === 'auto' ? 'AUTO' : 'MANUAL'), raw: true },
                    { label: 'ARMED', value: telemetry?.armed ? 'Yes' : 'No', raw: true },
                  ].map((item) => (
                    <div key={item.label} className="bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {item.raw ? (item.value ?? '—') : formatNum(item.value, item.digits)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {controlMode === 'auto' && selectedMissionId && autoProgress && (
                <div className="mt-4 bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Mission Progress</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {autoProgress.completed ? 'Completed' : `Waypoint ${autoProgress.current + 1} / ${autoProgress.total}`}
                      </div>
                    </div>
                    <Badge color={autoProgress.completed ? 'green' : 'gray'}>{autoProgress.percent}%</Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="h-[70vh] xl:h-[calc(100vh-220px)] w-full">
            <Canvas
              dpr={[1, 1.5]}
              frameloop={isRunning ? 'always' : 'demand'}
              shadows={isRunning}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              camera={{ position: [20, 16, 20], fov: 50, near: 0.1, far: 500 }}
            >
              <ambientLight intensity={0.55} />
              <directionalLight
                position={[25, 30, 10]}
                intensity={1.1}
                castShadow={isRunning}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />

              <Ground environment={environment} />
              <Grid
                position={[0, 0.01, 0]}
                args={[100, 100]}
                cellSize={2}
                cellThickness={0.6}
                cellColor="#1f2937"
                sectionSize={10}
                sectionThickness={1.2}
                sectionColor="#334155"
                fadeDistance={70}
                fadeStrength={1}
                infiniteGrid
              />

              {environment === 'farm' && <EnvironmentFarm />}
              {environment === 'city' && <EnvironmentCity />}
              {environment === 'forest' && <EnvironmentForest />}

              {selectedVehicleId && (
                <VehicleActor vehicleType={selectedVehicle?.type} simRef={simRef} />
              )}

              <SimulationController
                simRef={simRef}
                controlsRef={controlsRef}
                pathRef={pathRef}
                isRunning={isRunning}
                controlMode={controlMode}
                onTelemetryTick={onTelemetryTick}
              />

              <OrbitControls enableDamping={isRunning} dampingFactor={0.08} maxPolarAngle={Math.PI / 2.05} />
            </Canvas>
          </div>
        </Card>
      </div>
    </div>
  );
}
