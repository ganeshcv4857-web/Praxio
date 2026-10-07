import { useState } from 'react';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { COURSE_BY_ID, findModule } from '../../lib/development/catalog.js';
import { EVALUATION_CRITERIA, EVALUATION_WEIGHTS, PASS_SCORE } from '../../lib/development/config.js';
import { validateSubmission } from '../../lib/development/evaluation.js';
import ScoreBar from '../ScoreBar.jsx';
import { Chip, DifficultyChip, STATUS_LABEL } from './parts.jsx';

function SubmissionForm({ onSubmit }) {
  const [form, setForm] = useState({ github_url: '', demo_url: '', explanation: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateSubmission(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(form);
      setForm({ github_url: '', demo_url: '', explanation: '' });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4" noValidate>
      <h2 className="font-semibold">Project submission</h2>
      <div>
        <label className="label" htmlFor="gh">GitHub repository *</label>
        <input id="gh" className="input" placeholder="https://github.com/you/project" value={form.github_url} onChange={set('github_url')} />
        {errors.github_url && <p className="mt-1 text-xs text-rose-300">{errors.github_url}</p>}
      </div>
      <div>
        <label className="label" htmlFor="demo">Live demo (optional)</label>
        <input id="demo" className="input" placeholder="https://project.vercel.app" value={form.demo_url} onChange={set('demo_url')} />
        {errors.demo_url && <p className="mt-1 text-xs text-rose-300">{errors.demo_url}</p>}
      </div>
      <div>
        <label className="label" htmlFor="exp">What did you build? (optional, but it helps)</label>
        <textarea id="exp" rows={4} className="input" placeholder="Your approach, key decisions, results and what you learned" value={form.explanation} onChange={set('explanation')} />
      </div>
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Reading your repository & evaluating…' : 'Submit project'}</button>
    </form>
  );
}

function EvaluationResult({ ev, submission }) {
  const points = ev.points_awarded ?? 0;
  const ok = ev.passed;
  return (
    <section className={`card ${ok ? 'border-emerald-500/40' : 'border-amber-500/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>
            {ok ? 'Skill demonstrated' : 'Not demonstrated yet: needs improvement'}
          </p>
          <p className="text-4xl font-bold tabular-nums">{ev.total_score}<span className="text-base text-slate-500"> / 100</span></p>
          <p className="text-xs text-slate-500">
            Weighted total calculated by Praxio · pass mark {PASS_SCORE} ·{' '}
            {ev.evaluator === 'automated-check' ? 'Automated evidence check' : 'AI-assisted evaluation'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-amber-300">+{points}</p>
          <p className="text-xs text-slate-500">reward points</p>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {EVALUATION_CRITERIA.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="flex justify-between text-slate-300">
              <span>{c.label} <span className="text-xs text-slate-600">× {Math.round(EVALUATION_WEIGHTS[c.id] * 100)}%</span></span>
              <span className="tabular-nums">{ev[c.id]}</span>
            </div>
            <ScoreBar value={ev[c.id]} className="mt-1 h-1.5" />
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-emerald-300">What you did well</h3>
          {ev.strengths?.length
            ? <ul className="space-y-1 text-sm text-slate-300">{ev.strengths.map((s) => <li key={s}>• {s}</li>)}</ul>
            : <p className="text-sm text-slate-500">Nothing clearly evidenced yet. Use the suggestions to strengthen your submission.</p>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-amber-300">Improve next</h3>
          <ul className="space-y-1 text-sm text-slate-300">{(ev.improvements ?? []).map((s) => <li key={s}>• {s}</li>)}</ul>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold">Skills demonstrated</h3>
        {ev.demonstrated_skills?.length
          ? <ul className="flex flex-wrap gap-1.5">{ev.demonstrated_skills.map((s) => <li key={s} className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-200">✓ {s}</li>)}</ul>
          : <p className="text-sm text-slate-500">None yet: reach {PASS_SCORE}+ with the concept clearly applied.</p>}
      </div>
      {ev.feedback && <p className="mt-4 text-xs text-slate-500">{ev.feedback}</p>}
      <p className="mt-2 text-xs text-slate-600">
        Submitted <a className="text-indigo-300 hover:underline" href={submission.github_url} target="_blank" rel="noreferrer">{submission.github_url.replace('https://github.com/', '')}</a>
      </p>
    </section>
  );
}

export default function ProjectView({ challenge, dev, actions, nav }) {
  if (!challenge) return <p className="text-slate-400">Project not found.</p>;

  const course = COURSE_BY_ID[challenge.course_id];
  const module = findModule(challenge.course_id, challenge.module_id);
  const submissions = dev.submissions.filter((s) => s.challenge_id === challenge.id).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const evalFor = (sid) => dev.evaluations.find((e) => e.submission_id === sid);
  const canSubmit = challenge.status !== 'passed';

  return (
    <div className="space-y-6">
      <button onClick={() => nav.course(challenge.course_id)} className="text-sm text-slate-400 hover:text-slate-100">← {course.title}</button>

      <section className="card">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Practical project · {module.title}</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{challenge.title}</h1>
          <span className={`text-sm font-semibold ${STATUS_LABEL[challenge.status].tone}`}>{STATUS_LABEL[challenge.status].text}</span>
        </div>
        <p className="mt-2 text-slate-300">{challenge.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <DifficultyChip level={challenge.difficulty} />
          <Chip>{CAREER_BY_ID[challenge.career_id]?.name}</Chip>
          {challenge.skills.map((s) => <Chip key={s}>{s}</Chip>)}
          {challenge.source === 'ai' && <Chip>Tailored by AI from the module template</Chip>}
        </div>
        <h2 className="mt-5 text-sm font-semibold">Requirements</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
          {challenge.requirements.map((r) => <li key={r} className="flex gap-2"><span className="text-indigo-300">□</span>{r}</li>)}
        </ul>
      </section>

      {submissions.map((s) => {
        const ev = evalFor(s.id);
        return ev
          ? <EvaluationResult key={s.id} ev={ev} submission={s} />
          : <p key={s.id} className="card text-sm text-slate-400">Submitted {s.github_url}: evaluation pending.</p>;
      })}

      {canSubmit ? (
        <>
          {submissions.length > 0 && <p className="text-sm text-slate-400">Improve your project using the feedback above and submit again. Only the improvement in points is added.</p>}
          <SubmissionForm
            onSubmit={(form) => actions.submitProject(challenge, form)}
          />
        </>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-emerald-500/30">
          <p className="text-sm text-slate-300">Skill demonstrated. On to the next module.</p>
          <button className="btn-primary" onClick={() => nav.course(challenge.course_id)}>Next module</button>
        </div>
      )}
    </div>
  );
}
