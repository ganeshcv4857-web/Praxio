import { useState } from 'react';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { COURSE_BY_ID, PROGRAMMES, courseSkills, formatPrice } from '../../lib/development/catalog.js';
import { PATHWAY_TYPES, pathwayChain } from '../../lib/development/pathways.js';
import { pathwayStages, rankCourses } from '../../lib/development/learning.js';
import { PATH_WEIGHTS, PASS_SCORE } from '../../lib/development/config.js';
import { categoryOf } from '../../lib/feasibility/scoring.js';
import ScoreBar from '../ScoreBar.jsx';
import { Chip, DifficultyChip, SkillList, Stat } from './parts.jsx';

const COMPONENT_LABELS = {
  careerFit: 'Career fit',
  feasibility: 'Feasibility',
  budget: 'Budget compatibility',
  study: 'Fits your study plans',
  requirement: 'Meets career requirements',
};

function ProgressDashboard({ chosen, dev, progress, nav }) {
  const stages = pathwayStages(chosen, progress).filter((s) => s.kind === 'course');
  const totalModules = stages.reduce((s, st) => s + st.progress.total, 0);
  const doneModules = stages.reduce((s, st) => s + st.progress.done, 0);
  const current = stages.find((s) => s.status === 'current');
  const evaluated = new Set(dev.evaluations.map((e) => e.challenge_id));
  const passedCount = dev.challenges.filter((c) => c.status === 'passed').length;
  const needsWork = dev.challenges.filter((c) => c.status === 'needs_improvement').length;
  const open = dev.challenges.filter((c) => c.status === 'open');

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your progress</h2>
        <span className="text-xs text-slate-500">Career goal: <span className="text-slate-200">{CAREER_BY_ID[chosen.careerId].name}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Modules learned" value={`${doneModules} / ${totalModules}`} />
        <Stat label="Projects" value={dev.challenges.filter((c) => evaluated.has(c.id)).length} sub={`${passedCount} passed · ${needsWork} need work`} />
        <Stat label="Skills demonstrated" value={progress.demonstratedSkills.length} />
        <Stat label="Reward points" value={progress.points} accent />
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Current stage: <span className="text-slate-200">{current ? `${current.title} · ${COURSE_BY_ID[current.courseId].title}` : 'All course stages complete'}</span></span>
          <span className="tabular-nums">{totalModules ? Math.round((doneModules / totalModules) * 100) : 0}%</span>
        </div>
        <ScoreBar value={totalModules ? (doneModules / totalModules) * 100 : 0} className="mt-1" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Learned (completed modules)</p>
          <SkillList skills={progress.learnedSkills} empty="Complete a module to start learning skills" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Demonstrated (proven by projects)</p>
          <SkillList skills={progress.learnedSkills} demonstrated={progress.demonstratedSkills} empty="Pass a project to demonstrate a skill" mode="demonstrated" />
        </div>
      </div>
      {open.length > 0 && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm">
          <p className="font-semibold">Projects waiting for you</p>
          <ul className="mt-2 space-y-1">
            {open.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-300">{c.title}</span>
                <button className="text-xs font-semibold text-indigo-300 hover:text-indigo-200" onClick={() => nav.project(c.id)}>Open →</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PathwayCard({ p, recommended, chosen, onChoose }) {
  const career = CAREER_BY_ID[p.careerId];
  const cat = categoryOf(p.feasibility.category);
  return (
    <section className={`card ${recommended ? 'border-indigo-500/50 bg-indigo-500/5' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            {recommended ? '🏆 Recommended path' : 'Your chosen path'}
          </p>
          <h2 className="text-xl font-bold">{career.name}</h2>
          <p className="text-sm text-slate-400">{PATHWAY_TYPES[p.type].label}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">{p.score}<span className="text-sm text-slate-500">/100</span></p>
          <p className="text-xs text-slate-500">Overall path score</p>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-slate-950/60 px-3 py-2 text-sm text-slate-200">{pathwayChain(p)}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Chip>Career fit {p.components.careerFit}%</Chip>
        <Chip>{cat.emoji} Feasibility {p.feasibility.score}%</Chip>
        <Chip>Est. cost {formatPrice(p.cost)}</Chip>
        {p.stages.some((s) => s.kind === 'programme') && (
          <Chip>🎓 {PROGRAMMES[p.stages.find((s) => s.kind === 'programme').programme].title}</Chip>
        )}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Why Praxio recommends this</h3>
          <ul className="space-y-1.5 text-sm text-slate-300">
            {p.reasons.map((r) => <li key={r} className="flex gap-2"><span className="text-indigo-300">•</span>{r}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">How the score is made</h3>
          <ul className="space-y-2">
            {Object.entries(PATH_WEIGHTS).map(([k, w]) => (
              <li key={k} className="text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>{COMPONENT_LABELS[k]} <span className="text-slate-600">× {Math.round(w * 100)}%</span></span>
                  <span className="tabular-nums text-slate-300">{p.components[k]}</span>
                </div>
                <ScoreBar value={p.components[k]} className="mt-1 h-1.5" />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {!chosen && onChoose && (
        <button className="btn-primary mt-5" onClick={() => onChoose(p)}>Follow this path</button>
      )}
    </section>
  );
}

function Alternatives({ pathways, chosen, onChoose }) {
  const [open, setOpen] = useState(false);
  const others = pathways.filter((p) => p.id !== chosen.id).slice(0, 8);
  return (
    <section className="card">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-semibold">Alternative paths ({others.length})</span>
        <span className="text-sm text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="mt-4 space-y-2">
          {others.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{CAREER_BY_ID[p.careerId].name} · <span className="font-normal text-slate-400">{PATHWAY_TYPES[p.type].short}</span></p>
                <p className="truncate text-xs text-slate-500">{pathwayChain(p)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums">{p.score}</span>
                <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onChoose(p)}>Follow</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LearningPath({ chosen, progress, nav, onStart }) {
  const stages = pathwayStages(chosen, progress);
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Learning path</h2>
      <ol className="relative space-y-3 border-l border-slate-800 pl-6">
        {stages.map((s, i) => {
          const dot = s.status === 'done' ? 'bg-emerald-400' : s.status === 'current' ? 'bg-indigo-500' : 'bg-slate-700';
          return (
            <li key={`${s.title}-${i}`} className="relative">
              <span className={`absolute -left-[33px] top-5 h-4 w-4 rounded-full ${dot}`} />
              {s.kind === 'course' ? (
                <CourseStage stage={s} index={i} progress={progress} nav={nav} onStart={onStart} />
              ) : s.kind === 'programme' ? (
                <ProgrammeStage stage={s} index={i} />
              ) : (
                <div className="card py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Stage {i + 1} · Milestone</p>
                  <p className="font-semibold">{s.title}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CourseStage({ stage, index, progress, nav, onStart }) {
  const c = COURSE_BY_ID[stage.courseId];
  const started = progress.isStarted(c.id) || stage.progress.done > 0;
  return (
    <div className={`card ${stage.status === 'current' ? 'border-indigo-500/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Stage {index + 1} · {stage.title}
            {stage.status === 'done' && <span className="ml-2 text-emerald-400">✓ Complete</span>}
            {stage.status === 'current' && <span className="ml-2 text-indigo-300">Up next</span>}
          </p>
          <p className="font-semibold">{c.title}</p>
          <p className="text-xs text-slate-400">{c.provider} · {formatPrice(c.price)} · {c.duration}</p>
        </div>
        <DifficultyChip level={c.difficulty} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ScoreBar value={stage.progress.pct} className="flex-1 h-1.5" />
        <span className="text-xs tabular-nums text-slate-400">{stage.progress.done}/{stage.progress.total} modules</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">Skills: {courseSkills(c).slice(0, 6).join(', ')}</p>
      {stage.overCap && <p className="mt-1 text-xs text-amber-300">No option within your typical course budget for this stage</p>}
      <div className="mt-3">
        {started
          ? <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => nav.course(c.id)}>{stage.progress.complete ? 'Review course' : 'Continue course'}</button>
          : <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onStart(c.id)}>Start course</button>}
      </div>
    </div>
  );
}

function ProgrammeStage({ stage, index }) {
  const p = PROGRAMMES[stage.programme];
  return (
    <div className="card border-violet-500/30 bg-violet-500/5">
      <p className="text-xs uppercase tracking-wide text-violet-300">Stage {index + 1} · Higher studies</p>
      <p className="font-semibold">🎓 {p.title}</p>
      <p className="text-xs text-slate-400">{p.provider} · approx. {formatPrice(p.price)} · {p.duration}</p>
      <ul className="mt-2 space-y-1 text-sm text-slate-300">
        {p.steps.map((s) => <li key={s} className="flex gap-2"><span className="text-violet-300">→</span>{s}</li>)}
      </ul>
    </div>
  );
}

function MoreCourses({ chosen, inputs, progress, nav, onStart }) {
  const ranked = rankCourses(chosen.careerId, chosen, inputs, progress).filter((r) => !r.inPath).slice(0, 6);
  if (!ranked.length) return null;
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">More courses for {CAREER_BY_ID[chosen.careerId].name}</h2>
      <p className="mb-3 text-xs text-slate-500">Ranked by career relevance, then your path, then affordability, then difficulty.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {ranked.map(({ course: c, reasons, affordable }) => {
          const started = progress.isStarted(c.id);
          return (
            <article key={c.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="text-xs text-slate-400">{c.provider} · {c.duration}</p>
                </div>
                <span className={`text-sm font-semibold ${affordable ? 'text-emerald-300' : 'text-amber-300'}`}>{formatPrice(c.price)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5"><DifficultyChip level={c.difficulty} />{courseSkills(c).slice(0, 4).map((s) => <Chip key={s}>{s}</Chip>)}</div>
              <ul className="mt-3 flex-1 space-y-1 text-xs text-slate-400">{reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              <div className="mt-3">
                {started
                  ? <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => nav.course(c.id)}>Continue</button>
                  : <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onStart(c.id)}>Start course</button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function Overview({ pathways, recommended, chosen, inputs, dev, progress, actions, nav }) {
  const isRecommended = chosen.id === recommended.id;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module 3</p>
        <h1 className="text-2xl font-bold">Career development</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          What to learn, in what order, and how to prove it. Completing a module means you&rsquo;ve <strong>learned</strong> it;
          passing its project (score ≥ {PASS_SCORE}) means you&rsquo;ve <strong>demonstrated</strong> it.
        </p>
      </div>

      <ProgressDashboard chosen={chosen} dev={dev} progress={progress} nav={nav} />

      <PathwayCard p={chosen} recommended={isRecommended} chosen />
      {!isRecommended && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3 text-sm">
          <span className="text-slate-400">
            Praxio&rsquo;s top recommendation is <strong className="text-slate-200">{CAREER_BY_ID[recommended.careerId].name} · {PATHWAY_TYPES[recommended.type].short}</strong> ({recommended.score}/100).
          </span>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => actions.choosePathway(recommended)}>Switch to it</button>
        </div>
      )}
      <Alternatives pathways={pathways} chosen={chosen} onChoose={actions.choosePathway} />

      <LearningPath chosen={chosen} progress={progress} nav={nav} onStart={actions.startCourse} />
      <MoreCourses chosen={chosen} inputs={inputs} progress={progress} nav={nav} onStart={actions.startCourse} />

      <p className="text-xs text-slate-500">
        Course catalog, prices and programme costs are curated prototype estimates. Your budget comes from your feasibility answers.
      </p>
    </div>
  );
}
