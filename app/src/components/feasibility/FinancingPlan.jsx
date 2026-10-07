// Financing interpretation + required actions for one pathway (Review 1).
// Qualitative only: never shows family amounts.
import { FINANCING_STATUS, financingSummary } from '../../lib/feasibility/financing.js';

const TONE = { good: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10', warn: 'text-amber-200 border-amber-400/30 bg-amber-500/10', bad: 'text-rose-200 border-rose-400/30 bg-rose-500/10' };
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
  const status = FINANCING_STATUS[plan.status];
  return (
    <section className="mt-5 rounded-xl border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[status.tone]}`}>{status.label}</span>
      </div>
      <p className="mt-2 text-sm text-slate-300">{financingSummary(plan)}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-left uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 font-semibold">Action</th>
              <th className="px-3 py-1.5 font-semibold">Who</th>
              <th className="px-3 py-1.5 font-semibold">When</th>
              <th className="py-1.5 pl-3 font-semibold">{actions[0]?.support ? 'Family support' : 'Need'}</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id} className="border-b border-slate-800/60 last:border-0 align-top">
                <td className="py-1.5 pr-3 text-slate-200">{a.label}{a.note && <span className="block text-[11px] text-slate-500">{a.note}</span>}</td>
                <td className="px-3 py-1.5 text-slate-300">{PARTY_LABEL[a.party] ?? a.party}</td>
                <td className="px-3 py-1.5 text-slate-400">{TIMING_LABEL[a.timing] ?? a.timing}</td>
                <td className={`py-1.5 pl-3 font-semibold ${a.support ? SUPPORT[a.support].tone : 'text-slate-400'}`}>{a.support ? SUPPORT[a.support].label : REQ_LABEL[a.requirement]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
