// Small shared UI pieces for Module 3 (same visual language as the rest of the app).

export function Chip({ children, className = '' }) {
  return <span className={`inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300 ${className}`}>{children}</span>;
}

const DIFF_TONE = {
  beginner: 'bg-emerald-500/10 text-emerald-300',
  intermediate: 'bg-amber-500/10 text-amber-300',
  advanced: 'bg-rose-500/10 text-rose-300',
};
export function DifficultyChip({ level }) {
  return <Chip className={`capitalize ${DIFF_TONE[level]}`}>{level}</Chip>;
}

export function Stat({ label, value, sub, accent = false }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accent ? 'text-amber-300' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * mode 'learned': ✓ for every learned skill.
 * mode 'demonstrated': every learned skill, ✓ if proven by a project, ○ if not yet.
 */
export function SkillList({ skills, demonstrated = [], empty, mode = 'learned' }) {
  const proven = new Set(demonstrated);
  const list = mode === 'demonstrated' ? [...new Set([...demonstrated, ...skills])] : skills;
  if (!list.length || (mode === 'demonstrated' && !skills.length && !demonstrated.length)) {
    return <p className="text-xs text-slate-500">{empty}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {list.map((s) => {
        const ok = mode === 'learned' || proven.has(s);
        return (
          <li
            key={s}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              ok
                ? mode === 'demonstrated' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-200'
                : 'border-dashed border-slate-700 text-slate-500'
            }`}
          >
            {ok ? '✓' : '○'} {s}
          </li>
        );
      })}
    </ul>
  );
}

export const STATUS_LABEL = {
  open: { text: 'Project to build', tone: 'text-indigo-300' },
  submitted: { text: 'Evaluating…', tone: 'text-slate-400' },
  passed: { text: 'Demonstrated', tone: 'text-emerald-300' },
  needs_improvement: { text: 'Needs improvement', tone: 'text-amber-300' },
};
