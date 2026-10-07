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

// Module 4: Market Intelligence. Research is only requested when the student asks;
// everything else renders from cached, validated records.

const DEMAND_TONE = {
  very_high: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  high: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  moderate: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  mixed: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  low: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
  unknown: 'border-slate-700 bg-slate-800 text-slate-300',
};
const STATUS = {
  demonstrated: { icon: '✓', label: 'Demonstrated', tone: 'text-emerald-300' },
  learned: { icon: '◐', label: 'Learned, not yet proven', tone: 'text-amber-300' },
  missing: { icon: '○', label: 'Missing', tone: 'text-slate-400' },
};

function DemandBadge({ level, trend }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DEMAND_TONE[level]}`}>
      {DEMAND_LABEL[level]}{TREND_LABEL[trend] ? ` · ${TREND_LABEL[trend]}` : ''}
    </span>
  );
}

/** [1][2] superscript citations linking to the record's sources. */
function Cite({ ids, sources }) {
  if (!ids?.length) return null;
  return (
    <sup className="ml-0.5 whitespace-nowrap">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        return s ? (
          <a key={id} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="mx-px text-[10px] font-semibold text-indigo-300 hover:underline">[{id}]</a>
        ) : null;
      })}
    </sup>
  );
}

function ClaimList({ items, sources, empty = 'Not found in current sources.' }) {
  if (!items?.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm text-slate-300">
      {items.map((c, i) => <li key={i} className="flex gap-2"><span className="text-slate-500">•</span><span>{c.text}<Cite ids={c.sources} sources={sources} /></span></li>)}
    </ul>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Comparison({ rows, selected, onSelect }) {
  return (
    <section className="card p-0">
      <div className="p-5 pb-3">
        <h2 className="font-semibold">Fit × Feasibility × Market</h2>
        <p className="text-xs text-slate-400">Fit and Feasibility come from your Praxio results. Market demand comes from cached, source-backed research.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-y border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2 font-semibold">Career</th>
              <th className="px-3 py-2 text-right font-semibold">Fit</th>
              <th className="px-3 py-2 text-right font-semibold">Feasibility</th>
              <th className="px-3 py-2 font-semibold">Market demand</th>
              <th className="px-5 py-2 font-semibold">Research</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.careerId} className={`border-b border-slate-800/70 last:border-0 ${r.careerId === selected ? 'bg-indigo-500/5' : ''}`}>
                <td className="px-5 py-3 font-medium">
                  <button className="text-left hover:text-indigo-300" onClick={() => onSelect(r.careerId)}>{r.name}</button>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.fit}%</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.feasibility != null ? <span>{r.feasibilityCategory.emoji} {r.feasibility}%</span> : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-3 py-3">{r.demand ? <DemandBadge level={r.demand} trend={r.trend} /> : <span className="text-xs text-slate-500">Not researched</span>}</td>
                <td className="px-5 py-3 text-xs">
                  {r.researchedAt
                    ? <span className={r.fresh ? 'text-slate-400' : 'text-amber-300'}>{new Date(r.researchedAt).toLocaleDateString()}{r.fresh ? '' : ' · outdated'}</span>
                    : <button className="font-semibold text-indigo-300 hover:text-indigo-200" onClick={() => onSelect(r.careerId)}>Research →</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SkillGap({ gap, sources }) {
  if (!gap.items.length) return <p className="text-sm text-slate-500">The research did not name specific skills.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Market skill</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">You</th>
            <th className="py-2 pl-3 font-semibold">Learn it with</th>
          </tr>
        </thead>
        <tbody>
          {gap.items.map((i) => (
            <tr key={i.skill} className="border-b border-slate-800/60 last:border-0 align-top">
              <td className="py-2 pr-3 font-medium">{i.skill}<Cite ids={i.sources} sources={sources} /></td>
              <td className="px-3 py-2 text-xs capitalize text-slate-400">{i.category}</td>
              <td className={`px-3 py-2 text-xs font-semibold ${STATUS[i.status].tone}`}>{STATUS[i.status].icon} {STATUS[i.status].label}</td>
              <td className="py-2 pl-3 text-xs text-slate-400">
                {i.status === 'demonstrated' ? '—' : i.courses.length ? i.courses.map((c) => `${c.title} · ${c.module}`).join('; ') : 'No catalog course yet'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        <strong>Demonstrated</strong> means proven by a passed project evaluation. Completing a course module counts only as <strong>learned</strong>.
      </p>
    </div>
  );
}

function Report({ record, gap, insights, summary, fresh, onRefresh, busy }) {
  const m = record.market;
  const s = record.sources;
  const byScope = (scope) => m.regions.filter((r) => r.scope === scope);
  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2 text-xs ${fresh.fresh ? 'border-slate-800 text-slate-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
        <span>{fresh.label} · cached research, not live · confidence {record.confidence}/100</span>
        <button className="btn-ghost px-3 py-1 text-xs" disabled={busy} onClick={onRefresh}>{busy ? 'Researching…' : 'Refresh market intelligence'}</button>
      </div>

      <section className="card border-indigo-500/40 bg-indigo-500/5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">What this means for you</p>
        <p className="mt-2 text-slate-200">{summary}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Market outlook">
          <DemandBadge level={m.demand.level} trend={m.demand.trend} />
          <p className="mt-3 text-sm text-slate-300">{m.demand.summary || 'No source-backed demand summary found.'}<Cite ids={m.demand.sources} sources={s} /></p>
        </Section>
        <Section title={`Salary outlook${m.salary.region ? ` · ${m.salary.region}` : ''}`}>
          <ul className="space-y-2 text-sm">
            {[['Entry', m.salary.entry_level], ['Mid', m.salary.mid_level], ['Senior', m.salary.senior_level]].map(([k, b]) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="text-slate-400">{k}</span>
                {b ? <span className="font-semibold tabular-nums">{b.range}<Cite ids={b.sources} sources={s} /></span> : <span className="text-slate-500">Not found in sources</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Where the opportunities are">
        <div className="grid gap-4 sm:grid-cols-3">
          {[['india', 'India'], ['global', 'Global'], ['remote', 'Remote']].map(([scope, label]) => (
            <div key={scope}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              {byScope(scope).length
                ? <ul className="space-y-1 text-sm text-slate-300">{byScope(scope).map((r) => <li key={r.region}>{r.region}<Cite ids={r.sources} sources={s} /></li>)}</ul>
                : <p className="text-sm text-slate-500">No evidence found</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Your skill gaps vs. the market"><SkillGap gap={gap} sources={s} /></Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Education expectations">
          <ClaimList items={m.education_expectations} sources={s} />
          {m.alternative_pathways.length > 0 && <><p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Alternative pathways</p><ClaimList items={m.alternative_pathways} sources={s} /></>}
          {m.exams_certifications.length > 0 && <><p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Exams & certifications</p><ClaimList items={m.exams_certifications} sources={s} /></>}
        </Section>
        <Section title="Industry">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Industries hiring</p>
          <ClaimList items={m.industries_hiring} sources={s} />
          <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Trends</p>
          <ClaimList items={m.industry_trends} sources={s} />
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Opportunities for you">
          {insights.opportunities.length ? (
            <ul className="space-y-2 text-sm">
              {insights.opportunities.map((o, i) => (
                <li key={i} className="flex gap-2"><span className="text-emerald-400">✓</span><span className="text-slate-300">{o.text}<Cite ids={o.sources} sources={s} />{o.basis !== 'market' && <span className="block text-[11px] text-slate-500">Based on {o.basis}</span>}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">None found in current sources.</p>}
        </Section>
        <Section title="Potential risks">
          {insights.threats.length ? (
            <ul className="space-y-2 text-sm">
              {insights.threats.map((t, i) => (
                <li key={i} className="flex gap-2"><span className="text-amber-400">!</span><span className="text-slate-300">{t.text}<Cite ids={t.sources} sources={s} />{t.basis !== 'market' && <span className="block text-[11px] text-slate-500">Based on {t.basis}</span>}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">None found in current sources.</p>}
        </Section>
      </div>

      <Section title={`Sources (${s.length})`}>
        <ol className="space-y-1.5 text-sm">
          {s.map((src) => (
            <li key={src.id} className="flex gap-2">
              <span className="w-6 shrink-0 text-xs text-slate-500">[{src.id}]</span>
              <span>
                <a href={src.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">{src.title}</a>
                <span className="text-xs text-slate-500"> · {src.publisher}{src.published_at ? ` · published ${src.published_at}` : ''} · accessed {new Date(src.accessed_at).toLocaleDateString()}</span>
              </span>
            </li>
          ))}
        </ol>
        {record.limitations && <p className="mt-3 text-xs text-slate-500">Limitations: {record.limitations}</p>}
        <p className="mt-2 text-xs text-slate-500">Researched {new Date(record.researched_at).toLocaleString()} via {record.provider} ({record.model}). Kept for {MARKET_INTELLIGENCE_TTL_DAYS} days before it counts as outdated.</p>
      </Section>
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module 4</p>
        <h1 className="text-2xl font-bold">Market intelligence</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Is the career relevant in today&rsquo;s market, and what will make you competitive? Research uses live web
          sources through Praxio&rsquo;s AI gateway; every claim links to its source. Your Career Fit and Feasibility scores are never changed by it.
        </p>
        {!isComplete(inputs) && (
          <p className="mt-2 text-xs text-amber-300">
            Feasibility not completed, so the comparison shows Fit and Market only.{' '}
            <button className="font-semibold underline" onClick={onGoFeasibility}>Check feasibility</button>
          </p>
        )}
      </div>

      <Comparison rows={rows} selected={selected} onSelect={(id) => { setSelected(id); setNotice(null); }} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="label mb-0" htmlFor="mi-career">Career</label>
        <select id="mi-career" className="input w-auto" value={selected} onChange={(e) => { setSelected(e.target.value); setNotice(null); }}>
          {recs.map((r) => <option key={r.domainId} value={r.domainId}>{CAREER_BY_ID[r.domainId]?.name}</option>)}
        </select>
      </div>

      {notice && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {UNAVAILABLE_MESSAGE}
          {record ? ` Showing previously researched market intelligence from ${new Date(record.researched_at).toLocaleDateString()}.` : ''}
          {notice.reason && <span className="block text-xs text-rose-300/80">{notice.reason}</span>}
        </p>
      )}

      {!record && (
        <section className="card space-y-3 text-center">
          <h2 className="text-lg font-semibold">No market research yet for {CAREER_BY_ID[selected]?.name}</h2>
          <p className="mx-auto max-w-lg text-sm text-slate-400">
            Praxio will search current, reputable sources for demand, salaries, regions, skills and trends, then compare
            the skills employers ask for with the skills you&rsquo;ve demonstrated. This can take up to a minute.
          </p>
          <button className="btn-primary" disabled={busy} onClick={() => research(false)}>{busy ? 'Researching current market…' : 'Research market'}</button>
        </section>
      )}

      {record && (
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
    </div>
  );
}
