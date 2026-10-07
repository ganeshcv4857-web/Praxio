// One-time import of progress made in demo mode (browser-only) into a real account.
// Only the student's own answers and learning progress are imported. Scores are
// recomputed by the deterministic engines, and nothing evaluated (projects,
// evaluations, skills, points) is imported, because browser data can't be trusted.
import * as db from './db.js';
import { readDemoSnapshot, clearDemoSnapshot } from './demoDb.js';
import { rankCareers, shortlist } from './scoring.js';
import { fromRow } from './ai.js';
import { evaluateAll, isComplete } from './feasibility/scoring.js';
import { FEASIBILITY_VERSION } from './feasibility/config.js';
import { pickInputs } from '../components/feasibility/FeasibilityWizard.jsx';
import { COURSE_BY_ID } from './development/catalog.js';
import { completeModuleFlow } from './development/service.js';

const PROFILE_FIELDS = ['full_name', 'branch', 'year_of_study', 'interests', 'aptitude', 'aptitude_quiz', 'preferences', 'traits', 'onboarded_at'];

/** Is there browser-only progress worth offering to import into this account? */
export function demoImportAvailable(profile) {
  const snap = readDemoSnapshot();
  return Boolean(snap?.profile?.onboarded_at) && !profile?.onboarded_at;
}

export async function importDemoProgress(userId) {
  const snap = readDemoSnapshot();
  if (!snap?.profile?.onboarded_at) return null;

  // Module 1: answers → profile, then rescore deterministically.
  const fields = Object.fromEntries(PROFILE_FIELDS.filter((k) => snap.profile[k] != null).map((k) => [k, snap.profile[k]]));
  const profile = await db.saveProfile(userId, fields);
  await db.completeAssessmentSession(userId, null, { draft: fields, quiz_answers: [] });
  const recs = (await db.replaceRecommendations(userId, shortlist(rankCareers(profile)))).map(fromRow);

  // Module 2: answers only; results recomputed.
  const inputs = pickInputs(snap.feasibility);
  if (isComplete(inputs)) await db.saveFeasibility(userId, inputs, evaluateAll(inputs, recs), FEASIBILITY_VERSION);

  // Module 3: path choice, started courses and learned modules (projects re-issued from templates).
  const dev = snap.dev;
  if (dev?.plan) await db.saveDevelopmentPlan(userId, dev.plan.career_id, dev.plan.pathway_type);
  for (const c of dev?.coursePlans ?? []) {
    if (COURSE_BY_ID[c.course_id]) await db.startCourse(userId, c.course_id, c.career_id, c.recommended);
  }
  for (const m of dev?.moduleProgress ?? []) {
    if (!COURSE_BY_ID[m.course_id]) continue;
    const careerId = dev.coursePlans?.find((c) => c.course_id === m.course_id)?.career_id ?? dev.plan?.career_id ?? recs[0]?.domainId;
    await completeModuleFlow({ userId, careerId, courseId: m.course_id, moduleId: m.module_id, dev: await db.getDevelopment(userId) });
  }

  clearDemoSnapshot();
  return true;
}
