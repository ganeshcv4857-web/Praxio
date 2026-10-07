import { useState } from 'react';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS, LOCATION_OPTIONS,
  RELOCATION_OPTIONS, RISK_LEVELS,
} from '../../lib/feasibility/config.js';

const STEPS = ['Family & finances', 'Education & location', 'Family priorities'];

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
};

export default function FeasibilityWizard({ initial, careerCount, onSubmit, onCancel }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({ ...EMPTY, ...pickInputs(initial) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const canNext = [
    form.income_band && form.education_budget && form.loan_willingness && form.risk_tolerance,
    form.education_preference && form.location_preference && form.relocation,
    true, // priorities are optional
  ][step];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit(form);
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
            Career feasibility · Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold">{STEPS[step]}</h1>
        </div>
        {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="card space-y-6">
        {step === 0 && (
          <>
            <p className="text-sm text-slate-400">
              Rough answers are fine. These help check whether your {careerCount} recommended careers are realistic
              for your family. Nothing here changes your career-fit scores.
            </p>
            <Question title="Annual family income">
              <Choice options={INCOME_BANDS} value={form.income_band} onChange={set('income_band')} />
            </Question>
            <Question title="How much can your family reasonably spend on your education?" hint="Total for the whole path, including any further study.">
              <Choice options={BUDGET_BANDS} value={form.education_budget} onChange={set('education_budget')} />
            </Question>
            <Question title="Would you take an education loan?">
              <Choice options={LOAN_OPTIONS} value={form.loan_willingness} onChange={set('loan_willingness')} />
            </Question>
            <Question title="Your family's comfort with financial risk" hint="e.g. a longer, costlier path or less predictable income early on.">
              <Choice options={RISK_LEVELS} value={form.risk_tolerance} onChange={set('risk_tolerance')} />
            </Question>
          </>
        )}

        {step === 1 && (
          <>
            <Question title="How much additional education are you comfortable pursuing?">
              <Choice options={EDUCATION_OPTIONS} value={form.education_preference} onChange={set('education_preference')} columns="sm:grid-cols-2" />
            </Question>
            <Question title="Preferred study / work location">
              <Choice options={LOCATION_OPTIONS} value={form.location_preference} onChange={set('location_preference')} columns="sm:grid-cols-2" />
            </Question>
            <Question title="Are you willing to relocate?">
              <Choice options={RELOCATION_OPTIONS} value={form.relocation} onChange={set('relocation')} />
            </Question>
          </>
        )}

        {step === 2 && (
          <Question title="What matters most to your family when choosing a career?" hint="Select all that apply, or none.">
            <Choice options={FAMILY_PRIORITIES} value={form.family_priorities} onChange={set('family_priorities')} multi columns="sm:grid-cols-2" />
          </Question>
        )}

        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <div className="flex justify-between pt-2">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
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
