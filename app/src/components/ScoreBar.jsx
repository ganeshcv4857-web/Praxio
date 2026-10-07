export default function ScoreBar({ value, className = '' }) {
  const tone = value >= 75 ? 'bg-emerald-400' : value >= 55 ? 'bg-indigo-400' : 'bg-amber-400';
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-800 ${className}`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  );
}
