import { useEffect, useRef, useState } from 'react';
import { APTITUDES, BRANCHES, INTERESTS, PREFERENCES, TRAITS } from '../lib/features.js';
import { APTITUDE_QUIZ, scoreQuiz } from '../lib/quiz.js';

const STEPS = ['About you', 'Interests', 'Aptitude', 'Quick check', 'Preferences', 'You as a person'];

function Likert({ value, onChange, low = 'Not at all', high = 'Very much' }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`h-9 flex-1 rounded-lg border text-sm font-semibold transition ${
              value === n ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function LikertGroup({ items, values, onChange, low, high }) {
  return (
    <div className="space-y-5">
      {items.map((it) => (
        <div key={it.key}>
          <p className="mb-2 text-sm font-medium">{it.label}</p>
          <Likert value={values[it.key]} onChange={(v) => onChange((prev) => ({ ...prev, [it.key]: v }))} low={low} high={high} />
        </div>
      ))}
    </div>
  );
}

const answered = (items, values) => items.every((it) => values[it.key] != null);

export const ASSESSMENT_STEPS = STEPS.length;

// initial: profile-shaped answers (a saved draft or the current profile).
// initialStep / initialQuiz restore an unfinished attempt; onProgress persists it.
export default function Onboarding({ initial, initialStep = 0, initialQuiz, onComplete, onCancel, onProgress }) {
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [basics, setBasics] = useState({
    full_name: initial?.full_name ?? '',
    branch: initial?.branch ?? '',
    year_of_study: initial?.year_of_study ?? '',
  });
  const [interests, setInterests] = useState(initial?.interests ?? {});
  const [aptitude, setAptitude] = useState(initial?.aptitude ?? {});
  const [quiz, setQuiz] = useState(() =>
    APTITUDE_QUIZ.map((_, i) => (Array.isArray(initialQuiz) && initialQuiz[i] != null ? initialQuiz[i] : null))
  );
  const [preferences, setPreferences] = useState(
    initial?.preferences && Object.keys(initial.preferences).length
      ? initial.preferences
      : Object.fromEntries(PREFERENCES.map((p) => [p.key, 50]))
  );
  const [traits, setTraits] = useState(initial?.traits ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const draft = () => ({ ...basics, interests, aptitude, preferences, traits });
  // Persist progress whenever the student moves between steps (not on every click).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    onProgress?.(step, draft(), quiz);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAndExit = async () => {
    await onProgress?.(step, draft(), quiz);
    onCancel();
  };

  const canNext = [
    basics.full_name.trim() && basics.branch && basics.year_of_study,
    answered(INTERESTS, interests),
    answered(APTITUDES, aptitude),
    true, // the quick check is optional; unanswered items are skipped
    true,
    answered(TRAITS, traits),
  ][step];

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const measured = scoreQuiz(quiz);
      await onComplete({
        full_name: basics.full_name.trim(),
        branch: basics.branch,
        year_of_study: Number(basics.year_of_study),
        interests,
        aptitude,
        // Keep a previous measurement if the student skipped the quiz this time.
        aptitude_quiz: Object.keys(measured).length ? measured : initial?.aptitude_quiz ?? {},
        preferences,
        traits,
      }, quiz);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold">{STEPS[step]}</h1>
        </div>
        {onCancel && <button className="btn-ghost" onClick={onProgress ? saveAndExit : onCancel}>{onProgress ? 'Save & exit' : 'Cancel'}</button>}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="card">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="label">Your name</label>
              <input className="input" value={basics.full_name} onChange={(e) => setBasics({ ...basics, full_name: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Engineering branch</label>
                <select className="input" value={basics.branch} onChange={(e) => setBasics({ ...basics, branch: e.target.value })}>
                  <option value="">Select…</option>
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Year of study</label>
                <select className="input" value={basics.year_of_study} onChange={(e) => setBasics({ ...basics, year_of_study: e.target.value })}>
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mb-5 text-sm text-slate-400">How much do you enjoy each of these? Go with your gut, not with what seems impressive.</p>
            <LikertGroup items={INTERESTS} values={interests} onChange={setInterests} />
          </>
        )}

        {step === 2 && (
          <>
            <p className="mb-5 text-sm text-slate-400">How strong do you think you are at each? Next, a short check adds a measured signal.</p>
            <LikertGroup items={APTITUDES} values={aptitude} onChange={setAptitude} low="Weak" high="Strong" />
          </>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">Eight quick questions. Optional, but they make your results more reliable. Skip any you like.</p>
            {APTITUDE_QUIZ.map((item, i) => (
              <div key={i}>
                <p className="mb-2 text-sm font-medium">{i + 1}. {item.q}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {item.opts.map((opt, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => setQuiz((prev) => prev.map((a, k) => (k === i ? j : a)))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        quiz[i] === j ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">Where do you sit between each pair? There are no right answers.</p>
            {PREFERENCES.map((p) => (
              <div key={p.key}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={preferences[p.key]}
                  onChange={(e) => { const v = Number(e.target.value); setPreferences((prev) => ({ ...prev, [p.key]: v })); }}
                  className="w-full accent-indigo-500"
                  aria-label={`${p.left} to ${p.right}`}
                />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{p.left}</span>
                  <span>{p.right}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 5 && (
          <>
            <p className="mb-5 text-sm text-slate-400">How well does each statement describe you?</p>
            <LikertGroup items={TRAITS} values={traits} onChange={setTraits} low="Not like me" high="Very like me" />
          </>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn-primary" disabled={!canNext || busy} onClick={finish}>
              {busy ? 'Finding your matches…' : 'See my career matches'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
