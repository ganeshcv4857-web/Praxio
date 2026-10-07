// Practical projects: completing a module unlocks a project built from that module's
// template. Gemini may only reword the scenario and suggest a dataset/extension —
// the requirements (what proves the concept) always come from the template.

import { CAREER_BY_ID } from '../careers.js';
import { COURSE_BY_ID, findModule } from './catalog.js';
import { COMMON_REQUIREMENTS, DIFFICULTIES, DIFFICULTY_REQUIREMENTS, DIFFICULTY_RULES, PASS_SCORE } from './config.js';

/** Simple difficulty rules (see config): never below the course's own level. */
export function difficultyFor(courseDifficulty, evaluations) {
  const passed = evaluations.filter((e) => e.total_score >= PASS_SCORE);
  const avg = passed.length ? passed.reduce((s, e) => s + e.total_score, 0) / passed.length : 0;
  let level = 0;
  if (passed.length >= DIFFICULTY_RULES.ADVANCED_AFTER && avg >= DIFFICULTY_RULES.ADVANCED_MIN_AVG) level = 2;
  else if (passed.length >= DIFFICULTY_RULES.INTERMEDIATE_AFTER) level = 1;
  return DIFFICULTIES[Math.max(level, DIFFICULTIES.indexOf(courseDifficulty))];
}

/** Template challenge for a completed module. */
export function buildChallenge({ careerId, courseId, moduleId, difficulty }) {
  const course = COURSE_BY_ID[courseId];
  const module = findModule(courseId, moduleId);
  if (!course || !module) throw new Error(`Unknown module ${courseId}/${moduleId}`);
  return {
    career_id: careerId,
    course_id: courseId,
    module_id: moduleId,
    title: module.project.title,
    description: module.project.brief,
    requirements: [...module.project.requirements, ...DIFFICULTY_REQUIREMENTS[difficulty], ...COMMON_REQUIREMENTS],
    skills: module.skills,
    difficulty,
    source: 'template',
  };
}

/** Context sent to Gemini for customisation — grounded in the template. */
export function customisationContext(challenge) {
  const course = COURSE_BY_ID[challenge.course_id];
  const module = findModule(challenge.course_id, challenge.module_id);
  return {
    career: CAREER_BY_ID[challenge.career_id]?.name,
    course: course.title,
    module: module.title,
    skills: challenge.skills,
    difficulty: challenge.difficulty,
    template: { title: challenge.title, brief: challenge.description, requirements: challenge.requirements },
  };
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Apply an AI customisation safely: only wording/scenario changes, template requirements kept. */
export function applyCustomisation(challenge, ai) {
  if (!ai || challenge.source === 'ai') return challenge; // idempotent
  const title = str(ai.title, 80);
  const scenario = str(ai.scenario, 600);
  if (!title || !scenario) return challenge;
  const extras = [
    str(ai.dataset_suggestion, 200) && `Suggested data: ${str(ai.dataset_suggestion, 200)}`,
    str(ai.extension_challenge, 200) && `Optional extension: ${str(ai.extension_challenge, 200)}`,
  ].filter(Boolean);
  return { ...challenge, title, description: scenario, requirements: [...challenge.requirements, ...extras], source: 'ai' };
}
