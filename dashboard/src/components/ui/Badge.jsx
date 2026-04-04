import { clsx } from 'clsx';

const colorMap = {
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  gray: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const statusColorMap = {
  online: 'green',
  idle: 'green',
  offline: 'gray',
  armed: 'red',
  disarmed: 'green',
  in_flight: 'blue',
  landing: 'cyan',
  emergency: 'red',
  maintenance: 'amber',
  charging: 'purple',
  connected: 'green',
  disconnected: 'gray',
  error: 'red',
};

export default function Badge({ children, color = 'blue', status, dot = false, className }) {
  const resolvedColor = status ? statusColorMap[status] || 'gray' : color;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        colorMap[resolvedColor],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', {
          'bg-emerald-400': resolvedColor === 'green',
          'bg-red-400': resolvedColor === 'red',
          'bg-blue-400': resolvedColor === 'blue',
          'bg-amber-400': resolvedColor === 'amber',
          'bg-slate-400': resolvedColor === 'gray',
          'bg-purple-400': resolvedColor === 'purple',
          'bg-cyan-400': resolvedColor === 'cyan',
        })} />
      )}
      {children || status?.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

