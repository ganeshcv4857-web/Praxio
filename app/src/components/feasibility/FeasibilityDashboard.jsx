import { useState } from 'react';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { CAREER_COSTS, LEVEL_LABEL, formatCostRange } from '../../lib/feasibility/careerCosts.js';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS, RELOCATION_OPTIONS,
  RISK_LEVELS, WEIGHTS, byId,
} from '../../lib/feasibility/config.js';
import { FACTORS, categoryOf } from '../../lib/feasibility/scoring.js';
import ScoreBar from '../ScoreBar.jsx';
import FinancingPlan from './FinancingPlan.jsx';

// Tailwind needs literal class names, so category tones are mapped here.
const TONE = {
  high: { badge: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300', bar: 'bg-emerald-400' },
  moderate: { badge: 'border-amber-400/40 bg-amber-500/10 text-amber-300', bar: 'bg-amber-400' },
  barrier: { badge: 'border-rose-400/40 bg-rose-500/10 text-rose-300', bar: 'bg-rose-400' },
};
const STATUS_ICON = {
  good: <span className="text-emerald-400">✓</span>,
  warn: <span className="text-amber-400">⚠</span>,
  bad: <span className="text-rose-400">✗</span>,
};

function FeasibilityBadge({ result, size = 'sm' }) {
  const cat = categoryOf(result.category);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-semibold ${TONE[cat.id].badge} ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>
      {cat.emoji} {result.score}%{size === 'lg' && <span className="font-medium">· {cat.label}</span>}
    </span>
  );
}

