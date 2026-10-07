import { useEffect, useMemo, useState } from 'react';
import * as db from '../lib/db.js';
import { CAREER_BY_ID } from '../lib/careers.js';
import { evaluateAll, isComplete, categoryOf } from '../lib/feasibility/scoring.js';
import { pickInputs } from './feasibility/FeasibilityWizard.jsx';
import { rankPathways } from '../lib/development/pathways.js';
import { deriveProgress, pathwayStages } from '../lib/development/learning.js';
import { COURSE_BY_ID } from '../lib/development/catalog.js';
import { ASSESSMENT_STEPS } from './Onboarding.jsx';
import ScoreBar from './ScoreBar.jsx';
import { userContext, labelOf } from '../lib/userContext.js';
import NextAction from './decision/NextAction.jsx';

// The authenticated user's home. Everything shown is derived from persisted data,
// so it is the same after a refresh, a new browser or a new device.

function StatusPill({ status }) {
  const map = {
    done: ['Complete', 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30'],
    active: ['In progress', 'bg-indigo-500/10 text-indigo-200 border-indigo-400/30'],
    ready: ['Ready to start', 'bg-slate-800 text-slate-300 border-slate-700'],
    locked: ['Locked', 'bg-slate-900 text-slate-500 border-slate-800'],
    soon: ['Coming soon', 'bg-slate-900 text-slate-500 border-slate-800'],
  };
  const [label, cls] = map[status];
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function Dashboard({ userId, profile, recs, feasibilityRow, assessmentSession, onStartAssessment, go, importOffer }) {
  const inputs = useMemo(() => pickInputs(feasibilityRow), [feasibilityRow]);
  // Stage from the saved profile, or from an in-progress assessment draft.
  const ctx = userContext({ ...profile, ...(assessmentSession?.draft ?? {}), current_stage: profile?.current_stage ?? assessmentSession?.draft?.current_stage });
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  const m1Active = Boolean(assessmentSession);
  const m2Done = m1Done && isComplete(inputs);

  const [dev, setDev] = useState(null);
  useEffect(() => {
    if (!m2Done) return;
    db.getDevelopment(userId).then(setDev).catch((e) => console.warn('Development load failed', e));
  }, [m2Done, userId]);

  const feas = useMemo(() => (m2Done ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {}), [m2Done, inputs, recs]);
  const progress = useMemo(() => deriveProgress(dev), [dev]);
  const chosen = useMemo(() => {
    if (!m2Done || !dev) return null;
    const pathways = rankPathways(recs, inputs);
    return (dev.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || pathways[0];
  }, [m2Done, dev, recs, inputs]);

  const stages = chosen ? pathwayStages(chosen, progress).filter((s) => s.kind === 'course') : [];
  const modulesDone = stages.reduce((s, st) => s + st.progress.done, 0);
  const modulesTotal = stages.reduce((s, st) => s + st.progress.total, 0);
  const currentStage = stages.find((s) => s.status === 'current');
  const openProject = dev?.challenges.find((c) => c.status === 'open' || c.status === 'needs_improvement');
  const m3Started = Boolean(dev && (dev.plan || dev.coursePlans.length || dev.moduleProgress.length));

  // ---- Next step (one clear action) -------------------------------------
  let next;
  if (!m1Done && !m1Active) {
    next = { title: 'Start your career assessment', body: 'About 10 minutes: interests, aptitude, preferences and personality. You can save and come back any time.', cta: 'Start Assessment', action: onStartAssessment };
  } else if (!m1Done) {
    next = { title: 'Continue your assessment', body: `You're on step ${assessmentSession.current_step + 1} of ${ASSESSMENT_STEPS}. Your answers so far are saved.`, cta: 'Continue Assessment', action: onStartAssessment };
  } else if (!m2Done) {
    next = { title: 'Check what is realistic for you', body: 'Module 2 checks your recommended careers against your family’s budget, education plans, risk comfort and location.', cta: 'Continue to Module 2', action: () => go('feasibility') };
  } else if (openProject) {
    next = { title: `Build your project: ${openProject.title}`, body: openProject.status === 'needs_improvement' ? 'Your last submission needs improvement. Use the feedback and resubmit.' : 'Put the module you just learned into practice and submit it on GitHub.', cta: 'Open learning path', action: () => go('development') };
  } else if (currentStage) {
    next = { title: m3Started ? `Continue: ${COURSE_BY_ID[currentStage.courseId].title}` : 'Plan your learning path', body: m3Started ? `Next module: ${currentStage.progress.next?.title ?? 'review the course'}` : 'Praxio has picked the most realistic path into your best-fit career. Start the first course.', cta: m3Started ? 'Continue learning' : 'Continue to Module 3', action: () => go('development') };
  } else {
    next = { title: 'Your learning path is complete', body: 'Review your demonstrated skills or explore an alternative path.', cta: 'Open learning path', action: () => go('development') };
  }

  const modules = [
    { n: 1, title: 'Career assessment', status: m1Done ? 'done' : m1Active ? 'active' : 'ready', detail: m1Done ? `${recs.length} careers matched` : m1Active ? `Step ${assessmentSession.current_step + 1} of ${ASSESSMENT_STEPS}` : 'Not started', tab: m1Done ? 'results' : null },
    { n: 2, title: 'Career feasibility', status: m2Done ? 'done' : m1Done ? (feasibilityRow ? 'active' : 'ready') : 'locked', detail: m2Done ? `${Object.values(feas).filter((f) => f.category === 'high').length} highly feasible` : m1Done ? 'Family & financial check' : 'After Module 1', tab: m1Done ? 'feasibility' : null },
    { n: 3, title: 'Career development', status: !m2Done ? 'locked' : modulesTotal && modulesDone === modulesTotal ? 'done' : m3Started ? 'active' : 'ready', detail: !m2Done ? 'After Module 2' : m3Started ? `${modulesDone}/${modulesTotal} modules · ${progress.points} pts` : 'Learning path ready', tab: m2Done ? 'development' : null },
    { n: 4, title: 'Market intelligence', status: m1Done ? 'ready' : 'locked', detail: m1Done ? 'Demand, salaries & your skill gaps' : 'After Module 1', tab: m1Done ? 'market' : null },
    { n: 5, title: 'Family alignment', status: m2Done ? 'ready' : 'locked', detail: m2Done ? 'Paths that work for you and your family' : 'After Module 2', tab: m2Done ? 'alignment' : null },
  ];

  const isNew = !m1Done && !m1Active;

  return (
    <div className="space-y-6">
      {importOffer}

      {isNew ? (
        <section className="card border-indigo-500/40 bg-indigo-500/5 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Discover → Learn → Apply → Build → Prove → Improve</p>
          <h1 className="mt-2 text-3xl font-extrabold">Welcome to Praxio{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Praxio helps you find the engineering career that suits you, checks that it&rsquo;s realistic for your family, then
            builds a learning path where every module ends in a practical project. Your progress is saved to your account, so you
            can stop and continue whenever you like.
          </p>
          <button className="btn-primary mt-6 px-6 py-3 text-base" onClick={onStartAssessment}>Start Assessment</button>
        </section>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{ctx.stageLabel}{ctx.goal ? ` · ${labelOf.goal(ctx.goal)}` : ''}</p>
            <p className="text-lg font-semibold text-slate-200">{ctx.headline}</p>
            <p className="text-sm text-slate-400">Praxio is focusing on {ctx.focus}.</p>
          </div>
          <section className="card flex flex-wrap items-center justify-between gap-4 border-indigo-500/40 bg-indigo-500/5">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Next step</p>
              <h2 className="text-lg font-semibold">{next.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{next.body}</p>
            </div>
            <button className="btn-primary px-5 py-2.5" onClick={next.action}>{next.cta}</button>
          </section>
          {m1Done && <NextAction userId={userId} profile={profile} recs={recs} inputs={inputs} go={go} />}
        </>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your journey</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {modules.map((m) => (
            <li key={m.n} className={`card flex flex-col ${m.status === 'locked' || m.status === 'soon' ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module {m.n}</span>
                <StatusPill status={m.status} />
              </div>
              <p className="mt-2 font-semibold">{m.title}</p>
              <p className="mt-1 flex-1 text-xs text-slate-400">{m.detail}</p>
              {m.tab && <button className="mt-3 self-start text-xs font-semibold text-indigo-300 hover:text-indigo-200" onClick={() => go(m.tab)}>Open →</button>}
            </li>
          ))}
        </ol>
      </section>

      {m1Done && (
        <section className="card">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Your career shortlist</h2>
            <button className="text-xs font-semibold text-indigo-300 hover:text-indigo-200" onClick={() => go('results')}>All matches →</button>
          </div>
          <ul className="mt-4 space-y-3">
            {recs.slice(0, 5).map((r) => {
              const f = feas[r.domainId];
              const cat = f && categoryOf(f.category);
              return (
                <li key={r.domainId} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-xs font-bold text-slate-500">{r.rank}</span>
                  <div>
                    <div className="flex justify-between"><span className="font-medium">{CAREER_BY_ID[r.domainId]?.name}</span><span className="tabular-nums text-slate-400">Fit {Math.round(r.score)}%</span></div>
                    <ScoreBar value={r.score} className="mt-1 h-1.5" />
                  </div>
                  <span className="w-28 text-right text-xs text-slate-400">{cat ? `${cat.emoji} ${f.score}% feasible` : 'Feasibility —'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {m3Started && chosen && (
        <section className="card">
          <h2 className="font-semibold">Career development · {CAREER_BY_ID[chosen.careerId].name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Modules learned', `${modulesDone}/${modulesTotal}`],
              ['Projects passed', dev.challenges.filter((c) => c.status === 'passed').length],
              ['Skills demonstrated', progress.demonstratedSkills.length],
              ['Reward points', progress.points],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-950/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
