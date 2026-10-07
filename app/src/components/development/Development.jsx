import { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../../lib/db.js';
import { isComplete } from '../../lib/feasibility/scoring.js';
import { pickInputs } from '../feasibility/FeasibilityWizard.jsx';
import { rankPathways } from '../../lib/development/pathways.js';
import { deriveProgress } from '../../lib/development/learning.js';
import { completeModuleFlow, submitAndEvaluate } from '../../lib/development/service.js';
import { applyCustomisation } from '../../lib/development/projects.js';
import Overview from './Overview.jsx';
import CourseDetail from './CourseDetail.jsx';
import ProjectView from './ProjectView.jsx';

// Module 3 container. Consumes Module 1 (recs) and Module 2 (feasibility inputs) as-is,
// loads Module 3 rows, and switches between overview / course / project views.
export default function Development({ userId, recs, feasibilityRow, onGoFeasibility }) {
  const inputs = useMemo(() => pickInputs(feasibilityRow), [feasibilityRow]);
  const ready = recs.length > 0 && isComplete(inputs);
  const [dev, setDev] = useState(null);
  const [view, setView] = useState({ name: 'overview' });
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const raw = await db.getDevelopment(userId);
      // Show AI-tailored wording (stored separately) on top of the template challenge.
      setDev({ ...raw, challenges: raw.challenges.map((c) => applyCustomisation(c, c.customisation)) });
    } catch (e) {
      setError(`Could not load your learning progress: ${e.message}`);
    }
  }, [userId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const pathways = useMemo(() => (ready ? rankPathways(recs, inputs) : []), [ready, recs, inputs]);
  const progress = useMemo(() => deriveProgress(dev), [dev]);

  if (!recs.length) return <p className="text-slate-400">Complete your assessment first to get career recommendations.</p>;
  if (!isComplete(inputs)) {
    return (
      <div className="card mx-auto max-w-xl space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Module 3 · Career development</p>
        <h1 className="text-xl font-bold">First, check what&rsquo;s realistic for you</h1>
        <p className="text-sm text-slate-400">
          Your learning path is chosen using your career fit <em>and</em> your family&rsquo;s budget and education plans
          from the feasibility check.
        </p>
        <button className="btn-primary" onClick={onGoFeasibility}>Check career feasibility</button>
      </div>
    );
  }
  if (error) return <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>;
  if (!dev) return <p className="text-slate-400">Loading your learning path…</p>;

  // The followed pathway: the student's saved choice, else Praxio's top recommendation.
  const recommended = pathways[0];
  const chosen = (dev.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || recommended;

  const actions = {
    choosePathway: async (p) => {
      await db.saveDevelopmentPlan(userId, p.careerId, p.type);
      await reload();
    },
    startCourse: async (courseId) => {
      await db.startCourse(userId, courseId, chosen.careerId, true);
      await reload();
      setView({ name: 'course', courseId });
    },
    completeModule: async (courseId, moduleId) => {
      const challenge = await completeModuleFlow({ userId, careerId: chosen.careerId, courseId, moduleId, dev });
      await reload();
      return challenge;
    },
    submitProject: async (challenge, form) => {
      const result = await submitAndEvaluate({ userId, challenge, form, dev });
      await reload();
      return result;
    },
  };

  const nav = {
    overview: () => setView({ name: 'overview' }),
    course: (courseId) => setView({ name: 'course', courseId }),
    project: (challengeId) => setView({ name: 'project', challengeId }),
  };

  if (view.name === 'course') {
    return <CourseDetail courseId={view.courseId} pathway={chosen} dev={dev} progress={progress} actions={actions} nav={nav} />;
  }
  if (view.name === 'project') {
    const challenge = dev.challenges.find((c) => c.id === view.challengeId);
    return <ProjectView challenge={challenge} dev={dev} actions={actions} nav={nav} />;
  }
  return (
    <Overview
      pathways={pathways}
      recommended={recommended}
      chosen={chosen}
      recs={recs}
      inputs={inputs}
      dev={dev}
      progress={progress}
      actions={actions}
      nav={nav}
    />
  );
}
