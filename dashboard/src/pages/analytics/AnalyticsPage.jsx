import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Clock, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { useMissionStore } from '@/stores/missionStore';
import { buildLiveOpsMetrics } from '@/lib/analytics/liveMetrics';

const chartTooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' };

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = { blue: 'from-blue-500 to-blue-600', green: 'from-emerald-500 to-emerald-600', amber: 'from-amber-500 to-amber-600', purple: 'from-purple-500 to-purple-600' };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${colors[color]} shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const missions = useMissionStore((s) => s.missions);
  const alerts = useTelemetryStore((s) => s.alerts);
  const telemetryByVehicle = useTelemetryStore((s) => s.vehicleTelemetry);
  const connectionStatus = useTelemetryStore((s) => s.connectionStatus);

  const metrics = useMemo(
    () => buildLiveOpsMetrics({ vehicles, missions, alerts, telemetryByVehicle, connectionStatus }),
    [vehicles, missions, alerts, telemetryByVehicle, connectionStatus]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Live Operations Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">Metrics derived from live vehicle, telemetry, and alert state</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="Telemetry Samples" value={metrics.telemetrySampleCount} sub="Last 5 minutes" color="blue" />
        <StatCard icon={Target} label="Total Missions" value={metrics.totalMissions} sub={`${metrics.activeMissions} active`} color="green" />
        <StatCard icon={TrendingUp} label="Avg Battery" value={`${Math.round(metrics.averageBattery)}%`} sub="Current fleet average" color="purple" />
        <StatCard icon={AlertTriangle} label="Critical Alerts" value={metrics.criticalAlerts} sub="Unacknowledged" color="amber" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle subtitle="Telemetry sample volume across the last five minutes">Telemetry Throughput</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={metrics.telemetryThroughput}>
                <defs>
                  <linearGradient id="gradHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="samples" stroke="#3b82f6" fill="url(#gradHours)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle subtitle="Fleet status breakdown">Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={metrics.statusDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name">
                  {metrics.statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Vehicle Utilization */}
      <Card>
        <CardHeader><CardTitle subtitle="Battery, link quality, and sample counts per vehicle">Vehicle Snapshot</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.batterySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="battery" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Battery %" />
              <Bar dataKey="samples" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Telemetry Samples" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Connection state */}
      <Card>
        <CardHeader><CardTitle subtitle="WebSocket and vehicle link states">Connection Status</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={metrics.connectionDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" nameKey="name">
                {metrics.connectionDistribution.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

