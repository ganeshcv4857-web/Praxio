import { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../../lib/db.js';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { evaluateAll, isComplete } from '../../lib/feasibility/scoring.js';
import { pickInputs } from '../feasibility/FeasibilityWizard.jsx';
import { deriveProgress } from '../../lib/development/learning.js';
import { buildMarketContext, getCachedMarketIntelligence, getMarketIntelligence, UNAVAILABLE_MESSAGE } from '../../lib/marketIntelligence.js';
import {
  DEMAND_LABEL, MARKET_INTELLIGENCE_TTL_DAYS, TREND_LABEL, compareCareers, freshness, marketSkillGap,
  personalOpportunitiesThreats, personalSummary,
} from '../../lib/marketInsights.js';
import { Btn, Fact, More, Panel, PageHead, Row, Rows, Status } from '../ui/kit.jsx';

// Module 4: Market Intelligence. Research is only requested when the student asks;
// everything else renders from cached, validated records.

const DEMAND_TONE = { very_high: 'good', high: 'good', moderate: 'warn', mixed: 'warn', low: 'bad', unknown: 'muted' };
const STATUS = {
  demonstrated: { label: 'Demonstrated', tone: 'good' },
  learned: { label: 'Learned, not proven', tone: 'warn' },
  missing: { label: 'Missing', tone: 'muted' },
};

/** [1][2] superscript citations linking to the record's sources. */
function Cite({ ids, sources }) {
  if (!ids?.length) return null;
  return (
    <sup className="ml-0.5 whitespace-nowrap">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        return s ? <a key={id} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="mx-px text-[10px] font-semibold text-indigo-300 hover:underline">[{id}]</a> : null;
      })}
    </sup>
  );
}

function ClaimList({ items, sources, empty = 'Not found in current sources.' }) {
  if (!items?.length) return <p className="text-slate-500">{empty}</p>;
  return <ul className="space-y-2 text-[15px] text-slate-300">{items.map((c, i) => <li key={i}>{c.text}<Cite ids={c.sources} sources={sources} /></li>)}</ul>;
}

function InsightList({ items, sources }) {
  if (!items.length) return <p className="text-slate-500">None found in current sources.</p>;
  return (
    <ul className="space-y-3">
      {items.map((o, i) => (
        <li key={i} className="text-[15px] text-slate-300">{o.text}<Cite ids={o.sources} sources={sources} />{o.basis !== 'market' && <span className="block text-sm text-slate-500">Based on {o.basis}</span>}</li>
      ))}
    </ul>
  );
}

