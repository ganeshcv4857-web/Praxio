import { useState } from 'react';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { CAREER_COSTS, LEVEL_LABEL, formatCostRange } from '../../lib/feasibility/careerCosts.js';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS, RELOCATION_OPTIONS,
  RISK_LEVELS, WEIGHTS, byId,
} from '../../lib/feasibility/config.js';
import { FACTORS } from '../../lib/feasibility/scoring.js';
import FinancingPlan from './FinancingPlan.jsx';
import { Btn, Fact, Meter, More, PageHead, Row, Rows, Status, Summary } from '../ui/kit.jsx';

// Module 2 results. Answer first (how many paths are realistic), one row per career,
// and the factor breakdown / financing only when a row is opened.

const CAT = {
  high: { tone: 'good', label: 'Realistic', bar: 'bg-emerald-400' },
  moderate: { tone: 'warn', label: 'Trade-offs', bar: 'bg-amber-400' },
  barrier: { tone: 'bad', label: 'Real barrier', bar: 'bg-rose-400' },
};
const FACTOR_TONE = { good: 'good', warn: 'warn', bad: 'bad' };
const FACTOR_WORD = { good: 'Clear', warn: 'Partial', bad: 'Barrier' };
const factorLabel = (id) => FACTORS.find((f) => f.id === id)?.label;

function CareerRow({ rec, result, career, cost, onOpenCareer, open, onToggle }) {
  const cat = CAT[result.category];
  return (
    <Row
      open={open}
      onToggle={onToggle}
      title={career.name}
      sub={result.weakest ? `Main issue: ${factorLabel(result.weakest).toLowerCase()}` : 'Nothing you told us stands in the way'}
      meta={<Status tone={cat.tone}>{cat.label}</Status>}
    >
      <p className="max-w-2xl text-[17px] leading-relaxed text-slate-200">{result.consideration}</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Meter label="Career fit" value={rec.score} right={`${Math.round(rec.score)}%`} />
        <Meter label="Feasibility" value={result.score} right={`${result.score}%`} tone={cat.bar} />
      </div>

      <ul className="mt-6 divide-y divide-slate-800 rounded-2xl bg-slate-950/40">
        {FACTORS.map(({ id, label }) => {
          const f = result.factors[id];
          return (
            <li key={id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{label}</div>
                <div className="text-sm text-slate-400">{f.message}</div>
              </div>
              <Status tone={FACTOR_TONE[f.status]}>{FACTOR_WORD[f.status]}</Status>
            </li>
          );
        })}
      </ul>

      {result.financing && <FinancingPlan plan={result.financing} title="How it would be paid for" />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          Typical path: {formatCostRange(cost.educationCost)} · ~{cost.educationYears} yrs · {LEVEL_LABEL[cost.financialRisk].toLowerCase()} financial risk
        </span>
        <Btn kind="ghost" onClick={() => onOpenCareer(rec.domainId)}>See pathway →</Btn>
      </div>
    </Row>
  );
}

function YourAnswers({ inputs }) {
  const rows = [
    ['Family income', byId(INCOME_BANDS, inputs.income_band)?.label],
    ['Education budget', byId(BUDGET_BANDS, inputs.education_budget)?.label],
    ['Loan', byId(LOAN_OPTIONS, inputs.loan_willingness)?.label],
    ['Risk comfort', byId(RISK_LEVELS, inputs.risk_tolerance)?.label],
    ['Study plans', byId(EDUCATION_OPTIONS, inputs.education_preference)?.label],
    ['Relocation', byId(RELOCATION_OPTIONS, inputs.relocation)?.label],
    ['Family values', (inputs.family_priorities ?? []).map((p) => byId(FAMILY_PRIORITIES, p)?.label).filter(Boolean).join(', ') || null],
  ].filter(([, v]) => v);
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-200">{v}</dd></div>)}
    </dl>
  );
}

export default function FeasibilityDashboard({ inputs, results, recs, onEdit, onOpenCareer, onPlanLearning }) {
  const [sortBy, setSortBy] = useState('fit');
  const [openId, setOpenId] = useState(null);
  const resultById = Object.fromEntries(results.map((r) => [r.domainId, r]));
  const rows = recs
    .filter((r) => resultById[r.domainId] && CAREER_BY_ID[r.domainId])
    .map((rec) => ({ rec, result: resultById[rec.domainId], career: CAREER_BY_ID[rec.domainId], cost: CAREER_COSTS[rec.domainId] }));
  const sorted = sortBy === 'fit' ? rows : [...rows].sort((a, b) => b.result.score - a.result.score || b.rec.score - a.rec.score);
  const n = (id) => rows.filter((r) => r.result.category === id).length;
  const realistic = n('high');
  const best = [...rows].sort((a, b) => b.result.score - a.result.score)[0];

  const headline = realistic
    ? `${realistic} of ${rows.length} paths are realistic for you.`
    : n('moderate')
      ? `No path is free of trade-offs, but ${n('moderate')} can work.`
      : 'Every path has a real barrier right now.';

  return (
    <div>
      <PageHead eyebrow="Feasibility" title="How realistic is" accent="each path?" lede={headline}>
        <Btn kind="ghost" onClick={onEdit}>Edit answers</Btn>
        {onPlanLearning && <Btn onClick={onPlanLearning}>Plan learning →</Btn>}
      </PageHead>

      <Summary>
        {n('high') > 0 && <Status tone="good">{n('high')} realistic</Status>}
        {n('moderate') > 0 && <Status tone="warn">{n('moderate')} with trade-offs</Status>}
        {n('barrier') > 0 && <Status tone="bad">{n('barrier')} blocked</Status>}
        <span className="flex-1" />
        <div role="group" aria-label="Sort" className="flex rounded-full bg-slate-800 p-1 text-sm">
          {[['fit', 'Best fit first'], ['feasibility', 'Most realistic first']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSortBy(id)} aria-pressed={sortBy === id}
              className={`min-h-[36px] rounded-full px-4 ${sortBy === id ? 'bg-slate-900 text-slate-100 shadow-[var(--shadow)]' : 'text-slate-400'}`}>{label}</button>
          ))}
        </div>
      </Summary>

      <Rows>
        {sorted.map((r) => (
          <CareerRow key={r.rec.domainId} {...r} onOpenCareer={onOpenCareer}
            open={openId === r.rec.domainId || (openId === null && r === (sortBy === 'fit' ? sorted[0] : best))}
            onToggle={(o) => setOpenId(o ? r.rec.domainId : '')} />
        ))}
      </Rows>

      <div className="mt-10 space-y-1">
        <More label="Based on your answers"><YourAnswers inputs={inputs} /></More>
        <More label="How feasibility is calculated">
          Career fit is how well a career matches your interests and abilities. Feasibility is how achievable it is given
          your family's practical situation, weighted: financial {WEIGHTS.financial * 100}%, education {WEIGHTS.education * 100}%,
          risk {WEIGHTS.risk * 100}%, family priorities {WEIGHTS.family * 100}%, location {WEIGHTS.location * 100}%.
          Costs, durations and risk levels are approximate estimates for India, not financial advice.
        </More>
      </div>
    </div>
  );
}
