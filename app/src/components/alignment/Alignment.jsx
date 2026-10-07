import { useEffect, useMemo, useState } from 'react';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { isComplete } from '../../lib/feasibility/scoring.js';
import { pickInputs } from '../feasibility/FeasibilityWizard.jsx';
import { getCachedMarketIntelligence } from '../../lib/marketIntelligence.js';
import { alignShortlist } from '../../lib/alignment/engine.js';
import { WEIGHTS } from '../../lib/alignment/config.js';
import { getAlignmentNarrative } from '../../lib/alignment/narrative.js';
import ScoreBar from '../ScoreBar.jsx';
import FinancingPlan from '../feasibility/FinancingPlan.jsx';

// Module 5: Parent–Student Alignment. Supportive by design: it looks for a path that
// keeps as much of the student's goal as possible while respecting family constraints.

const CAT_TONE = {
  strong: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  moderate: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200',
  significant: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  high: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
};
const SEVERITY = {
  low: { label: 'Small difference', tone: 'text-slate-300 bg-slate-800' },
  medium: { label: 'Worth discussing', tone: 'text-amber-200 bg-amber-500/10' },
  high: { label: 'Important to resolve', tone: 'text-rose-200 bg-rose-500/10' },
  none: { label: 'Aligned', tone: 'text-emerald-200 bg-emerald-500/10' },
};

function CategoryBadge({ category, score }) {
  if (!category) return <span className="text-xs text-slate-500">Not enough information</span>;
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CAT_TONE[category.id]}`}>{score}/100 · {category.label}</span>;
}

function Overview({ results, selected, onSelect }) {
  return (
    <section className="card p-0">
      <div className="p-5 pb-3">
        <h2 className="font-semibold">Alignment across your shortlist</h2>
        <p className="text-xs text-slate-400">The same family can fit some careers better than others, because cost, risk, location and study length differ.</p>
      </div>
      <ul className="divide-y divide-slate-800/70">
        {results.map((a) => (
          <li key={a.careerId}>
            <button onClick={() => onSelect(a.careerId)} className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left text-sm ${a.careerId === selected ? 'bg-indigo-500/5' : 'hover:bg-slate-900'}`}>
              <span>
                <span className="font-medium">{a.career}</span>
                <span className="ml-2 text-xs text-slate-500">your fit {a.fit}%</span>
              </span>
              <CategoryBadge category={a.category} score={a.score} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Difference({ d, explanation }) {
  const sev = SEVERITY[d.severity] ?? SEVERITY.low;
  return (
    <article className="rounded-xl border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{d.label}</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sev.tone}`}>{sev.label}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">You</dt><dd className="text-slate-200">{d.student ?? 'Not answered'}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Your family</dt><dd className="text-slate-200">{d.family ?? 'Not stated'}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-slate-300">{explanation || d.reason}</p>
      {d.evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-500">{d.evidence.slice(0, 3).map((e, i) => <li key={i}>{e.text}</li>)}</ul>
      )}
    </article>
  );
}

