import { CAREER_BY_ID } from '../lib/careers.js';
import ScoreBar from './ScoreBar.jsx';

export default function Results({ recs, explaining, onOpen, onAsk, hasFeasibility, onCheckFeasibility }) {
  if (!recs.length) return <p className="text-slate-400">No matches yet. Complete your profile first.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Your career matches</h1>
      <p className="mt-1 text-sm text-slate-400">
        Ranked by a suitability score built from your interests, aptitude, preferences and traits.
        Treat it as a starting point for exploring, not a verdict.
      </p>

      {onCheckFeasibility && (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-indigo-500/40 bg-indigo-500/5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Next step</p>
            <h2 className="font-semibold">Can you realistically pursue these careers?</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Check each match against your family&rsquo;s budget, education plans, risk comfort and location.
            </p>
          </div>
          <button className="btn-primary" onClick={onCheckFeasibility}>
            {hasFeasibility ? 'View career feasibility' : 'Check career feasibility'}
          </button>
        </div>
      )}

      <ol className="mt-6 space-y-3">
        {recs.map((r) => {
          const c = CAREER_BY_ID[r.domainId];
          if (!c) return null;
          return (
            <li key={r.domainId} className="card">
              <div className="flex items-start gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-bold">{r.rank}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{c.name}</h2>
                    <span className="text-sm font-bold tabular-nums">
                      {r.score.toFixed(0)}<span className="text-slate-500">/100</span>
                    </span>
                  </div>
                  <ScoreBar value={r.score} className="mt-2" />
                  <p className="mt-3 text-sm text-slate-300">
                    {r.explanation?.why ?? (explaining ? <span className="text-slate-500">Writing your explanation…</span> : c.summary)}
                  </p>
                  {r.coverage < 0.7 && (
                    <p className="mt-2 text-xs text-amber-300">
                      Tentative: only {Math.round(r.coverage * 100)}% of this match is backed by your answers.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={() => onOpen(r.domainId)}>See pathway</button>
                    <button className="btn-ghost" onClick={() => onAsk(r.domainId)}>Ask about this</button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
