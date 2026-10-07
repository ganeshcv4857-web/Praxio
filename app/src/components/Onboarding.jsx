import { useEffect, useRef, useState } from 'react';
import { APTITUDES, BRANCHES, INTERESTS, PREFERENCES, TRAITS } from '../lib/features.js';
import { APTITUDE_QUIZ, scoreQuiz } from '../lib/quiz.js';
import { ACTIVITIES, SCHOOL_STREAMS, STAGES, STAGE_PROFILES, userContext } from '../lib/userContext.js';

// Step ids → titles. Which steps a person sees depends on their stage (STAGE_PROFILES).
const STEP_TITLES = {
  stage: 'Where are you now?',
  about: 'About you',
  interests: 'Interests',
  aptitude: 'Aptitude',
  quiz: 'Quick check',
  preferences: 'Preferences',
  traits: 'You as a person',
};
export const stepsFor = (stage) => ['stage', ...(STAGE_PROFILES[stage] ?? STAGE_PROFILES.undergraduate).steps];
// Longest step list (used for progress text on the dashboard).
export const ASSESSMENT_STEPS = stepsFor('undergraduate').length;

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

function Chips({ options, value, onChange, columns = 'sm:grid-cols-2' }) {
  return (
    <div className={`grid gap-2 ${columns}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${value === o.id ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const answered = (items, values) => items.every((it) => values[it.key] != null);

// initial: profile-shaped answers (a saved draft or the current profile).
// initialStep / initialQuiz restore an unfinished attempt; onProgress persists it.
export default function Onboarding({ initial, initialStep = 0, initialQuiz, onComplete, onCancel, onProgress }) {
  const [context, setContext] = useState({
    current_stage: initial?.current_stage ?? '',
    current_activity: initial?.current_activity ?? '',
    primary_goal: initial?.primary_goal ?? '',
    school_stream: initial?.school_stream ?? '',
    current_role: initial?.current_role ?? '',
  });
  const stage = context.current_stage || null;
  const ctx = userContext({ current_stage: stage ?? undefined });
  const steps = stage ? stepsFor(stage) : ['stage'];
  const [step, setStep] = useState(() => Math.min(initialStep, (initial?.current_stage ? stepsFor(initial.current_stage) : ['stage']).length - 1));
  const stepId = steps[Math.min(step, steps.length - 1)];

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

  const chooseStage = (id) => {
    const p = STAGE_PROFILES[id];
    // Stage sets sensible defaults; the person can change activity and goal.
    setContext((c) => ({ ...c, current_stage: id, current_activity: p.activity, primary_goal: p.goals[0] }));
  };

  const draft = () => ({ ...basics, ...context, interests, aptitude, preferences, traits });
  // Persist progress whenever the person moves between steps (not on every click).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    onProgress?.(step, draft(), quiz);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAndExit = async () => {
    await onProgress?.(step, draft(), quiz);
    onCancel();
  };

  const asks = ctx.asks;
  const canNext = {
    stage: Boolean(stage && context.current_activity && context.primary_goal),
    about: Boolean(basics.full_name.trim()
      && (!asks.branch || basics.branch)
      && (!asks.year || basics.year_of_study)
      && (!asks.stream || context.school_stream)),
    interests: answered(INTERESTS, interests),
    aptitude: answered(APTITUDES, aptitude),
    quiz: true, // optional; unanswered items are skipped
    preferences: true,
    traits: answered(TRAITS, traits),
  }[stepId];

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const measured = scoreQuiz(quiz);
      await onComplete({
        full_name: basics.full_name.trim(),
        // Reused fields: branch = field of study, year_of_study = current year (students).
        branch: asks.branch ? basics.branch : null,
        year_of_study: asks.year && basics.year_of_study ? Number(basics.year_of_study) : null,
        current_stage: context.current_stage,
        current_activity: context.current_activity,
        primary_goal: context.primary_goal,
        school_stream: asks.stream ? context.school_stream || null : null,
        current_role: asks.role ? context.current_role.trim() || null : null,
        interests,
        aptitude,
        // Keep a previous measurement if the quiz was skipped this time.
        aptitude_quiz: Object.keys(measured).length ? measured : initial?.aptitude_quiz ?? {},
        // Stages that skip the preference step keep previous answers (or none).
        preferences: steps.includes('preferences') ? preferences : initial?.preferences ?? {},
        traits,
      }, quiz);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const isLast = step >= steps.length - 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            Step {Math.min(step, steps.length - 1) + 1} of {stage ? steps.length : '…'}
          </p>
          <h1 className="text-2xl font-bold">{STEP_TITLES[stepId]}</h1>
        </div>
        {onCancel && <button className="btn-ghost" onClick={onProgress ? saveAndExit : onCancel}>{onProgress ? 'Save & exit' : 'Cancel'}</button>}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((Math.min(step, steps.length - 1) + 1) / (stage ? steps.length : ASSESSMENT_STEPS)) * 100}%` }} />
      </div>

      <div className="card">
        {stepId === 'stage' && (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Where are you currently in your journey?</p>
              <Chips options={STAGES} value={stage} onChange={chooseStage} />
            </div>
            {stage && (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium">What are you mainly doing right now?</p>
                  <Chips options={ACTIVITIES} value={context.current_activity} onChange={(v) => setContext((c) => ({ ...c, current_activity: v }))} columns="sm:grid-cols-3" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">What do you most want help with?</p>
                  <Chips options={ctx.goalOptions} value={context.primary_goal} onChange={(v) => setContext((c) => ({ ...c, primary_goal: v }))} />
                </div>
                <p className="text-xs text-slate-500">Praxio focuses on {ctx.focus} for this stage.</p>
              </>
            )}
          </div>
        )}

        {stepId === 'about' && (
          <div className="space-y-4">
            <div>
              <label className="label">Your name</label>
              <input className="input" value={basics.full_name} onChange={(e) => setBasics({ ...basics, full_name: e.target.value })} />
            </div>
            {asks.stream && (
              <div>
                <label className="label">Your stream</label>
                <Chips options={SCHOOL_STREAMS} value={context.school_stream} onChange={(v) => setContext((c) => ({ ...c, school_stream: v }))} columns="sm:grid-cols-3" />
              </div>
            )}
            {(asks.branch || asks.year) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {asks.branch && (
                  <div>
                    <label className="label">{ctx.group === 'college' ? 'Branch / field of study' : 'Degree field'}</label>
                    <select className="input" value={basics.branch} onChange={(e) => setBasics({ ...basics, branch: e.target.value })}>
                      <option value="">Select…</option>
                      {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                )}
                {asks.year && (
                  <div>
                    <label className="label">Year of study</label>
                    <select className="input" value={basics.year_of_study} onChange={(e) => setBasics({ ...basics, year_of_study: e.target.value })}>
                      <option value="">Select…</option>
                      {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            {asks.role && (
              <div>
                <label className="label">{stage === 'career_switcher' ? 'Your current or most recent role' : 'Your current role'}</label>
                <input className="input" placeholder="e.g. Mechanical design engineer, Sales executive" value={context.current_role} onChange={(e) => setContext((c) => ({ ...c, current_role: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">Used to point out skills that carry over to a new field.</p>
              </div>
            )}
            {ctx.group === 'graduate' && (
              <p className="text-xs text-slate-500">After your matches, the Market tab shows which skills employers ask for that you haven&rsquo;t proven yet.</p>
            )}
          </div>
        )}

        {stepId === 'interests' && (
          <>
            <p className="mb-5 text-sm text-slate-400">How much do you enjoy each of these? Go with your gut, not with what seems impressive.</p>
            <LikertGroup items={INTERESTS} values={interests} onChange={setInterests} />
          </>
        )}

        {stepId === 'aptitude' && (
          <>
            <p className="mb-5 text-sm text-slate-400">How strong do you think you are at each? Next, a short check adds a measured signal.</p>
            <LikertGroup items={APTITUDES} values={aptitude} onChange={setAptitude} low="Weak" high="Strong" />
          </>
        )}

        {stepId === 'quiz' && (
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

        {stepId === 'preferences' && (
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

        {stepId === 'traits' && (
          <>
            <p className="mb-5 text-sm text-slate-400">How well does each statement describe you?</p>
            <LikertGroup items={TRAITS} values={traits} onChange={setTraits} low="Not like me" high="Very like me" />
          </>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {!isLast || !stage ? (
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
