import { CAREER_BY_ID } from '../lib/careers.js';
import { FEATURE_LABELS } from '../lib/features.js';
import ScoreBar from './ScoreBar.jsx';

export default function CareerDetail({ rec, explaining, onBack, onAsk }) {
  if (!rec) return <p className="text-slate-400">Pick a career from your matches first.</p>;
  const c = CAREER_BY_ID[rec.domainId];
  const ex = rec.explanation;
  const cited = new Set(ex?.grounded_on ?? []);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-100">← All matches</button>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Match #{rec.rank}</p>
        <h1 className="text-3xl font-bold">{c.name}</h1>
        <p className="mt-1 text-slate-400">{c.summary}</p>
      </div>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Why this fits you</h2>
          <span className="text-2xl font-bold tabular-nums">
            {rec.score.toFixed(0)}<span className="text-sm text-slate-500">/100</span>
          </span>
        </div>
        {ex ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-slate-200">{ex.why}</p>
            <p className="text-slate-400">
              <span className="font-semibold text-amber-300">Worth considering: </span>{ex.watch_out}
            </p>
            {ex.fallback && (
              <p className="text-xs text-slate-500">AI explanation unavailable. This summary is generated directly from your scores.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{explaining ? 'Writing your explanation…' : 'No explanation yet.'}</p>
        )}

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">What drives the score</h3>
        <ul className="mt-3 space-y-2.5">
          {rec.breakdown.map((row) => (
            <li key={row.feature} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
              <span className={cited.has(row.feature) ? 'text-slate-100' : 'text-slate-400'}>
                {FEATURE_LABELS[row.feature] ?? row.feature}
                {cited.has(row.feature) && <span className="ml-1.5 text-[10px] text-indigo-300">cited</span>}
              </span>
              <span className="text-xs tabular-nums text-slate-500">
                {row.value} × {Math.round(row.weight * 100)}% = <span className="text-slate-300">{row.contribution}</span>
              </span>
              <ScoreBar value={row.value} className="col-span-2 h-1.5" />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your pathway</h2>
        <ol className="relative space-y-4 border-l border-slate-800 pl-6">
          {c.roadmap.phases.map((p, i) => (
            <li key={p.title} className="relative">
              <span className="absolute -left-[33px] top-5 grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-[9px] font-bold">
                {i + 1}
              </span>
              <div className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{p.title}</h3>
                  <span className="text-xs text-slate-400">{p.duration}</span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  {p.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card border-indigo-500/40">
        <h2 className="font-semibold">Next steps you can take now</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {c.roadmap.nextSteps.map((s) => (
            <li key={s} className="flex gap-2"><span className="text-indigo-300">→</span>{s}</li>
          ))}
        </ul>
        <button className="btn-ghost mt-4" onClick={() => onAsk(rec.domainId)}>Ask the advisor about {c.name}</button>
      </section>
    </div>
  );
}
