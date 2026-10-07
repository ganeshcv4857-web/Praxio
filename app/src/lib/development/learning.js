// Learning progress (derived from stored rows) and course matching.
// "Learned" skills come from completed modules; "demonstrated" skills only ever come
// from the demonstrated_skills table, written after a passing project evaluation.

import { CAREER_BY_ID } from '../careers.js';
import { COURSES, COURSE_BY_ID, courseSkills } from './catalog.js';
import { priceCapFor } from './pathways.js';
import { BUDGET_TIER_LABEL, PASS_SCORE } from './config.js';

const key = (courseId, moduleId) => `${courseId}:${moduleId}`;

/** Normalised view of everything Module 3 has stored for a student. */
export function deriveProgress(dev) {
  const completed = new Set(
    (dev?.moduleProgress ?? []).filter((r) => r.status === 'completed').map((r) => key(r.course_id, r.module_id))
  );
  const started = new Set((dev?.coursePlans ?? []).map((r) => r.course_id));
  const isDone = (courseId, moduleId) => completed.has(key(courseId, moduleId));

  const courseProgress = (courseId) => {
    const c = COURSE_BY_ID[courseId];
    if (!c) return { done: 0, total: 0, pct: 0, next: null, complete: false };
    const done = c.modules.filter((m) => isDone(courseId, m.id)).length;
    return {
      done,
      total: c.modules.length,
      pct: Math.round((done / c.modules.length) * 100),
      next: c.modules.find((m) => !isDone(courseId, m.id)) ?? null,
      complete: done === c.modules.length,
    };
  };

  const learned = [];
  for (const c of COURSES) for (const m of c.modules) if (isDone(c.id, m.id)) learned.push(...m.skills);

  const evaluations = dev?.evaluations ?? [];
  return {
    isDone,
    isStarted: (courseId) => started.has(courseId),
    courseProgress,
    learnedSkills: [...new Set(learned)],
    demonstratedSkills: (dev?.skills ?? []).map((s) => s.skill),
    points: (dev?.rewards ?? []).reduce((s, r) => s + r.points, 0),
    passedCount: evaluations.filter((e) => e.total_score >= PASS_SCORE).length,
    evaluations,
  };
}

/** Course stages of a pathway with progress and status (done / current / upcoming). */
export function pathwayStages(pathway, progress) {
  let currentFound = false;
  return pathway.stages.map((s) => {
    if (s.kind !== 'course') return { ...s, status: 'milestone' };
    const p = progress.courseProgress(s.courseId);
    let status = 'upcoming';
    if (p.complete) status = 'done';
    else if (!currentFound) {
      status = 'current';
      currentFound = true;
    }
    return { ...s, progress: p, status };
  });
}

/** Missing prerequisite courses (advisory, not blocking). */
export function missingPrerequisites(courseId, progress) {
  return (COURSE_BY_ID[courseId]?.prerequisites ?? []).filter((id) => !progress.courseProgress(id).complete);
}

const DIFF_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Courses for a career, ranked: career relevance > pathway relevance > affordability > difficulty.
 * Only courses tagged for the career are considered, so cheap-but-unrelated courses never appear.
 */
export function rankCourses(careerId, pathway, inputs, progress) {
  const cap = priceCapFor(inputs);
  const inPath = new Set(pathway?.stages.filter((s) => s.kind === 'course').map((s) => s.courseId) ?? []);
  const level = progress.learnedSkills.length === 0 ? 0 : progress.passedCount >= 2 ? 2 : 1;

  return COURSES.filter((c) => c.careers.includes(careerId))
    .map((c) => {
      const relevance = c.careers.indexOf(careerId) === 0 ? 2 : 1;
      const affordable = c.price <= cap;
      const diffFit = -Math.abs(DIFF_RANK[c.difficulty] - level);
      const reasons = [
        inPath.has(c.id) ? 'Part of your recommended path' : `Relevant to ${CAREER_BY_ID[careerId].name}`,
        affordable ? `Within your budget (${BUDGET_TIER_LABEL[inputs.education_budget]})` : 'Above your typical course budget',
        `Builds ${courseSkills(c).slice(0, 3).join(', ')}`,
      ];
      return { course: c, inPath: inPath.has(c.id), affordable, sort: [relevance, inPath.has(c.id) ? 1 : 0, affordable ? 1 : 0, diffFit], reasons };
    })
    .sort((a, b) => {
      for (let i = 0; i < a.sort.length; i++) if (a.sort[i] !== b.sort[i]) return b.sort[i] - a.sort[i];
      return a.course.price - b.course.price;
    });
}
