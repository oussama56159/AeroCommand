import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Battery, Compass, Gauge, Satellite, Thermometer, Zap } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatusIndicator from '@/components/ui/StatusIndicator';
import ActionButton from '@/components/actions/ActionButton';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { useUIStore } from '@/stores/uiStore';
import { useMissionStore } from '@/stores/missionStore';
import { COMMANDS } from '@/config/constants';
import { useMissionStream } from '@/lib/websocket/useMissionStream';

function TelemetryGauge({ icon: Icon, label, value, unit, color = 'blue' }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
      <Icon className={`w-5 h-5 text-${color}-400 shrink-0`} />
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-100 telemetry-value">{value}<span className="text-xs text-slate-400 ml-1">{unit}</span></p>
      </div>
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams();
  const vehicle = useFleetStore((s) => s.vehicles.find((v) => v.id === id));
  const sendCommand = useFleetStore((s) => s.sendCommand);
  const telemetry = useTelemetryStore((s) => s.vehicleTelemetry[id]);
  const connStatus = useTelemetryStore((s) => s.connectionStatus[id]);
  const addToast = useUIStore((s) => s.addToast);
  const activeMission = useMissionStore((s) => s.getActiveMissionForVehicle(id));
  const fetchMissions = useMissionStore((s) => s.fetchMissions);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  useMissionStream(id);

  if (!vehicle) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400">Vehicle not found</p>
        <Link to="/app/fleet" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">Back to Fleet</Link>
      </div>
    );
  }

  const t = telemetry || {};
  const isConnected = connStatus === 'connected';
  const disabledReason = isConnected ? undefined : 'Vehicle not connected';
  const batteryTemperature = Number(t.temperature);
  const hasBatteryTemperature = Number.isFinite(batteryTemperature);

  const handleCommand = async (cmd) => {
    await sendCommand(vehicle.id, { command: cmd });
    addToast({
      type: 'success',
      title: 'Command Sent',
      message: `${String(cmd).replace(/_/g, ' ').toUpperCase()} sent to ${vehicle.name}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/app/fleet" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-100">{vehicle.name}</h1>
            <Badge status={vehicle.status} dot />
            <StatusIndicator status={connStatus || 'disconnected'} showLabel />
          </div>
          <p className="text-sm text-slate-400">{vehicle.callsign} • {vehicle.type} • {vehicle.firmware}</p>
        </div>
      </div>

      {/* Identifiers */}
      <Card>
        <CardHeader>
          <CardTitle subtitle="Backend identifiers used for telemetry, commands, and org scoping">Vehicle Identifiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Vehicle UUID</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-100">{vehicle.id}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Organization ID</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-100">{vehicle.organization_id || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Commands */}
      <Card>
        <CardHeader><CardTitle>Quick Commands</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {vehicle.armed ? (
              <ActionButton
                actionId="control.command.disarm"
                size="sm"
                disabled={!isConnected}
                disabledReason={disabledReason}
                onAction={() => handleCommand(COMMANDS.DISARM)}
              >
                DISARM
              </ActionButton>
            ) : (
              <ActionButton
                actionId="control.command.arm"
                size="sm"
                disabled={!isConnected}
                disabledReason={disabledReason}
                onAction={() => handleCommand(COMMANDS.ARM)}
              >
                ARM
              </ActionButton>
            )}
            <ActionButton
              actionId="control.command.takeoff"
              size="sm"
              disabled={!isConnected}
              disabledReason={disabledReason}
              onAction={() => handleCommand(COMMANDS.TAKEOFF)}
            >
              Takeoff
            </ActionButton>
            <ActionButton
              actionId="control.command.land"
              size="sm"
              disabled={!isConnected}
              disabledReason={disabledReason}
              onAction={() => handleCommand(COMMANDS.LAND)}
            >
              Land
            </ActionButton>
            <ActionButton
              actionId="control.command.rtl"
              size="sm"
              disabled={!isConnected}
              disabledReason={disabledReason}
              onAction={() => handleCommand(COMMANDS.RTL)}
            >
              RTL
            </ActionButton>
            <ActionButton
              actionId="control.command.emergency_stop"
              size="sm"
              disabled={!isConnected}
              disabledReason={disabledReason}
              onAction={() => handleCommand(COMMANDS.EMERGENCY_STOP)}
            >
              Emergency Stop
            </ActionButton>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Mission */}
      <Card>
        <CardHeader><CardTitle subtitle="Current assignment and mission state">Assigned Mission</CardTitle></CardHeader>
        <CardContent>
          {activeMission ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{activeMission.name}</p>
                  <p className="text-xs text-slate-500">{activeMission.type} • {activeMission.waypoints?.length || 0} waypoints</p>
                </div>
                <Badge status={activeMission.status} dot />
              </div>
              {activeMission.status === 'in_progress' && (
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${activeMission.progress || 0}%` }} />
                </div>
              )}
              <div className="text-xs text-slate-400">State: {activeMission.status}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">No mission assigned to this vehicle.</div>
          )}
        </CardContent>
      </Card>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <TelemetryGauge icon={Battery} label="Battery" value={Math.round(t.battery ?? 0)} unit="%" color="emerald" />
        <TelemetryGauge icon={Gauge} label="Altitude" value={(t.altitude ?? 0).toFixed(1)} unit="m" color="blue" />
        <TelemetryGauge icon={Gauge} label="Ground Speed" value={(t.groundspeed ?? 0).toFixed(1)} unit="m/s" color="cyan" />
        <TelemetryGauge icon={Gauge} label="Air Speed" value={(t.airspeed ?? 0).toFixed(1)} unit="m/s" color="purple" />
        <TelemetryGauge icon={Compass} label="Heading" value={Math.round(t.heading ?? 0)} unit="°" color="amber" />
        <TelemetryGauge icon={Gauge} label="Climb Rate" value={(t.climb_rate ?? 0).toFixed(1)} unit="m/s" color="green" />
        <TelemetryGauge icon={Satellite} label="Satellites" value={t.satellites ?? 0} unit="sats" color="blue" />
        <TelemetryGauge icon={Battery} label="Voltage" value={(t.voltage ?? 0).toFixed(1)} unit="V" color="amber" />
        <TelemetryGauge icon={Thermometer} label="Battery Temp" value={hasBatteryTemperature ? batteryTemperature.toFixed(1) : '—'} unit="°C" color="red" />
        <TelemetryGauge icon={Zap} label="Current" value={(t.current ?? 0).toFixed(1)} unit="A" color="red" />
        <TelemetryGauge icon={Gauge} label="Throttle" value={Math.round(t.throttle ?? 0)} unit="%" color="purple" />
        <TelemetryGauge icon={Compass} label="Roll" value={(t.roll ?? 0).toFixed(1)} unit="°" color="cyan" />
        <TelemetryGauge icon={Compass} label="Pitch" value={(t.pitch ?? 0).toFixed(1)} unit="°" color="cyan" />
      </div>

      {/* Attitude Display */}
      <Card>
        <CardHeader><CardTitle subtitle="Roll, Pitch, Yaw visualization">Attitude Indicator</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-12 py-8">
            {[
              { label: 'Roll', value: t.roll ?? 0, max: 45 },
              { label: 'Pitch', value: t.pitch ?? 0, max: 45 },
              { label: 'Yaw', value: t.heading ?? 0, max: 360 },
            ].map((axis) => (
              <div key={axis.label} className="text-center">
                <div className="relative w-24 h-24 rounded-full border-2 border-slate-600 bg-slate-800 flex items-center justify-center mb-2">
                  <div className="w-1.5 h-10 bg-blue-500 rounded-full origin-bottom" style={{ transform: `rotate(${axis.value}deg)` }} />
                  <div className="absolute w-2 h-2 bg-white rounded-full" />
                </div>
                <p className="text-xs text-slate-500">{axis.label}</p>
                <p className="text-sm font-bold text-slate-200">{axis.value.toFixed(1)}°</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

