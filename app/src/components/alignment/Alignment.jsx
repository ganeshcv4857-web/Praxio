import { useEffect, useMemo, useState } from 'react';
import { isComplete } from '../../lib/feasibility/scoring.js';
import { pickInputs } from '../feasibility/FeasibilityWizard.jsx';
import { getCachedMarketIntelligence } from '../../lib/marketIntelligence.js';
import { alignShortlist } from '../../lib/alignment/engine.js';
import { WEIGHTS } from '../../lib/alignment/config.js';
import { getAlignmentNarrative } from '../../lib/alignment/narrative.js';
import FinancingPlan from '../feasibility/FinancingPlan.jsx';
import { Btn, Fact, More, Panel, PageHead, Row, Rows, Status } from '../ui/kit.jsx';

// Module 5: Parent–Student Alignment. Supportive by design: the recommended compromise
// comes first; differences, family actions and other paths open on demand.

const CAT_TONE = { strong: 'good', moderate: 'info', significant: 'warn', high: 'bad' };
const SEVERITY = {
  low: { label: 'Small difference', tone: 'muted' },
  medium: { label: 'Worth discussing', tone: 'warn' },
  high: { label: 'Important to resolve', tone: 'bad' },
  none: { label: 'Aligned', tone: 'good' },
};

function PathBody({ p, explanation }) {
  return (
    <>
      {explanation && <p className="mb-4 text-[15px] leading-relaxed text-slate-200">{explanation}</p>}
      <p className="rounded-2xl bg-slate-950/40 px-4 py-3 text-sm text-slate-300">{p.pathway.chain}</p>
      <ul className="mt-4 space-y-2 text-[15px]">
        {p.preserves.map((x) => <li key={x} className="text-slate-200">✓ {x}</li>)}
        {p.solves.length > 0 && <li className="text-slate-300">↗ Eases: {p.solves.join(', ')}</li>}
        {p.tradeoffs.slice(0, 3).map((x) => <li key={x} className="text-slate-400">• {x}</li>)}
      </ul>
      <p className="mt-4 text-sm text-slate-500">{p.pathway.cost > 0 ? `About ${p.pathway.costLabel}` : 'Free self-paced courses'} · complexity {p.complexity} · alignment if chosen {p.score}/100</p>
    </>
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
      <div>
        <PageHead eyebrow="Family" title="Find a path that works" accent="for both of you." />
        <Panel className="text-center">
          <h2 className="text-[24px] font-medium tracking-[-0.03em]">This uses your feasibility answers</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-400">No new questions: it reuses what you shared about your family’s budget, risk comfort and priorities.</p>
          <Btn className="mt-6" onClick={onGoFeasibility}>Check feasibility →</Btn>
        </Panel>
      </div>
    );
  }
  if (!a) return <p className="text-slate-400">No alignment data available for your shortlist.</p>;

  const n = narr?.narrative;
  const ai = narr?.status === 'ai' || narr?.status === 'cached';
  const askAi = async () => {
    setBusy(true);
    setNarr(await getAlignmentNarrative({ userId, alignment: a, request: true }));
    setBusy(false);
  };
  const rec = a.paths.find((p) => p.id === a.recommendedPathId);
  const others = a.paths.filter((p) => p.id !== a.recommendedPathId);
  const financing = a.dimensions.find((d) => d.dimension === 'financial')?.financing;

  return (
    <div>
      <PageHead eyebrow="Family" title="Find a path that works" accent="for both of you."
        lede="Not about who’s right: where you already agree, what’s worth talking through, and a route that keeps as much of your goal as possible." />

      <div role="tablist" aria-label="Career" className="no-scrollbar -mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1">
        {results.map((r) => (
          <button key={r.careerId} type="button" role="tab" aria-selected={r.careerId === a.careerId} onClick={() => setSelected(r.careerId)}
            className={`inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full px-5 text-[15px] transition ${r.careerId === a.careerId ? 'bg-slate-100 text-slate-950' : 'bg-slate-900 text-slate-200 shadow-[var(--shadow)] hover:bg-slate-800'}`}>
            <span className={`h-2 w-2 rounded-full ${{ strong: 'bg-emerald-400', moderate: 'bg-indigo-400', significant: 'bg-amber-400', high: 'bg-rose-400' }[r.category?.id] ?? 'bg-slate-600'}`} />{r.career}
          </button>
        ))}
      </div>

      <Panel className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10" />
        <div className="relative flex flex-wrap gap-2">
          {a.category ? <Status tone={CAT_TONE[a.category.id]}>{a.category.label}</Status> : <Status>Not enough information</Status>}
        </div>
        <p className="relative mt-5 max-w-3xl text-[19px] leading-relaxed text-slate-100">
          {n?.summary ?? `For ${a.career}, ${a.aligned.length} area${a.aligned.length === 1 ? '' : 's'} already line up and ${a.conflicts.length} ${a.conflicts.length === 1 ? 'is' : 'are'} worth talking through.`}
        </p>
        {rec && (
          <div className="relative mt-6 rounded-2xl bg-slate-950/40 p-5">
            <div className="text-[13px] text-slate-500">Suggested compromise</div>
            <div className="mt-1 text-[20px] font-medium tracking-[-0.02em]">{rec.title}</div>
            {n?.recommendation_note && <p className="mt-2 text-[15px] text-slate-300">{n.recommendation_note}</p>}
          </div>
        )}
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <Btn kind="ghost" disabled={busy} onClick={askAi}>{busy ? 'Writing guidance…' : ai ? 'Refresh guidance' : 'Get personalised guidance'}</Btn>
          <span className="text-sm text-slate-500">{ai ? 'Written by Praxio AI from the analysis; scores are Praxio’s own.' : narr?.reason ? 'AI guidance unavailable; showing Praxio’s summary.' : ''}</span>
        </div>
      </Panel>

      <div className="h-8" />
      <Rows>
        {rec && <Row title={`Suggested path: ${rec.title}`} sub="What it keeps, what it eases, the trade-offs"><PathBody p={rec} explanation={n?.paths?.[rec.id]} /></Row>}
        {a.conflicts.length > 0 && (
          <Row title="Things to talk through" sub={a.conflicts.map((d) => d.label).join(' · ')}>
            <ul className="space-y-4">
              {a.conflicts.map((d) => {
                const sev = SEVERITY[d.severity] ?? SEVERITY.low;
                return (
                  <li key={d.dimension} className="rounded-2xl bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[16px] font-medium">{d.label}</span><Status tone={sev.tone}>{sev.label}</Status></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Fact label="You">{d.student ?? 'Not answered'}</Fact>
                      <Fact label="Your family">{d.family ?? 'Not stated'}</Fact>
                    </div>
                    <p className="mt-3 text-[15px] text-slate-300">{n?.differences?.[d.dimension] || d.reason}</p>
                  </li>
                );
              })}
            </ul>
          </Row>
        )}
        {a.familyActions?.length > 0 && financing && (
          <Row title="What this path needs from your family" sub="Funding, a loan co-signer, a move or further study">
            <p className="text-sm text-slate-500">Alignment is about the specific actions a path depends on, not whether your family “approves” of the career.</p>
            <FinancingPlan plan={financing} actions={a.familyActions} title="Family steps for the direct path" />
          </Row>
        )}
        {a.aligned.length > 0 && (
          <Row title="Where you already agree" sub={a.aligned.map((d) => d.label).join(' · ')}>
            <div className="flex flex-wrap gap-2">{a.aligned.map((d) => <Status key={d.dimension} tone="good">{d.label}</Status>)}</div>
          </Row>
        )}
        {n?.conversation_starters?.length > 0 && (
          <Row title="Questions to discuss together" sub={`${n.conversation_starters.length} conversation starter${n.conversation_starters.length === 1 ? '' : 's'}`}>
            <ul className="space-y-2 text-[15px] text-slate-300">{n.conversation_starters.map((q) => <li key={q}>• {q}</li>)}</ul>
          </Row>
        )}
        {others.map((p) => (
          <Row key={p.id} title={p.title} sub="Another option" meta={<span className="text-sm tabular-nums text-slate-500">{p.score}/100</span>}>
            <PathBody p={p} explanation={n?.paths?.[p.id]} />
          </Row>
        ))}
      </Rows>

      <div className="mt-10 space-y-1">
        <More label="How alignment is scored">
          Career direction {WEIGHTS.aspiration * 100}%, education cost {WEIGHTS.financial * 100}%, financial risk {WEIGHTS.risk * 100}%,
          location {WEIGHTS.location * 100}%, length of education {WEIGHTS.education * 100}%, shared values {WEIGHTS.priorities * 100}% (initial weights,
          not scientifically validated). {Math.round(a.coverage * 100)}% of this analysis is backed by your answers{a.tentative ? ', so treat it as tentative' : ''}.
          {a.unknown.length > 0 && ` Not enough information for ${a.unknown.map((d) => d.label.toLowerCase()).join(', ')}, so those aren’t counted.`}
          {' '}Family finances are summarised, never shown.
        </More>
      </div>
    </div>
  );
}
