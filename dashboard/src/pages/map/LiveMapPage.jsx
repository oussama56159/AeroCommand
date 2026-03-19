import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2, Minimize2, Layers, Crosshair } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ActionButton from '@/components/actions/ActionButton';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { useMissionStore } from '@/stores/missionStore';
import { MAP_CONFIG } from '@/config/constants';
import { useUIStore } from '@/stores/uiStore';
import 'leaflet/dist/leaflet.css';

// Custom drone icon factory
function createDroneIcon(status, heading = 0) {
  const color = status === 'in_flight' ? '#3b82f6' : status === 'armed' ? '#ef4444' : status === 'online' ? '#22c55e' : '#64748b';
  return L.divIcon({
    className: 'custom-drone-icon',
    html: `<div style="transform:rotate(${heading}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <svg width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <!-- Arms -->
        <line x1="32" y1="32" x2="14" y2="14" stroke="rgba(255,255,255,0.95)" stroke-width="3" stroke-linecap="round" />
        <line x1="32" y1="32" x2="50" y2="14" stroke="rgba(255,255,255,0.95)" stroke-width="3" stroke-linecap="round" />
        <line x1="32" y1="32" x2="14" y2="50" stroke="rgba(255,255,255,0.95)" stroke-width="3" stroke-linecap="round" />
        <line x1="32" y1="32" x2="50" y2="50" stroke="rgba(255,255,255,0.95)" stroke-width="3" stroke-linecap="round" />

        <!-- Rotors -->
        <circle cx="14" cy="14" r="7" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2" />
        <circle cx="50" cy="14" r="7" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2" />
        <circle cx="14" cy="50" r="7" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2" />
        <circle cx="50" cy="50" r="7" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2" />

        <!-- Body -->
        <circle cx="32" cy="32" r="9" fill="${color}" stroke="rgba(15,23,42,0.9)" stroke-width="4" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2" />

        <!-- Heading nose -->
        <path d="M32 18 L27 28 L37 28 Z" fill="rgba(255,255,255,0.95)" />
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [map, positions]);
  return null;
}

function InvalidateMapSize({ trigger }) {
  const map = useMap();
  useEffect(() => {
    // Leaflet doesn't reliably detect container resizes; force it.
    const t = setTimeout(() => {
      map.invalidateSize();
    }, 50);
    return () => clearTimeout(t);
  }, [map, trigger]);
  return null;
}

function VehicleListPanel({ vehicles, selectedId, onSelect }) {
  const telemetry = useTelemetryStore((s) => s.vehicleTelemetry);
  return (
    <div className="absolute top-4 left-4 z-[1000] w-64 max-h-[calc(100vh-200px)] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-3 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200">Fleet Tracking</h3>
        <p className="text-xs text-slate-500">{vehicles.filter((v) => v.status !== 'offline').length} active</p>
      </div>
      <div className="overflow-y-auto max-h-80">
        {vehicles.map((v) => {
          const t = telemetry[v.id];
          return (
            <button key={v.id} onClick={() => onSelect(v.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 transition-colors ${selectedId === v.id ? 'bg-slate-800' : ''}`}>
              <StatusIndicator status={v.status} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{v.name}</p>
                <p className="text-[10px] text-slate-500">{Math.round(t?.battery ?? v.battery)}% • {(t?.altitude ?? 0).toFixed(0)}m</p>
              </div>
              <Badge status={v.status} className="text-[9px] px-1.5 py-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveMapPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const telemetry = useTelemetryStore((s) => s.vehicleTelemetry);
  const missions = useMissionStore((s) => s.missions);
  const mapFullscreen = useUIStore((s) => s.mapFullscreen);
  const toggleFullscreen = useUIStore((s) => s.toggleMapFullscreen);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const positions = vehicles
    .filter((v) => v.status !== 'offline')
    .map((v) => {
      const t = telemetry[v.id];
      return { ...v, lat: t?.position?.lat ?? v.position.lat, lng: t?.position?.lng ?? v.position.lng, heading: t?.heading ?? v.heading };
    });

  const activeMission = missions.find((m) => m.status === 'in_progress');
  const missionPath = activeMission?.waypoints?.map((wp) => [wp.lat, wp.lng]) || [];

  useEffect(() => {
    if (!mapFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mapFullscreen]);

  return (
    <div className={mapFullscreen ? 'fixed inset-0 z-50 p-0' : 'space-y-4'}>
      {!mapFullscreen && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Live Map</h1>
            <p className="text-sm text-slate-400 mt-1">Real-time vehicle position tracking</p>
          </div>
          <ActionButton actionId="map.fullscreen.toggle" icon={Maximize2} variant="secondary" size="sm" onAction={toggleFullscreen}>
            Fullscreen
          </ActionButton>
        </div>
      )}

      <div className={
        mapFullscreen
          ? 'relative h-[100dvh] w-[100dvw] overflow-hidden'
          : 'relative h-[calc(100vh-220px)] rounded-xl overflow-hidden border border-slate-700'
      }>
        <MapContainer center={MAP_CONFIG.DEFAULT_CENTER} zoom={MAP_CONFIG.DEFAULT_ZOOM} className="w-full h-full" style={{ background: '#0f172a' }}
          zoomControl={false} attributionControl={false}>
          <TileLayer url={MAP_CONFIG.TILE_LAYER} attribution={MAP_CONFIG.TILE_ATTRIBUTION} maxZoom={MAP_CONFIG.MAX_ZOOM} />
          <InvalidateMapSize trigger={mapFullscreen} />
          {positions.length > 0 && <FitBounds positions={positions} />}
          {positions.map((v) => (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={createDroneIcon(v.status, v.heading)}>
              <Popup className="custom-popup">
                <div className="bg-slate-800 text-slate-200 p-2 rounded min-w-[180px]">
                  <p className="font-semibold text-sm">{v.name}</p>
                  <p className="text-xs text-slate-400">{v.callsign} • {v.type}</p>
                  <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                    <span>Battery: {Math.round(telemetry[v.id]?.battery ?? v.battery)}%</span>
                    <span>Alt: {(telemetry[v.id]?.altitude ?? 0).toFixed(0)}m</span>
                    <span>Speed: {(telemetry[v.id]?.groundspeed ?? 0).toFixed(1)}m/s</span>
                    <span>Mode: {v.mode}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          {missionPath.length > 1 && <Polyline positions={missionPath} color="#3b82f6" weight={2} dashArray="8,8" />}
          {activeMission?.waypoints?.map((wp) => (
            <Circle key={wp.id} center={[wp.lat, wp.lng]} radius={8} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8 }} />
          ))}
        </MapContainer>
        <VehicleListPanel vehicles={vehicles} selectedId={selectedVehicle} onSelect={setSelectedVehicle} />
        {mapFullscreen && (
          <button onClick={toggleFullscreen} title="Exit fullscreen" className="absolute top-4 right-4 z-[1000] p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white">
            <Minimize2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

