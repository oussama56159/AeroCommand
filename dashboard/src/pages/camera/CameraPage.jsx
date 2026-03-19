import { useMemo, useState } from 'react';
import { Activity, ExternalLink, Save, Trash2 } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';

const CAMERA_URLS_KEY = 'aero_camera_stream_urls_v1';

function _safeParseJson(value, fallback) {
  try {
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadAllCameraUrls() {
  if (typeof window === 'undefined') return {};
  return _safeParseJson(window.localStorage.getItem(CAMERA_URLS_KEY), {});
}

function saveCameraUrl(vehicleId, url) {
  if (typeof window === 'undefined') return;
  const map = _safeParseJson(window.localStorage.getItem(CAMERA_URLS_KEY), {});
  const next = { ...map, [vehicleId]: url };
  window.localStorage.setItem(CAMERA_URLS_KEY, JSON.stringify(next));
}

function clearCameraUrl(vehicleId) {
  if (typeof window === 'undefined') return;
  const map = _safeParseJson(window.localStorage.getItem(CAMERA_URLS_KEY), {});
  if (!map || typeof map !== 'object') return;
  const next = { ...map };
  delete next[vehicleId];
  window.localStorage.setItem(CAMERA_URLS_KEY, JSON.stringify(next));
}

function pickInitialVehicleId(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return null;
  return vehicles.find((v) => v.status !== 'offline')?.id || vehicles[0]?.id || null;
}

function getViewerKind(url) {
  const s = String(url || '').trim().toLowerCase();
  if (!s) return 'none';
  if (s.includes('.m3u8')) return 'video';
  if (s.endsWith('.mp4') || s.endsWith('.webm') || s.endsWith('.ogg')) return 'video';
  return 'image';
}

export default function CameraPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const storedSelectedId = useFleetStore((s) => s.selectedVehicleId);
  const selectVehicle = useFleetStore((s) => s.selectVehicle);
  const allTelemetry = useTelemetryStore((s) => s.vehicleTelemetry);
  const connectionStatus = useTelemetryStore((s) => s.connectionStatus);

  const fallbackSelectedId = useMemo(() => pickInitialVehicleId(vehicles), [vehicles]);
  const selectedId = useMemo(() => {
    if (!storedSelectedId) return fallbackSelectedId;
    const exists = vehicles.some((v) => v.id === storedSelectedId);
    return exists ? storedSelectedId : fallbackSelectedId;
  }, [storedSelectedId, vehicles, fallbackSelectedId]);

  const t = selectedId ? allTelemetry[selectedId] : null;

  const [savedUrls, setSavedUrls] = useState(() => loadAllCameraUrls());
  const [draftUrls, setDraftUrls] = useState({});
  const [loadKey, setLoadKey] = useState(0);

  const streamUrl = useMemo(() => {
    if (!selectedId) return '';
    const draft = draftUrls[selectedId];
    if (typeof draft === 'string') return draft;
    const saved = savedUrls?.[selectedId];
    return typeof saved === 'string' ? saved : '';
  }, [selectedId, draftUrls, savedUrls]);

  const viewerKind = useMemo(() => getViewerKind(streamUrl), [streamUrl]);

  const liveValues = useMemo(() => {
    if (!t) return [];

    const battery = t.battery ?? 0;
    const gpsFix = t.gps_fix ?? t.gpsFix ?? 0;
    const satellites = t.satellites ?? 0;

    return [
      { label: 'ALT', value: `${(t.altitude ?? 0).toFixed(1)}m`, color: 'text-blue-400' },
      { label: 'SPD', value: `${(t.groundspeed ?? 0).toFixed(1)}m/s`, color: 'text-cyan-400' },
      {
        label: 'BAT',
        value: `${Math.round(battery)}%`,
        color: battery > 50 ? 'text-emerald-400' : battery > 20 ? 'text-amber-400' : 'text-red-400',
      },
      { label: 'HDG', value: `${Math.round(t.heading ?? 0)}°`, color: 'text-amber-400' },
      { label: 'MODE', value: `${t.mode ?? '—'}`, color: 'text-slate-200' },
      { label: 'ARM', value: t.armed ? 'YES' : 'NO', color: t.armed ? 'text-emerald-400' : 'text-slate-300' },
      { label: 'FIX', value: `${gpsFix}`, color: gpsFix >= 3 ? 'text-emerald-400' : 'text-amber-400' },
      { label: 'SAT', value: `${satellites}`, color: satellites >= 8 ? 'text-emerald-400' : 'text-amber-400' },
    ];
  }, [t]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Camera</h1>
          <p className="text-sm text-slate-400 mt-1">Live video feed with basic telemetry</p>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-sm text-emerald-400">Live</span>
        </div>
      </div>

      {/* Vehicle Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {vehicles.map((v) => (
          <button
            key={v.id}
            onClick={() => selectVehicle(v.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
              selectedId === v.id
                ? 'bg-blue-600/20 border-blue-500/30 text-blue-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <StatusIndicator status={connectionStatus[v.id] || 'disconnected'} size="sm" />
            {v.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" padding={false}>
          <CardHeader
            className="p-5 pb-0"
            action={
              streamUrl ? (
                <a
                  href={streamUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Open stream <ExternalLink className="w-4 h-4" />
                </a>
              ) : null
            }
          >
            <CardTitle subtitle={selectedVehicle ? `${selectedVehicle.name} • ${selectedVehicle.callsign}` : undefined}>
              Video
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {viewerKind === 'none' ? (
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6">
                <div className="text-sm text-slate-300 font-medium">No stream URL configured</div>
                <div className="text-xs text-slate-500 mt-1">
                  Set a browser-playable URL (MJPEG over HTTP works well; RTSP needs a proxy/transcoder).
                </div>
              </div>
            ) : viewerKind === 'video' ? (
              <video
                key={`${selectedId}:${loadKey}`}
                src={streamUrl}
                className="w-full aspect-video rounded-xl border border-slate-700 bg-black"
                controls
                autoPlay
                muted
                playsInline
              />
            ) : (
              <img
                key={`${selectedId}:${loadKey}`}
                src={streamUrl}
                alt="Camera stream"
                className="w-full aspect-video object-contain rounded-xl border border-slate-700 bg-black"
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle subtitle="Saved per-vehicle in this browser">Stream URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={streamUrl}
                onChange={(e) => {
                  if (!selectedId) return;
                  const next = e.target.value;
                  setDraftUrls((state) => ({ ...state, [selectedId]: next }));
                }}
                placeholder="https://..."
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  icon={Save}
                  disabled={!selectedId}
                  onClick={() => {
                    if (!selectedId) return;
                    const url = String(streamUrl || '').trim();
                    saveCameraUrl(selectedId, url);
                    setSavedUrls((state) => ({ ...state, [selectedId]: url }));
                    setDraftUrls((state) => {
                      const next = { ...state };
                      delete next[selectedId];
                      return next;
                    });
                    setLoadKey((k) => k + 1);
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  icon={Trash2}
                  disabled={!selectedId}
                  onClick={() => {
                    if (!selectedId) return;
                    clearCameraUrl(selectedId);
                    setSavedUrls((state) => {
                      const next = { ...state };
                      delete next[selectedId];
                      return next;
                    });
                    setDraftUrls((state) => {
                      const next = { ...state };
                      delete next[selectedId];
                      return next;
                    });
                    setLoadKey((k) => k + 1);
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="text-xs text-slate-500">
                Tip: Use an MJPEG URL for easy browser embedding. If you only have RTSP, expose an HTTP stream (HLS/MJPEG/WebRTC) via your edge agent or backend.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle subtitle="Updates with the selected vehicle">Telemetry</CardTitle>
            </CardHeader>
            <CardContent>
              {t ? (
                <div className="grid grid-cols-2 gap-3">
                  {liveValues.map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
                      <p className={`text-sm font-bold telemetry-value ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400">No telemetry yet for this vehicle.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
