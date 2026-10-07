import { useMemo, useState } from 'react';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS,
  PRIMARY_FUNDERS, RELOCATION_OPTIONS, RISK_LEVELS, SCHOLARSHIP_OPTIONS,
} from '../../lib/feasibility/config.js';
import { CATALOG, QUESTION_BY_ID, WORKING_STAGES } from '../../lib/assessment/catalog.js';
import { planAssessment } from '../../lib/assessment/planner.js';

// Which questions appear (and in which wording) comes from the assessment planner for the
// person's stage; the page layout and styling are unchanged.
const PAGE_TITLES = { finances: 'Family & finances', education: 'Education & location', priorities: 'Family priorities' };

function Choice({ options, value, onChange, multi = false, columns = 'sm:grid-cols-3' }) {
  const selected = (id) => (multi ? value.includes(id) : value === id);
  const toggle = (id) => {
    if (!multi) return onChange(id);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className={`grid gap-2 ${columns}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => toggle(o.id)}
          aria-pressed={selected(o.id)}
          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            selected(o.id)
              ? 'border-indigo-400 bg-indigo-500/20 text-white'
              : 'border-slate-700 text-slate-300 hover:bg-slate-800'
          }`}
        >
          {multi && <span className="mr-2 text-indigo-300">{selected(o.id) ? '☑' : '☐'}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Question({ title, hint, children }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

const EMPTY = {
  income_band: '',
  education_budget: '',
  loan_willingness: '',
  risk_tolerance: '',
  education_preference: '',
  location_preference: '',
  relocation: '',
  family_priorities: [],
  primary_funder: 'family',      // who pays upfront (defaults keep older rows valid)
  scholarship_interest: 'no',
};

export default function FeasibilityWizard({ initial, careerCount, onSubmit, onCancel, stage = 'undergraduate' }) {
  const working = WORKING_STAGES.includes(stage);
  const [step, setStep] = useState(0);
  // Working people are not assumed to be family-funded: they choose who pays.
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(working ? { primary_funder: '' } : {}), ...pickInputs(initial) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const plan = useMemo(() => planAssessment({ stage }, form, CATALOG, { assessment: 'feasibility' }), [stage, form]);
  const pages = plan.pages;
  // The priorities page can disappear (funder → self) while it is open: clamp the step.
  const at = Math.min(step, pages.length - 1);
  const page = pages[at];
  const STEPS = pages.map((p) => (p.id === 'finances' && working ? 'Finances' : PAGE_TITLES[p.id]));
  const shows = (id) => page.questions.includes(id);
  const canNext = page.complete;
  const label = (id, fallback) => (working && QUESTION_BY_ID[id].workingLabel) || fallback;
  const educationOptions = EDUCATION_OPTIONS.map((o) => ({ ...o, label: QUESTION_BY_ID.education_preference.optionLabels[stage]?.[o.id] ?? o.label }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      // Hidden questions create no answers; a retired, unanswered location is not sent at all.
      const { location_preference, ...rest } = form;
      await onSubmit({
        ...rest,
        family_priorities: plan.visible.includes('family_priorities') ? form.family_priorities : [],
        ...(location_preference ? { location_preference } : {}),
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            Career feasibility · Step {at + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold">{STEPS[at]}</h1>
        </div>
        {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="card space-y-6">
        {page.id === 'finances' && (
          <>
            <p className="text-sm text-slate-400">
              Rough answers are fine. These help check whether your {careerCount} recommended careers are realistic
              for {working ? 'you' : 'your family'}. Nothing here changes your career-fit scores.
            </p>
            <Question title={label('income_band', 'Annual family income')}>
              <Choice options={INCOME_BANDS} value={form.income_band} onChange={set('income_band')} />
            </Question>
            <Question title="Who will mainly pay for your education upfront?">
              <Choice options={PRIMARY_FUNDERS} value={form.primary_funder} onChange={set('primary_funder')} />
            </Question>
            <Question title="How much can be spent on your education upfront?" hint="From whoever pays, without loans. Total for the whole path, including any further study.">
              <Choice options={BUDGET_BANDS} value={form.education_budget} onChange={set('education_budget')} />
            </Question>
            <Question title="Would you take an education loan?">
              <Choice options={LOAN_OPTIONS} value={form.loan_willingness} onChange={set('loan_willingness')} />
            </Question>
            <Question title="Will you apply for scholarships?" hint="Scholarships are never counted as guaranteed money.">
              <Choice options={SCHOLARSHIP_OPTIONS} value={form.scholarship_interest} onChange={set('scholarship_interest')} />
            </Question>
            <Question title={label('risk_tolerance', "Your family's comfort with financial risk")} hint="e.g. a longer, costlier path or less predictable income early on.">
              <Choice options={RISK_LEVELS} value={form.risk_tolerance} onChange={set('risk_tolerance')} />
            </Question>
          </>
        )}

        {page.id === 'education' && (
          <>
            <Question title="How much additional education are you comfortable pursuing?">
              <Choice options={educationOptions} value={form.education_preference} onChange={set('education_preference')} columns="sm:grid-cols-2" />
            </Question>
            <Question title="Are you willing to relocate?">
              <Choice options={RELOCATION_OPTIONS} value={form.relocation} onChange={set('relocation')} />
            </Question>
          </>
        )}

        {page.id === 'priorities' && shows('family_priorities') && (
          <Question title="What matters most to your family when choosing a career?" hint="Select all that apply, or none.">
            <Choice options={FAMILY_PRIORITIES} value={form.family_priorities} onChange={set('family_priorities')} multi columns="sm:grid-cols-2" />
          </Question>
        )}

        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <div className="flex justify-between pt-2">
          <button className="btn-ghost" disabled={at === 0} onClick={() => setStep(at - 1)}>Back</button>
          {at < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep(at + 1)}>Continue</button>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Calculating…' : 'Calculate feasibility'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Just the input columns from a stored feasibility row. */
export function pickInputs(row) {
  if (!row) return {};
  return Object.fromEntries(Object.keys(EMPTY).filter((k) => row[k] != null).map((k) => [k, row[k]]));
}
