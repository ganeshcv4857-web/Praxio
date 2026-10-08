// Financing interpretation + required actions for one pathway (Review 1).
// Qualitative only: never shows family amounts. Steps stay collapsed until asked for.
import { useState } from 'react';
import { FINANCING_STATUS, financingSummary } from '../../lib/feasibility/financing.js';
import { Status } from '../ui/kit.jsx';

export const PARTY_LABEL = { student: 'You', family: 'Family', 'student+family': 'You + family' };
export const TIMING_LABEL = { before_start: 'Before admission', during_study: 'Before / during study', after_degree: 'After your degree', after_study: 'After study' };
const REQ_LABEL = { required: 'Required', conditional: 'If needed', optional: 'Optional' };
export const SUPPORT = {
  supported: { label: 'Supported', tone: 'text-emerald-300' },
  conditional: { label: 'Conditional', tone: 'text-amber-300' },
  not_supported: { label: 'Not supported', tone: 'text-rose-300' },
  unknown: { label: 'Unknown', tone: 'text-slate-400' },
};

export default function FinancingPlan({ plan, actions = plan.actions, title = 'How this path would be paid for' }) {
  const [open, setOpen] = useState(false);
  const status = FINANCING_STATUS[plan.status];
  return (
    <section className="mt-6 rounded-2xl bg-slate-950/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[15px] font-medium">{title}</h4>
        <Status tone={status.tone}>{status.label}</Status>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{financingSummary(plan)}</p>
      {actions.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 min-h-[40px] text-sm font-medium text-indigo-300 hover:text-slate-100">
            {open ? 'Hide steps' : `Show ${actions.length} step${actions.length === 1 ? '' : 's'} →`}
          </button>
          {open && (
            <ol className="mt-2 space-y-3">
              {actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] text-slate-200">{a.label}</div>
                    <div className="text-sm text-slate-500">{PARTY_LABEL[a.party] ?? a.party} · {TIMING_LABEL[a.timing] ?? a.timing}{a.note ? ` · ${a.note}` : ''}</div>
                  </div>
                  <span className={`text-sm font-medium ${a.support ? SUPPORT[a.support].tone : 'text-slate-400'}`}>{a.support ? SUPPORT[a.support].label : REQ_LABEL[a.requirement]}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