function PathCard({ p, recommended, explanation }) {
  return (
    <article className={`card flex flex-col ${recommended ? 'border-indigo-500/50 bg-indigo-500/5' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{recommended ? 'Recommended' : 'Option'}</p>
          <h4 className="text-lg font-semibold">{p.title}</h4>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums">{p.score}</p>
          <p className="text-[11px] text-slate-500">alignment if chosen</p>
        </div>
      </div>
      <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">{p.pathway.chain}</p>
      {explanation && <p className="mt-3 text-sm text-slate-300">{explanation}</p>}
      <ul className="mt-3 flex-1 space-y-1 text-sm">
        {p.preserves.map((x) => <li key={x} className="flex gap-2"><span className="text-emerald-400">✓</span><span className="text-slate-300">{x}</span></li>)}
        {p.solves.length > 0 && <li className="flex gap-2"><span className="text-indigo-300">↗</span><span className="text-slate-300">Eases: {p.solves.join(', ')}</span></li>}
        {p.tradeoffs.slice(0, 3).map((x) => <li key={x} className="flex gap-2"><span className="text-slate-500">•</span><span className="text-slate-400">{x}</span></li>)}
      </ul>
      <p className="mt-3 text-xs text-slate-500">{p.pathway.cost > 0 ? `About ${p.pathway.costLabel}` : 'Free self-paced courses'} · complexity {p.complexity}</p>
    </article>
  );
}

export default function Alignment({ userId, profile, recs, feasibilityRow, onGoFeasibility }) {
  const inputs = useMemo(() => pickInputs(feasibilityRow), [feasibilityRow]);
  const ready = recs.length > 0 && isComplete(inputs);
  const [marketById, setMarketById] = useState({});
  const [selected, setSelected] = useState(recs[0]?.domainId ?? null);
  const [narr, setNarr] = useState(null); // { status, narrative, reason? }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    Promise.all(recs.map(async (r) => [r.domainId, (await getCachedMarketIntelligence(userId, r.domainId))?.record ?? null]))
      .then((pairs) => setMarketById(Object.fromEntries(pairs.filter(([, v]) => v))));
  }, [ready, recs, userId]);

  const results = useMemo(() => (ready ? alignShortlist({ recs, profile, inputs, marketById }) : []), [ready, recs, profile, inputs, marketById]);
  const a = results.find((x) => x.careerId === selected) ?? results[0];

  useEffect(() => {
    if (!a) return;
    setNarr(null);
    getAlignmentNarrative({ userId, alignment: a }).then(setNarr);
  }, [a?.careerId, a?.score, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recs.length) return <p className="text-slate-400">Complete your assessment first to get career recommendations.</p>;
  if (!isComplete(inputs)) {
    return (
      <div className="card mx-auto max-w-xl space-y-3 text-center">
        <h1 className="text-xl font-bold">Family alignment uses your feasibility answers</h1>
        <p className="text-sm text-slate-400">No new questions: it reuses what you shared about your family&rsquo;s budget, risk comfort and priorities.</p>
        <button className="btn-primary" onClick={onGoFeasibility}>Check career feasibility</button>
      </div>
    );
  }
  if (!a) return <p className="text-slate-400">No alignment data available for your shortlist.</p>;

  const n = narr?.narrative;
  const askAi = async () => {
    setBusy(true);
    setNarr(await getAlignmentNarrative({ userId, alignment: a, request: true }));
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module 5</p>
        <h1 className="text-2xl font-bold">Family alignment</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Finding a path that works for you <em>and</em> your family. This isn&rsquo;t about who&rsquo;s right: it shows where you
          already agree, what&rsquo;s worth talking through, and routes that keep as much of your goal as possible.
        </p>
      </div>

      <Overview results={results} selected={a.careerId} onSelect={setSelected} />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Career</p>
            <h2 className="text-xl font-bold">{a.career}</h2>
            <div className="mt-2"><CategoryBadge category={a.category} score={a.score} /></div>
          </div>
          <div className="w-full max-w-xs">
            <ScoreBar value={a.score ?? 0} />
            <p className="mt-1 text-xs text-slate-500">
              {Math.round(a.coverage * 100)}% of the analysis is backed by your answers{a.tentative ? ' (tentative)' : ''}.
              Family finances are summarised, never shown.
            </p>
          </div>
        </div>
        {n && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-slate-200">{n.summary}</p>
            {n.why_it_matters && <p className="text-slate-400">{n.why_it_matters}</p>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={askAi}>
            {busy ? 'Writing guidance…' : narr?.status === 'ai' || narr?.status === 'cached' ? 'Refresh personalised guidance' : 'Get personalised guidance'}
          </button>
          <span>
            {narr?.status === 'ai' || narr?.status === 'cached'
              ? 'Explanations written by Praxio AI from the analysis above; scores are calculated by Praxio, not the AI.'
              : narr?.reason ? 'AI guidance is unavailable right now; showing Praxio’s standard summary.' : 'Showing Praxio’s standard summary.'}
          </span>
        </div>
      </section>

      {a.aligned.length > 0 && (
        <section className="card">
          <h3 className="mb-3 font-semibold">Where you already align</h3>
          <ul className="flex flex-wrap gap-2">
            {a.aligned.map((d) => <li key={d.dimension} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">✓ {d.label}</li>)}
          </ul>
        </section>
      )}

      {a.familyActions?.length > 0 && (
        <section className="card">
          <h3 className="mb-1 font-semibold">What this path needs from your family</h3>
          <p className="text-xs text-slate-500">Alignment is about the specific actions a path depends on (funding, co-signing a loan, a move, further study), not about whether your family &ldquo;approves&rdquo; of the career.</p>
          <FinancingPlan plan={a.dimensions.find((d) => d.dimension === 'financial').financing} actions={a.familyActions} title="Family actions for the direct path" />
        </section>
      )}

      {a.conflicts.length > 0 && (
        <section className="card">
          <h3 className="mb-1 font-semibold">Things to talk through together</h3>
          <p className="mb-4 text-xs text-slate-500">Each is an understandable priority on both sides. The paths below show ways to bridge them.</p>
          <div className="space-y-3">{a.conflicts.map((d) => <Difference key={d.dimension} d={d} explanation={n?.differences?.[d.dimension]} />)}</div>
        </section>
      )}

      {a.unknown.length > 0 && (
        <p className="text-xs text-slate-500">
          Not enough information for: {a.unknown.map((d) => d.label.toLowerCase()).join(', ')}. These aren&rsquo;t counted in the score.
        </p>
      )}

      <section>
        <h3 className="mb-3 text-lg font-semibold">Possible paths</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {a.paths.map((p) => <PathCard key={p.id} p={p} recommended={p.id === a.recommendedPathId} explanation={n?.paths?.[p.id]} />)}
        </div>
      </section>

      <section className="card border-indigo-500/40 bg-indigo-500/5">
        <h3 className="font-semibold">Recommended compromise: {a.paths.find((p) => p.id === a.recommendedPathId)?.title}</h3>
        {n && <p className="mt-2 text-sm text-slate-200">{n.recommendation_note}</p>}
        {n?.conversation_starters?.length > 0 && (
          <>
            <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Questions to discuss together</p>
            <ul className="space-y-1 text-sm text-slate-300">{n.conversation_starters.map((q) => <li key={q}>• {q}</li>)}</ul>
          </>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Alignment weights (initial, not scientifically validated): career direction {WEIGHTS.aspiration * 100}%, education cost {WEIGHTS.financial * 100}%,
        financial risk {WEIGHTS.risk * 100}%, location {WEIGHTS.location * 100}%, length of education {WEIGHTS.education * 100}%, shared values {WEIGHTS.priorities * 100}%.
        Family location and education expectations are inferred from the family priorities you selected.
      </p>
    </div>
  );
}
