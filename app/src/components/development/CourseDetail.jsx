import { useState } from 'react';
import { COURSE_BY_ID, courseSkills, formatPrice } from '../../lib/development/catalog.js';
import { missingPrerequisites } from '../../lib/development/learning.js';
import ScoreBar from '../ScoreBar.jsx';
import { Chip, DifficultyChip, STATUS_LABEL } from './parts.jsx';

export default function CourseDetail({ courseId, pathway, dev, progress, actions, nav }) {
  const course = COURSE_BY_ID[courseId];
  const [busy, setBusy] = useState(null);
  const [unlocked, setUnlocked] = useState(null); // challenge just unlocked by completing a module
  const [error, setError] = useState('');
  if (!course) return <p className="text-slate-400">Course not found.</p>;

  const p = progress.courseProgress(courseId);
  const missing = missingPrerequisites(courseId, progress);
  const stage = pathway.stages.find((s) => s.courseId === courseId);
  const challengeFor = (moduleId) => dev.challenges.find((c) => c.course_id === courseId && c.module_id === moduleId);

  const complete = async (moduleId) => {
    setBusy(moduleId);
    setError('');
    try {
      setUnlocked(await actions.completeModule(courseId, moduleId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={nav.overview} className="text-sm text-slate-400 hover:text-slate-100">← Learning path</button>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{stage ? `Stage: ${stage.title}` : 'Additional course'}</p>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{course.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip>{course.provider}</Chip>
          <Chip>{formatPrice(course.price)}</Chip>
          <Chip>{course.duration}</Chip>
          <DifficultyChip level={course.difficulty} />
          <a className="text-xs font-semibold text-indigo-300 hover:text-indigo-200" href={course.url} target="_blank" rel="noreferrer">Open provider ↗</a>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Recommended first: {missing.map((id) => COURSE_BY_ID[id]?.title).join(', ')}. You can still continue.
        </p>
      )}

      <section className="card">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Progress</span>
          <span className="tabular-nums text-slate-400">{p.done}/{p.total} modules · {p.pct}%</span>
        </div>
        <ScoreBar value={p.pct} className="mt-2" />
        <p className="mt-3 text-xs text-slate-500">Skills in this course: {courseSkills(course).join(', ')}</p>
      </section>

      {unlocked && (
        <section className="card border-indigo-500/50 bg-indigo-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module learned ✓ · Project unlocked</p>
          <h2 className="mt-1 text-lg font-bold">Put this knowledge into practice</h2>
          <p className="mt-1 text-sm text-slate-300"><strong>{unlocked.title}</strong>: {unlocked.description}</p>
          <p className="mt-2 text-xs text-slate-400">
            Build it, push it to GitHub and submit it. Passing the evaluation turns <em>{unlocked.skills.join(', ')}</em> from learned into demonstrated.
          </p>
          <button className="btn-primary mt-3" onClick={() => nav.project(unlocked.id)}>View project</button>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Modules</h2>
        <ol className="space-y-2">
          {course.modules.map((m, i) => {
            const done = progress.isDone(courseId, m.id);
            const isNext = p.next?.id === m.id;
            const ch = challengeFor(m.id);
            return (
              <li key={m.id} className={`card flex flex-wrap items-center gap-4 py-3 ${isNext ? 'border-indigo-500/40' : ''}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? 'bg-emerald-500/20 text-emerald-300' : isNext ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  {done ? '✓' : isNext ? '→' : '○'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i + 1}. {m.title}</p>
                  <p className="text-xs text-slate-500">{m.skills.join(' · ')}</p>
                  {ch && (
                    <button className={`mt-1 text-xs font-semibold ${STATUS_LABEL[ch.status].tone}`} onClick={() => nav.project(ch.id)}>
                      Project: {ch.title} · {STATUS_LABEL[ch.status].text} →
                    </button>
                  )}
                </div>
                {!done && (
                  <button className={isNext ? 'btn-primary' : 'btn-ghost'} disabled={busy != null} onClick={() => complete(m.id)}>
                    {busy === m.id ? 'Preparing project…' : 'Mark complete'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      </section>
    </div>
  );
}