function Report({ record, gap, insights, summary, fresh, onRefresh, busy }) {
  const m = record.market;
  const s = record.sources;
  const byScope = (scope) => m.regions.filter((r) => r.scope === scope);
  const missing = gap.items.filter((i) => i.status === 'missing');
  const salary = [['Entry', m.salary.entry_level], ['Mid', m.salary.mid_level], ['Senior', m.salary.senior_level]];
  const scopes = [['india', 'India'], ['global', 'Global'], ['remote', 'Remote']];
  return (
    <div>
      <Panel className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10" />
        <div className="relative flex flex-wrap items-center gap-2">
          <Status tone={DEMAND_TONE[m.demand.level]}>{DEMAND_LABEL[m.demand.level]} demand{TREND_LABEL[m.demand.trend] ? ` · ${TREND_LABEL[m.demand.trend]}` : ''}</Status>
          <Status tone={fresh.fresh ? 'muted' : 'warn'}>{fresh.label}</Status>
        </div>
        <p className="relative mt-5 max-w-3xl text-[19px] leading-relaxed text-slate-100">{summary}</p>
        {missing[0] && (
          <p className="relative mt-4 text-slate-400">
            Biggest gap: <span className="text-slate-100">{missing[0].skill}</span>{missing.length > 1 ? ` and ${missing.length - 1} more` : ''}.
          </p>
        )}
        <div className="relative mt-6"><Btn kind="ghost" disabled={busy} onClick={onRefresh}>{busy ? 'Researching…' : 'Refresh research'}</Btn></div>
      </Panel>

      <div className="mt-8">
        <Rows>
          <Row title="Your skill gaps" sub={`${gap.counts.missing} missing · ${gap.counts.learned} learned · ${gap.counts.demonstrated} demonstrated`}>
            {!gap.items.length ? <p className="text-slate-500">The research did not name specific skills.</p> : (
              <ul className="divide-y divide-slate-800">
                {gap.items.map((i) => (
                  <li key={i.skill} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium">{i.skill}<Cite ids={i.sources} sources={s} /></div>
                      {i.status !== 'demonstrated' && (
                        <div className="text-sm text-slate-500">{i.courses.length ? `Learn it with ${i.courses.map((c) => c.title).join(', ')}` : 'No catalog course yet'}</div>
                      )}
                    </div>
                    <Status tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Status>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-slate-500">Demonstrated means proven by a passed project. Finishing a module only counts as learned.</p>
          </Row>
          <Row title="Salary" sub={salary[0][1] ? `Entry ${salary[0][1].range}${m.salary.region ? ` · ${m.salary.region}` : ''}` : 'Not found in sources'}>
            <ul className="space-y-2">
              {salary.map(([k, b]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-slate-400">{k}</span>
                  {b ? <span className="tabular-nums">{b.range}<Cite ids={b.sources} sources={s} /></span> : <span className="text-slate-500">Not found</span>}
                </li>
              ))}
            </ul>
          </Row>
          <Row title="Opportunities for you" sub={`${insights.opportunities.length} found`}><InsightList items={insights.opportunities} sources={s} /></Row>
          <Row title="Risks to watch" sub={`${insights.threats.length} found`}><InsightList items={insights.threats} sources={s} /></Row>
          <Row title="Where the jobs are" sub={scopes.filter(([x]) => byScope(x).length).map(([, l]) => l).join(' · ') || 'No evidence found'}>
            <div className="grid gap-5 sm:grid-cols-3">
              {scopes.map(([scope, label]) => (
                <Fact key={scope} label={label}>
                  {byScope(scope).length
                    ? byScope(scope).map((r) => <span key={r.region} className="block">{r.region}<Cite ids={r.sources} sources={s} /></span>)
                    : <span className="text-slate-500">No evidence found</span>}
                </Fact>
              ))}
            </div>
          </Row>
          <Row title="Education & exams" sub="What employers expect">
            <ClaimList items={m.education_expectations} sources={s} />
            {m.alternative_pathways.length > 0 && <div className="mt-5"><Fact label="Alternative pathways"><ClaimList items={m.alternative_pathways} sources={s} /></Fact></div>}
            {m.exams_certifications.length > 0 && <div className="mt-5"><Fact label="Exams & certifications"><ClaimList items={m.exams_certifications} sources={s} /></Fact></div>}
          </Row>
          <Row title="Industry & trends" sub="Who is hiring and where things are heading">
            {m.demand.summary && <p className="mb-5 text-[15px] text-slate-300">{m.demand.summary}<Cite ids={m.demand.sources} sources={s} /></p>}
            <Fact label="Industries hiring"><ClaimList items={m.industries_hiring} sources={s} /></Fact>
            <div className="mt-5"><Fact label="Trends"><ClaimList items={m.industry_trends} sources={s} /></Fact></div>
          </Row>
        </Rows>
      </div>

      <div className="mt-10 space-y-1">
        <More label={`Sources (${s.length})`}>
          <ol className="space-y-2">
            {s.map((src) => (
              <li key={src.id}>
                <span className="text-slate-500">[{src.id}] </span>
                <a href={src.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">{src.title}</a>
                <span className="text-slate-500"> · {src.publisher}{src.published_at ? ` · ${src.published_at}` : ''}</span>
              </li>
            ))}
          </ol>
          {record.limitations && <p className="mt-3">Limitations: {record.limitations}</p>}
          <p className="mt-2">Researched {new Date(record.researched_at).toLocaleString()} via {record.provider} ({record.model}), confidence {record.confidence}/100. Kept for {MARKET_INTELLIGENCE_TTL_DAYS} days.</p>
        </More>
      </div>
    </div>
  );
}

export default function MarketIntelligence({ userId, profile, recs, feasibilityRow, onGoFeasibility }) {
  const inputs = useMemo(() => pickInputs(feasibilityRow), [feasibilityRow]);
  const feasibilityById = useMemo(
    () => (isComplete(inputs) ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {}),
    [inputs, recs]
  );
  const [selected, setSelected] = useState(recs[0]?.domainId ?? null);
  const [cache, setCache] = useState({}); // careerId -> { record, fresh }
  const [progress, setProgress] = useState(() => deriveProgress(null));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'unavailable', reason, staleDate? }

  const loadCache = useCallback(async () => {
    const entries = await Promise.all(recs.map(async (r) => [r.domainId, await getCachedMarketIntelligence(userId, r.domainId)]));
    setCache(Object.fromEntries(entries.filter(([, v]) => v)));
  }, [userId, recs]);

  useEffect(() => {
    loadCache();
    db.getDevelopment(userId).then((d) => setProgress(deriveProgress(d))).catch(() => {});
  }, [loadCache, userId]);

  const research = async (force) => {
    setBusy(true);
    setNotice(null);
    const context = buildMarketContext(selected, profile, { skills: progress.demonstratedSkills });
    const res = await getMarketIntelligence({ userId, careerId: selected, context, force });
    if (res.status === 'ok') {
      setCache((c) => ({ ...c, [selected]: { record: res.record, fresh: true } }));
    } else {
      setNotice({ kind: 'unavailable', reason: res.reason, staleDate: res.stale?.researched_at ?? null });
    }
    setBusy(false);
  };

  if (!recs.length) return <p className="text-slate-400">Complete your assessment first to get career recommendations.</p>;

  const rows = compareCareers(recs, { feasibilityById, marketById: Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.record])) });
  const rec = recs.find((r) => r.domainId === selected);
  const entry = cache[selected];
  const record = entry?.record ?? null;
  const gap = record ? marketSkillGap(record, { demonstrated: progress.demonstratedSkills, learned: progress.learnedSkills }, selected) : null;
  const feas = feasibilityById[selected] ?? null;

  const pick = (id) => { setSelected(id); setNotice(null); };

  return (
    <div>
      <PageHead eyebrow="Market" title="What the world" accent="is asking for."
        lede="Live, source-backed research for each of your directions. It never changes your fit or feasibility scores." />

      <div role="tablist" aria-label="Career" className="no-scrollbar -mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1">
        {rows.map((r) => (
          <button key={r.careerId} type="button" role="tab" aria-selected={r.careerId === selected} onClick={() => pick(r.careerId)}
            className={`inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full px-5 text-[15px] transition ${r.careerId === selected ? 'bg-slate-100 text-slate-950' : 'bg-slate-900 text-slate-200 shadow-[var(--shadow)] hover:bg-slate-800'}`}>
            <span className={`h-2 w-2 rounded-full ${r.demand ? (r.fresh ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-slate-600'}`} />{r.name}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mb-6 rounded-2xl bg-rose-500/10 px-5 py-3 text-sm text-rose-300">
          {UNAVAILABLE_MESSAGE}{record ? ` Showing research from ${new Date(record.researched_at).toLocaleDateString()}.` : ''}
          {notice.reason && <span className="block opacity-80">{notice.reason}</span>}
        </p>
      )}

      {!record ? (
        <Panel className="text-center">
          <h2 className="text-[26px] font-medium tracking-[-0.03em]">No research yet for {CAREER_BY_ID[selected]?.name}</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-400">Praxio searches current, reputable sources for demand, salaries and skills, then compares them with what you’ve demonstrated. It can take up to a minute.</p>
          <Btn className="mt-6" disabled={busy} onClick={() => research(false)}>{busy ? 'Researching current market…' : 'Research this market →'}</Btn>
        </Panel>
      ) : (
        <Report
          record={record}
          gap={gap}
          summary={personalSummary(record, gap, { fit: rec?.score })}
          insights={personalOpportunitiesThreats(record, gap, { fit: rec?.score, feasibility: feas, inputs })}
          fresh={freshness(record)}
          busy={busy}
          onRefresh={() => research(true)}
        />
      )}

      <div className="mt-2 space-y-1">
        <More label="Compare all your directions">
          <ul className="divide-y divide-slate-800">
            {rows.map((r) => (
              <li key={r.careerId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <button type="button" className="text-left text-slate-200 hover:text-indigo-300" onClick={() => pick(r.careerId)}>{r.name}</button>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-slate-500">Fit {r.fit}%{r.feasibility != null ? ` · Feasible ${r.feasibility}%` : ''}</span>
                  {r.demand ? <Status tone={DEMAND_TONE[r.demand]}>{DEMAND_LABEL[r.demand]}</Status> : <Status>Not researched</Status>}
                </span>
              </li>
            ))}
          </ul>
          {!isComplete(inputs) && (
            <p className="mt-3">Feasibility isn’t complete, so only fit and market are compared. <button type="button" className="font-medium text-indigo-300" onClick={onGoFeasibility}>Check feasibility</button></p>
          )}
        </More>
      </div>
    </div>
  );
}
