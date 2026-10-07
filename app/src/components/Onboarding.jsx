import { useEffect, useMemo, useRef, useState } from 'react';
import { BRANCHES } from '../lib/features.js';
import { APTITUDE_QUIZ, scoreQuiz } from '../lib/quiz.js';
import { SCHOOL_STREAMS, STAGES, STAGE_PROFILES, userContext } from '../lib/userContext.js';
import { CATALOG, PAGES, RETIRED } from '../lib/assessment/catalog.js';
import { UNKNOWN, planAssessment, readAnswers, writeAnswers } from '../lib/assessment/planner.js';

// Pages and the questions on them come from the assessment planner (stage, goal and previous
// answers decide what is asked). This component only renders and stores what the plan shows.
const PAGE_TITLES = {
  stage: 'Where are you now?',
  about: 'About you',
  interests: 'Interests',
  aptitude: 'Aptitude',
  quiz: 'Quick check',
  preferences: 'Preferences',
  traits: 'You as a person',
};
const PAGE_INTRO = {
  interests: 'How much do you enjoy each of these? Go with your gut, not with what seems impressive. Choose “Not sure” if you honestly can’t say.',
  aptitude: 'How strong do you think you are at each? Next, a short check adds a measured signal.',
  quiz: 'Eight quick questions. Optional, but they make your results more reliable. Skip any you like.',
  preferences: 'Where do you sit between each pair? There are no right answers. Leave a slider untouched, or choose “Not sure”, if you don’t know yet.',
  traits: 'How well does each statement describe you?',
};
const LIKERT_ENDS = { aptitude: ['Weak', 'Strong'], traits: ['Not like me', 'Very like me'] };
// Longest page list (used for progress text on the dashboard).
export const ASSESSMENT_STEPS = PAGES.profile.length;

const OPTION_LABELS = {
  current_stage: Object.fromEntries(STAGES.map((s) => [s.id, s.label])),
  school_stream: Object.fromEntries(SCHOOL_STREAMS.map((s) => [s.id, s.label])),
  school_stream_leaning: Object.fromEntries(SCHOOL_STREAMS.map((s) => [s.id, s.label])),
  class12_results_status: { out: 'Yes, they’re out', awaiting: 'Not yet', unsure: 'Not sure' },
  tried_programming: { yes: 'Yes', no: 'Not yet', unsure: 'Not sure' },
  branch: Object.fromEntries(BRANCHES.map((b) => [b.id, b.label])),
};
const QUESTION_BY_ID = Object.fromEntries(CATALOG.map((q) => [q.id, q]));
const QUIZ_OPTIONS = Object.fromEntries(APTITUDE_QUIZ.map((item, i) => [`quiz_${i}`, item.opts]));

