import { useMemo, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, LabelList } from 'recharts';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { Activity } from 'lucide-react';

const chartTheme = {
  stroke: 'var(--color-border)',
  text: 'var(--color-text-muted)',
  grid: 'var(--color-border)',
  tooltipBg: 'var(--color-bg-secondary)',
  tooltipText: 'var(--color-text-primary)',
  tooltipBorder: 'var(--color-border)',
  labelFill: 'var(--color-text-secondary)',
  labelFillStrong: 'var(--color-text-primary)',
  labelOutline: 'var(--color-bg-primary)',
};

function _formatNumber(val, precision) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '—';
  const p = Number.isFinite(precision) ? Math.max(0, Math.min(precision, 6)) : 2;
  return n.toFixed(p);
}

function TelemetryChart({ title, data, dataKey, color = '#3b82f6', unit = '', precision = 2 }) {
  const lastIndex = data.length - 1;

  const labelEvery = useMemo(() => {
    const n = data.length;
    if (n <= 12) return 1;
    if (n <= 24) return 2;
    if (n <= 48) return 4;
    return 6;
  }, [data.length]);

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="time" tick={{ fill: chartTheme.text, fontSize: 10 }} axisLine={{ stroke: chartTheme.stroke }} />
            <YAxis tick={{ fill: chartTheme.text, fontSize: 10 }} axisLine={{ stroke: chartTheme.stroke }} />
            <Tooltip
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                border: `1px solid ${chartTheme.tooltipBorder}`,
                borderRadius: 8,
                color: chartTheme.tooltipText,
              }}
              formatter={(val) => [`${_formatNumber(val, precision)} ${unit}`, title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#grad-${dataKey})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={220}
            >
              <LabelList
                dataKey={dataKey}
                content={(props) => {
                  const idx = props.index;
                  if (typeof idx !== 'number') return null;
                  if (data.length === 0) return null;

                  const isLast = idx === lastIndex;
                  const shouldShow = isLast || idx % labelEvery === 0;
                  if (!shouldShow) return null;

                  const label = `${_formatNumber(props.value, precision)}${unit ? ` ${unit}` : ''}`;
                  const dy = isLast ? -10 : (idx / labelEvery) % 2 === 0 ? -10 : 16;

                  return (
                    <text
                      x={props.x}
                      y={props.y}
                      dy={dy}
                      textAnchor="middle"
                      fontSize={isLast ? 11 : 10}
                      fontWeight={isLast ? 700 : 600}
                      fill={isLast ? chartTheme.labelFillStrong : chartTheme.labelFill}
                      stroke={chartTheme.labelOutline}
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {label}
                    </text>
                  );
                }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function TelemetryPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const allTelemetry = useTelemetryStore((s) => s.vehicleTelemetry);
  const connectionStatus = useTelemetryStore((s) => s.connectionStatus);
  const [selectedId, setSelectedId] = useState(vehicles.find((v) => v.status !== 'offline')?.id || vehicles[0]?.id);

  const t = allTelemetry[selectedId];
  const history = t?.history;
  const chartData = useMemo(() => {
    const recent = (history || []).slice(-60);
    return recent.map((h, i) => {
      const voltage = h.voltage ?? 0;
      const current = h.current ?? 0;
      return {
        time: i,
        altitude: h.altitude ?? 0,
        speed: h.groundspeed ?? 0,
        battery: h.battery ?? 0,
        heading: h.heading ?? 0,
        roll: h.roll ?? 0,
        pitch: h.pitch ?? 0,
        throttle: h.throttle ?? 0,
        climb: h.climb_rate ?? 0,
        power_w: voltage * current,
      };
    });
  }, [history]);

  const powerPerHourData = useMemo(() => {
    // Interpret "power per hour consumption" as instantaneous power (W), derived from voltage*current.
    // (W = Wh/h).
    // We keep this as its own dataset so we can later swap to a true energy-rate metric if needed.
    return chartData;
  }, [chartData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Real-Time Telemetry</h1>
          <p className="text-sm text-slate-400 mt-1">Live sensor data streams from fleet vehicles</p>
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
            onClick={() => setSelectedId(v.id)}
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

      {/* Live Values Strip */}
      {t && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: 'ALT', value: `${(t.altitude ?? 0).toFixed(1)}m`, color: 'text-blue-400' },
            { label: 'SPD', value: `${(t.groundspeed ?? 0).toFixed(1)}m/s`, color: 'text-cyan-400' },
            { label: 'BAT', value: `${Math.round(t.battery ?? 0)}%`, color: (t.battery ?? 0) > 50 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'HDG', value: `${Math.round(t.heading ?? 0)}°`, color: 'text-amber-400' },
            { label: 'THR', value: `${Math.round(t.throttle ?? 0)}%`, color: 'text-purple-400' },
            { label: 'VS', value: `${(t.climb_rate ?? 0).toFixed(1)}m/s`, color: 'text-emerald-400' },
            { label: 'SAT', value: `${t.satellites ?? 0}`, color: 'text-blue-400' },
            { label: 'VOLT', value: `${(t.voltage ?? 0).toFixed(1)}V`, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold telemetry-value ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TelemetryChart title="Altitude" data={chartData} dataKey="altitude" color="#3b82f6" unit="m" precision={1} />
        <TelemetryChart title="Ground Speed" data={chartData} dataKey="speed" color="#06b6d4" unit="m/s" precision={1} />
        <TelemetryChart title="Battery" data={chartData} dataKey="battery" color="#22c55e" unit="%" precision={0} />
        <TelemetryChart title="Power / Hour Consumption" data={powerPerHourData} dataKey="power_w" color="#ef4444" unit="W" precision={0} />
        <TelemetryChart title="Heading" data={chartData} dataKey="heading" color="#f59e0b" unit="°" precision={0} />
        <TelemetryChart title="Climb Rate" data={chartData} dataKey="climb" color="#22c55e" unit="m/s" precision={1} />
      </div>
    </div>
  );
}

