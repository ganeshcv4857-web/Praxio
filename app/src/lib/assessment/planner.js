// Adaptive assessment planner. Pure and deterministic: no I/O, no AI, no React, no mutation.
// Same context + same answers → same plan.
//
//   planAssessment(context, answers, catalog, { assessment })
//     → { visible, questions, next, pages, complete }
//
// answers: flat { [questionId]: value | UNKNOWN }. UNKNOWN is an explicit "I don't know /
// not sure / haven't tried" — it counts as answered, but never becomes module data.

import { CATALOG, PAGES, ASSESSMENT_VERSION } from './catalog.js';

export const UNKNOWN = '__unknown__';

const isAnswered = (v) => v !== undefined && v !== null && v !== '';
const own = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined);

/** Stage/goal for planning: explicit context first, then the answers themselves. */
function planContext(context, answers) {
  return {
    stage: context?.stage ?? own(answers, 'current_stage') ?? null,
    goal: context?.goal ?? own(answers, 'primary_goal') ?? null,
  };
}

/** Is a question applicable to this person right now? */
export function isVisible(q, answers, ctx) {
  if (q.stages !== null && !q.stages.includes(ctx.stage)) return false;
  if (q.goals !== null && !q.goals.includes(ctx.goal)) return false;
  return q.when ? Boolean(q.when(answers, ctx)) : true;
}

const byOrder = (pages) => (a, b) => pages.indexOf(a.page) - pages.indexOf(b.page) || a.priority - b.priority || a.id.localeCompare(b.id);

export function planAssessment(context = {}, answers = {}, catalog = CATALOG, { assessment = 'profile' } = {}) {
  const ctx = planContext(context, answers ?? {});
  const pageOrder = PAGES[assessment] ?? [];
  let pool = catalog.filter((q) => q.assessment === assessment);
  // Before a stage is known, only the first page (where the stage is chosen) applies.
  if (assessment === 'profile' && !ctx.stage) pool = pool.filter((q) => q.page === pageOrder[0]);

  const seen = new Set();
  const visible = pool
    .filter((q) => isVisible(q, answers ?? {}, ctx))
    .sort(byOrder(pageOrder))
    .filter((q) => (seen.has(q.id) ? false : seen.add(q.id)));

  const answered = (q) => isAnswered(own(answers, q.id));
  const pages = pageOrder
    .map((id) => {
      const qs = visible.filter((q) => q.page === id);
      return { id, questions: qs.map((q) => q.id), complete: qs.every((q) => !q.required || answered(q)) };
    })
    .filter((p) => p.questions.length);
  const open = visible.filter((q) => !answered(q));

  return {
    visible: visible.map((q) => q.id),
    questions: open.map((q) => q.id),
    next: open[0]?.id ?? null,
    pages,
    complete: visible.every((q) => !q.required || answered(q)),
  };
}

// ---------------------------------------------------------------- storage adapters
const pathOf = (q) => q.field.split('.');

/**
 * Answers from stored data: a profile-shaped object (or a draft), the quiz answer list, and
 * assessment_meta (which records explicit unknowns). Missing values stay missing.
 */
export function readAnswers({ profile = {}, quiz = [], meta = {} } = {}, catalog = CATALOG, { assessment = 'profile' } = {}) {
  const out = {};
  for (const q of catalog.filter((x) => x.assessment === assessment)) {
    if (meta?.answers?.[q.id]?.status === 'unknown') { out[q.id] = UNKNOWN; continue; }
    const [head, key] = pathOf(q);
    const value = head === 'quiz' ? quiz?.[Number(key)] : key ? own(own(profile, head), key) : own(profile, head);
    if (isAnswered(value)) out[q.id] = value;
  }
  return out;
}

/**
 * Save payload from answers: ONLY visible questions are written; UNKNOWN is never written as
 * module data (it is recorded in meta instead); hidden questions create no answers.
 *   fields  profile-shaped values. A nested map (interests, preferences, …) is included only
 *           if one of its questions is visible; a top-level field whose questions are all
 *           hidden is written as null.
 *   quiz    quiz answer list (null for unanswered / unknown)
 *   meta    { version, answers: { [id]: { status: 'answered' | 'unknown', v } } }
 */
export function writeAnswers(answers, plan, catalog = CATALOG, { assessment = 'profile', version = ASSESSMENT_VERSION } = {}) {
  const visible = new Set(plan.visible);
  const qs = catalog.filter((q) => q.assessment === assessment);
  const fields = {};
  const quiz = [];
  const metaAnswers = {};
  for (const q of qs) {
    const [head, key] = pathOf(q);
    if (head === 'quiz') { quiz[Number(key)] = null; continue; }
    if (key && visible.has(q.id)) fields[head] ??= {};
  }
  for (const q of qs) {
    if (!visible.has(q.id)) continue;
    const value = own(answers, q.id);
    if (!isAnswered(value)) continue;
    metaAnswers[q.id] = { status: value === UNKNOWN ? 'unknown' : 'answered', v: q.v };
    if (value === UNKNOWN) continue;
    const [head, key] = pathOf(q);
    if (head === 'quiz') quiz[Number(key)] = value;
    else if (key) fields[head][key] = value;
    else fields[head] = value;
  }
  // A top-level field with no written value is null: hidden questions and explicit unknowns
  // must clear it rather than leave an older stored value standing.
  for (const q of qs) {
    const [head, key] = pathOf(q);
    if (!key && head !== 'quiz' && !(head in fields)) fields[head] = null;
  }
  return { fields, quiz, meta: { version, answers: metaAnswers } };
}