function Likert({ value, onChange, low = 'Not at all', high = 'Very much', allowUnknown }) {
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
        {allowUnknown && (
          <button
            type="button"
            onClick={() => onChange(UNKNOWN)}
            aria-pressed={value === UNKNOWN}
            className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${
              value === UNKNOWN ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Not sure
          </button>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
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

// A slider is only answered once the person moves or clicks it; untouched means unknown.
function PreferenceSlider({ q, school, value, onChange }) {
  const set = value !== undefined && value !== UNKNOWN;
  const left = school ? q.schoolLeft : q.left;
  const right = school ? q.schoolRight : q.right;
  const commit = (e) => onChange(Number(e.target.value));
  return (
    <div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={set ? value : 50}
        onChange={commit}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        className={`w-full accent-indigo-500 ${set ? '' : 'opacity-40'}`}
        aria-label={`${left} to ${right}`}
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>{left}</span>
        <span className="text-slate-500">
          {value === UNKNOWN ? 'Not sure' : set ? '' : 'Not answered'}
          <button type="button" className="ml-2 text-indigo-300 hover:text-indigo-200" onClick={() => onChange(UNKNOWN)}>Not sure</button>
        </span>
        <span>{right}</span>
      </div>
    </div>
  );
}

// initial: profile-shaped answers (a saved draft or the current profile).
// initialStep / initialQuiz restore an unfinished attempt; onProgress persists it.
export default function Onboarding({ initial, initialStep = 0, initialQuiz, onComplete, onCancel, onProgress }) {
  // A draft saved by this version carries the raw answers (incl. temporarily hidden ones);
  // otherwise read them from the stored profile and its assessment_meta.
  const [answers, setAnswers] = useState(() => initial?.answers ?? readAnswers({ profile: initial ?? {}, quiz: initialQuiz ?? [], meta: initial?.assessment_meta }));
  const plan = useMemo(() => planAssessment({}, answers), [answers]);
  const pages = plan.pages;
  const [step, setStep] = useState(() => Math.max(0, Math.min(initialStep, pages.length - 1)));
  const page = pages[Math.min(step, pages.length - 1)];
  const stage = answers.current_stage ?? null;
  const ctx = userContext({ current_stage: stage ?? undefined });
  const school = ctx.group === 'school';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = (id, value) => setAnswers((a) => ({ ...a, [id]: value }));
  const chooseStage = (id) => setAnswers((a) => ({ ...a, current_stage: id, primary_goal: STAGE_PROFILES[id].goals.includes(a.primary_goal) ? a.primary_goal : STAGE_PROFILES[id].goals[0] }));

  // Only visible questions are written; hidden and unknown answers never become profile data.
  const payload = () => {
    const out = writeAnswers(answers, plan);
    return { out, draft: { ...out.fields, assessment_meta: out.meta, answers } };
  };
  // Persist progress whenever the person moves between pages (not on every click).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const { out, draft } = payload();
    onProgress?.(step, draft, out.quiz);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAndExit = async () => {
    const { out, draft } = payload();
    await onProgress?.(step, draft, out.quiz);
    onCancel();
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const { out } = payload();
      const f = out.fields;
      const measured = scoreQuiz(out.quiz);
      // Retired questions are no longer asked; any previously stored answers to them are kept.
      const keepRetired = (map, prev) => ({ ...Object.fromEntries(Object.entries(prev ?? {}).filter(([k]) => RETIRED[k])), ...map });
      await onComplete({
        ...f,
        full_name: (f.full_name ?? '').trim() || null,
        current_role: f.current_role ? f.current_role.trim() || null : null,
        year_of_study: f.year_of_study ? Number(f.year_of_study) : null,
        interests: keepRetired(f.interests, initial?.interests),
        // Keep a previous measurement if the quiz was skipped this time.
        aptitude_quiz: Object.keys(measured).length ? measured : initial?.aptitude_quiz ?? {},
        assessment_meta: out.meta,
        assessment_version: out.meta.version,
      }, out.quiz);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const isLast = step >= pages.length - 1;
  const goalOptions = ctx.goalOptions;

  const render = (id) => {
    const q = QUESTION_BY_ID[id];
    const value = answers[id];
    const label = school && q.schoolLabel ? q.schoolLabel : q.label;
    if (id === 'current_stage') {
      return <Chips options={STAGES} value={value} onChange={chooseStage} />;
    }
    if (id === 'primary_goal') return <Chips options={goalOptions} value={value} onChange={(v) => answer(id, v)} />;
    if (q.kind === 'text') {
      return <input className="input" value={value ?? ''} placeholder={id === 'current_role' ? 'e.g. Mechanical design engineer, Sales executive' : ''} onChange={(e) => answer(id, e.target.value)} />;
    }
    if (q.kind === 'choice' && (id === 'branch' || id === 'year_of_study')) {
      return (
        <select className="input" value={value ?? ''} onChange={(e) => answer(id, id === 'year_of_study' ? Number(e.target.value) || '' : e.target.value)}>
          <option value="">Select…</option>
          {q.options.map((o) => <option key={o} value={o}>{id === 'year_of_study' ? `Year ${o}` : OPTION_LABELS.branch[o]}</option>)}
        </select>
      );
    }
    if (q.kind === 'choice') {
      const options = q.options.map((o) => ({ id: o, label: OPTION_LABELS[id]?.[o] ?? o }));
      return <Chips options={options} value={value} onChange={(v) => answer(id, v)} columns="sm:grid-cols-3" />;
    }
    if (q.kind === 'likert') {
      const [low, high] = LIKERT_ENDS[q.page] ?? [undefined, undefined];
      return <Likert value={value} onChange={(v) => answer(id, v)} low={low} high={high} allowUnknown={q.unknown === 'absent'} />;
    }
    if (q.kind === 'slider') return <PreferenceSlider q={q} school={school} value={value} onChange={(v) => answer(id, v)} />;
    if (q.kind === 'quiz') {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {QUIZ_OPTIONS[id].map((opt, j) => (
            <button
              key={j}
              type="button"
              onClick={() => answer(id, j)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${value === j ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700 hover:bg-slate-800'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }
    return null;
  };

  const questionLabel = (id) => {
    const q = QUESTION_BY_ID[id];
    if (id === 'current_stage') return 'Where are you currently in your journey?';
    if (id === 'branch') return ctx.group === 'college' ? 'Branch / field of study' : 'Degree field';
    if (id === 'current_role') return stage === 'career_switcher' ? 'Your current or most recent role' : 'Your current role';
    if (q.kind === 'quiz') return `${Number(id.split('_')[1]) + 1}. ${q.label}`;
    if (q.kind === 'slider') return null;
    return school && q.schoolLabel ? q.schoolLabel : q.label;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            Step {Math.min(step, pages.length - 1) + 1} of {stage ? pages.length : '…'}
          </p>
          <h1 className="text-2xl font-bold">{PAGE_TITLES[page.id]}</h1>
        </div>
        {onCancel && <button className="btn-ghost" onClick={onProgress ? saveAndExit : onCancel}>{onProgress ? 'Save & exit' : 'Cancel'}</button>}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((Math.min(step, pages.length - 1) + 1) / (stage ? pages.length : ASSESSMENT_STEPS)) * 100}%` }} />
      </div>

      <div className="card">
        {PAGE_INTRO[page.id] && <p className="mb-5 text-sm text-slate-400">{PAGE_INTRO[page.id]}</p>}
        <div className={page.id === 'about' || page.id === 'stage' ? 'space-y-4' : 'space-y-5'}>
          {page.questions.filter((id) => stage || id === 'current_stage').map((id) => (
            <div key={id}>
              {questionLabel(id) && <p className="mb-2 text-sm font-medium">{questionLabel(id)}</p>}
              {render(id)}
            </div>
          ))}
        </div>
        {page.id === 'stage' && stage && <p className="mt-4 text-xs text-slate-500">Praxio focuses on {ctx.focus} for this stage.</p>}
        {page.id === 'about' && ctx.group === 'graduate' && (
          <p className="mt-4 text-xs text-slate-500">After your matches, the Market tab shows which skills employers ask for that you haven&rsquo;t proven yet.</p>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {!isLast || !stage ? (
            <button className="btn-primary" disabled={!page.complete} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn-primary" disabled={!plan.complete || busy} onClick={finish}>
              {busy ? 'Finding your matches…' : 'See my career matches'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