function FeasibilityBar({ result }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${TONE[result.category].bar}`} style={{ width: `${Math.max(2, result.score)}%` }} />
    </div>
  );
}

function InputSummary({ inputs }) {
  const chips = [
    ['Income', byId(INCOME_BANDS, inputs.income_band)?.label],
    ['Budget', byId(BUDGET_BANDS, inputs.education_budget)?.label],
    ['Loan', byId(LOAN_OPTIONS, inputs.loan_willingness)?.label],
    ['Risk', byId(RISK_LEVELS, inputs.risk_tolerance)?.label],
    ['Study', byId(EDUCATION_OPTIONS, inputs.education_preference)?.label.replace(/^Open to /, '')],
    ['Relocate', byId(RELOCATION_OPTIONS, inputs.relocation)?.label],
  ];
  const priorities = (inputs.family_priorities ?? []).map((p) => byId(FAMILY_PRIORITIES, p)?.label).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {chips.map(([k, v]) => (
        <span key={k} className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
          <span className="text-slate-500">{k}:</span> {v}
        </span>
      ))}
      {priorities.length > 0 && (
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
          <span className="text-slate-500">Family values:</span> {priorities.join(', ')}
        </span>
      )}
    </div>
  );
}

function Comparison({ rows, sortBy, setSortBy }) {
  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="font-semibold">Side-by-side comparison</h2>
          <p className="text-xs text-slate-400">How well each career suits you vs. how achievable it is for your family.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1 text-xs">
          {[['fit', 'Sort by career fit'], ['feasibility', 'Sort by feasibility']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSortBy(id)}
              className={`rounded-lg px-2.5 py-1 font-semibold ${sortBy === id ? 'bg-slate-950 text-white' : 'text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2 font-semibold">Career</th>
              <th className="px-3 py-2 text-right font-semibold">Career fit</th>
              <th className="px-3 py-2 font-semibold">Feasibility</th>
              <th className="px-3 py-2 font-semibold">Typical cost</th>
              <th className="px-3 py-2 font-semibold">Risk</th>
              <th className="px-5 py-2 font-semibold">Main barrier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rec, result, career, cost }) => (
              <tr key={rec.domainId} className="border-b border-slate-800/70 last:border-0">
                <td className="px-5 py-3 font-medium">
                  <a href={`#feas-${rec.domainId}`} className="hover:text-indigo-300">{career.name}</a>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{Math.round(rec.score)}%</td>
                <td className="px-3 py-3"><FeasibilityBadge result={result} /></td>
                <td className="px-3 py-3 tabular-nums text-slate-300">{formatCostRange(cost.educationCost)}</td>
                <td className="px-3 py-3 text-slate-300">{LEVEL_LABEL[cost.financialRisk]}</td>
                <td className="px-5 py-3 text-slate-400">
                  {result.weakest ? FACTORS.find((f) => f.id === result.weakest).label : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeasibilityCard({ rec, result, career, cost, onOpenCareer }) {
  return (
    <article id={`feas-${rec.domainId}`} className="card scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match #{rec.rank}</p>
          <h3 className="text-lg font-semibold">{career.name}</h3>
        </div>
        <FeasibilityBadge result={result} size="lg" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Career fit</span><span className="tabular-nums text-slate-200">{Math.round(rec.score)}%</span>
          </div>
          <ScoreBar value={rec.score} className="mt-1" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Feasibility</span><span className="tabular-nums text-slate-200">{result.score}%</span>
          </div>
          <div className="mt-1"><FeasibilityBar result={result} /></div>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {FACTORS.map(({ id, label }) => {
          const f = result.factors[id];
          return (
            <li key={id} className="grid grid-cols-[1.25rem_1fr_auto] gap-x-2 text-sm">
              <span className="pt-0.5">{STATUS_ICON[f.status]}</span>
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-slate-400">{f.message}</p>
              </div>
              <span className="text-right text-xs tabular-nums text-slate-500">
                {f.score}<span className="text-slate-600">/100</span>
                <br />
                <span className="text-slate-600">× {Math.round(f.weight * 100)}%</span>
              </span>
            </li>
          );
        })}
      </ul>

      {result.financing && <FinancingPlan plan={result.financing} title="How the typical pathway would be paid for" />}

      <blockquote className="mt-5 rounded-xl border-l-2 border-indigo-400 bg-indigo-500/5 px-4 py-3 text-sm text-slate-200">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-300">Key consideration</p>
        {result.consideration}
      </blockquote>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Typical path: {formatCostRange(cost.educationCost)} · ~{cost.educationYears} yrs · complexity {LEVEL_LABEL[cost.pathwayComplexity].toLowerCase()}
        </span>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onOpenCareer(rec.domainId)}>See pathway</button>
      </div>
    </article>
  );
}

export default function FeasibilityDashboard({ inputs, results, recs, onEdit, onOpenCareer, onPlanLearning }) {
  const [sortBy, setSortBy] = useState('fit');
  const resultById = Object.fromEntries(results.map((r) => [r.domainId, r]));
  const rows = recs
    .filter((r) => resultById[r.domainId] && CAREER_BY_ID[r.domainId])
    .map((rec) => ({ rec, result: resultById[rec.domainId], career: CAREER_BY_ID[rec.domainId], cost: CAREER_COSTS[rec.domainId] }));
  const sorted = sortBy === 'fit' ? rows : [...rows].sort((a, b) => b.result.score - a.result.score || b.rec.score - a.rec.score);
  const counts = ['high', 'moderate', 'barrier'].map((id) => [id, rows.filter((r) => r.result.category === id).length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module 2</p>
          <h1 className="text-2xl font-bold">Career feasibility</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Your recommended careers, checked against your family's finances, education plans, risk comfort,
            location and priorities.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={onEdit}>Edit my answers</button>
          {onPlanLearning && <button className="btn-primary" onClick={onPlanLearning}>Plan my learning path →</button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card py-4">
          <p className="text-sm font-semibold">Career fit</p>
          <p className="mt-1 text-xs text-slate-400">How well a career matches your interests, abilities and preferences (from your assessment).</p>
        </div>
        <div className="card py-4">
          <p className="text-sm font-semibold">Feasibility</p>
          <p className="mt-1 text-xs text-slate-400">
            How realistically achievable it is given your family's practical constraints. Weighted: financial{' '}
            {WEIGHTS.financial * 100}%, education {WEIGHTS.education * 100}%, risk {WEIGHTS.risk * 100}%, family priorities{' '}
            {WEIGHTS.family * 100}%, location {WEIGHTS.location * 100}%.
          </p>
        </div>
      </div>

      <InputSummary inputs={inputs} />

      <div className="flex flex-wrap gap-2">
        {counts.map(([id, n]) => {
          const cat = categoryOf(id);
          return (
            <span key={id} className={`rounded-xl border px-3 py-1.5 text-sm ${TONE[id].badge}`}>
              {cat.emoji} <strong>{n}</strong> {cat.label}
            </span>
          );
        })}
      </div>

      <Comparison rows={sorted} sortBy={sortBy} setSortBy={setSortBy} />

      <div className="space-y-4">
        {sorted.map((r) => (
          <FeasibilityCard key={r.rec.domainId} {...r} onOpenCareer={onOpenCareer} />
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Cost, duration and risk figures are approximate prototype estimates for India, not financial advice.
      </p>
    </div>
  );
}
