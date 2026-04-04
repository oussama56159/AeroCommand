import { clsx } from 'clsx';

const statusConfig = {
  online: { color: 'bg-emerald-500', pulse: true, label: 'Online' },
  idle: { color: 'bg-emerald-500', pulse: false, label: 'Idle' },
  offline: { color: 'bg-slate-500', pulse: false, label: 'Offline' },
  armed: { color: 'bg-red-500', pulse: true, label: 'Armed' },
  disarmed: { color: 'bg-emerald-500', pulse: false, label: 'Disarmed' },
  in_flight: { color: 'bg-blue-500', pulse: true, label: 'In Flight' },
  landing: { color: 'bg-cyan-500', pulse: true, label: 'Landing' },
  emergency: { color: 'bg-red-600', pulse: true, label: 'Emergency' },
  maintenance: { color: 'bg-amber-500', pulse: false, label: 'Maintenance' },
  charging: { color: 'bg-purple-500', pulse: true, label: 'Charging' },
  connected: { color: 'bg-emerald-500', pulse: false, label: 'Connected' },
  disconnected: { color: 'bg-slate-500', pulse: false, label: 'Disconnected' },
  error: { color: 'bg-red-500', pulse: true, label: 'Error' },
  connecting: { color: 'bg-amber-500', pulse: true, label: 'Connecting' },
};

export default function StatusIndicator({ status, showLabel = false, size = 'md', className }) {
  const config = statusConfig[status] || statusConfig.offline;
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span className="relative flex">
        <span className={clsx(sizeClasses[size], config.color, 'rounded-full')} />
        {config.pulse && (
          <span className={clsx(
            'absolute inset-0 rounded-full animate-ping opacity-75',
            config.color
          )} />
        )}
      </span>
      {showLabel && <span className="text-xs font-medium text-slate-400">{config.label}</span>}
    </span>
  );
}

