// Data layer over Supabase (Postgres + RLS). The signed-in user's id (auth.uid()) is
// the root of every row; RLS enforces ownership in the database, so the explicit
// user_id filters here are for clarity and index use, not security.
//
// Authoritative Praxio records and generated (AI/template) content are stored apart:
// generated text lives only in `generated_outputs` and is attached on read, so it can
// never overwrite a score, answer or decision.
import { supabase } from './supabase.js';
import { CATALOG_VERSION } from './careers.js';
import { notifySessionExpired } from './session.js';

// PostgREST / GoTrue signals that the JWT is no longer valid.
const isAuthError = (e) =>
  e?.code === 'PGRST301' || e?.code === 'PGRST302' || e?.status === 401 || /jwt|token is expired|not authenticated/i.test(e?.message ?? '');

const unwrap = ({ data, error }) => {
  if (error) {
    if (isAuthError(error)) notifySessionExpired();
    throw error;
  }
  return data;
};

// ---- Generated outputs ----------------------------------------------------

/** Record a generated output (append-only). */
export async function saveGeneratedOutput(userId, output) {
  return unwrap(await supabase.from('generated_outputs').insert({ user_id: userId, ...output }).select().single());
}

/** Latest output per subject id for one kind, as { subjectId: row }. */
async function latestOutputs(userId, subjectType, kind, ids) {
  if (!ids.length) return {};
  const rows = unwrap(
    await supabase.from('generated_outputs').select('*')
      .eq('user_id', userId).eq('subject_type', subjectType).eq('kind', kind).in('subject_id', ids)
      .order('created_at', { ascending: false })
  );
  const out = {};
  for (const r of rows) out[r.subject_id] ??= r;
  return out;
}

// ---- Profile ----------------------------------------------------------------

export async function getProfile(userId) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single());
}

export async function saveProfile(userId, fields) {
  return unwrap(
    await supabase.from('profiles').update(fields).eq('id', userId).select().single()
  );
}

// ---- Module 1: assessment sessions ------------------------------------------

export async function getAssessmentSession(userId) {
  return unwrap(
    await supabase.from('assessment_sessions').select('*')
      .eq('user_id', userId).eq('status', 'in_progress').maybeSingle()
  );
}

/** Save draft progress, creating the in-progress session on first save. */
export async function saveAssessmentDraft(userId, sessionId, { current_step, draft, quiz_answers }) {
  if (sessionId) {
    return unwrap(
      await supabase.from('assessment_sessions').update({ current_step, draft, quiz_answers })
        .eq('id', sessionId).eq('user_id', userId).select().single()
    );
  }
  return unwrap(
    await supabase.from('assessment_sessions')
      .insert({ user_id: userId, current_step, draft, quiz_answers }).select().single()
  );
}

export async function completeAssessmentSession(userId, sessionId, { draft, quiz_answers }) {
  const fields = {
    status: 'completed', draft, quiz_answers, catalog_version: CATALOG_VERSION,
    completed_at: new Date().toISOString(),
  };
  if (sessionId) {
    return unwrap(await supabase.from('assessment_sessions').update(fields).eq('id', sessionId).eq('user_id', userId).select().single());
  }
  return unwrap(await supabase.from('assessment_sessions').insert({ user_id: userId, current_step: 0, ...fields }).select().single());
}

// ---- Module 1: recommendations -----------------------------------------------

/** Shortlist rows (authoritative scores) with the latest explanation attached. */
export async function getRecommendations(userId) {
  const rows = unwrap(await supabase.from('recommendations').select('*').eq('user_id', userId).order('rank'));
  const ex = await latestOutputs(userId, 'recommendation', 'career_explanation', rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, explanation: ex[r.id]?.content ?? null, explanation_model: ex[r.id]?.model ?? null }));
}

/** Replace the user's shortlist with a freshly scored one. Old explanations stay as history. */
export async function replaceRecommendations(userId, shortlist) {
  unwrap(await supabase.from('recommendations').delete().eq('user_id', userId));
  const rows = shortlist.map((r) => ({
    user_id: userId,
    domain_id: r.domainId,
    rank: r.rank,
    score: r.score,
    breakdown: { coverage: r.coverage, rows: r.breakdown },
    catalog_version: CATALOG_VERSION,
  }));
  return unwrap(await supabase.from('recommendations').insert(rows).select().order('rank'));
}

/** Store explanations as generated outputs linked to each recommendation row. */
export async function saveExplanations(userId, recs, explanations, model) {
  const rows = recs
    .filter((r) => explanations[r.domainId] && r.id)
    .map((r) => ({
      user_id: userId,
      kind: 'career_explanation',
      subject_type: 'recommendation',
      subject_id: r.id,
      subject_key: r.domainId,
      content: explanations[r.domainId],
      generator: 'gemini',
      model,
      context_version: CATALOG_VERSION,
    }));
  if (rows.length) unwrap(await supabase.from('generated_outputs').insert(rows));
}

// ---- Advisor chat -----------------------------------------------------------

export async function listChatSessions(userId) {
  return unwrap(
    await supabase.from('chat_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  );
}

export async function createChatSession(userId, title, focusDomain = null) {
  return unwrap(
    await supabase.from('chat_sessions').insert({ user_id: userId, title, focus_domain: focusDomain }).select().single()
  );
}

export async function deleteChatSession(sessionId) {
  unwrap(await supabase.from('chat_sessions').delete().eq('id', sessionId));
}

export async function getChatMessages(sessionId) {
  return unwrap(
    await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at')
  );
}

export async function addChatMessage(userId, sessionId, role, content) {
  return unwrap(
    await supabase.from('chat_messages').insert({ user_id: userId, session_id: sessionId, role, content }).select().single()
  );
}

// ---- Module 2: feasibility ------------------------------------------------

export async function getFeasibility(userId) {
  return unwrap(
    await supabase.from('feasibility_assessments').select('*').eq('user_id', userId).maybeSingle()
  );
}

/** Upsert the student's single feasibility row (inputs + cached results). */
export async function saveFeasibility(userId, inputs, results, configVersion) {
  return unwrap(
    await supabase
      .from('feasibility_assessments')
      .upsert({ user_id: userId, ...inputs, results, config_version: configVersion }, { onConflict: 'user_id' })
      .select()
      .single()
  );
}

// ---- Module 3: career development ----------------------------------------

/**
 * All Module 3 rows. Generated content is attached read-only:
 *   challenge.customisation  ← latest 'project_customisation'
 *   evaluation.{feedback, strengths, improvements} ← latest 'evaluation_feedback'
 */
export async function getDevelopment(userId) {
  const q = (table, order) => supabase.from(table).select('*').eq('user_id', userId).order(order);
  const [plan, coursePlans, moduleProgress, challenges, submissions, evaluations, skills, rewards] = await Promise.all([
    supabase.from('development_plans').select('*').eq('user_id', userId).maybeSingle(),
    q('student_course_plans', 'started_at'),
    q('course_module_progress', 'completed_at'),
    q('project_challenges', 'created_at'),
    q('project_submissions', 'submitted_at'),
    q('project_evaluations', 'evaluated_at'),
    q('demonstrated_skills', 'demonstrated_at'),
    q('reward_transactions', 'created_at'),
  ]);
  const ch = unwrap(challenges);
  const evs = unwrap(evaluations);
  const [custom, narrative] = await Promise.all([
    latestOutputs(userId, 'project_challenge', 'project_customisation', ch.map((c) => c.id)),
    latestOutputs(userId, 'project_evaluation', 'evaluation_feedback', evs.map((e) => e.id)),
  ]);
  return {
    plan: unwrap(plan),
    coursePlans: unwrap(coursePlans),
    moduleProgress: unwrap(moduleProgress),
    challenges: ch.map((c) => ({ ...c, customisation: custom[c.id]?.content ?? null })),
    submissions: unwrap(submissions),
    evaluations: evs.map((e) => ({ ...e, ...(narrative[e.id]?.content ?? { strengths: [], improvements: [], feedback: null }) })),
    skills: unwrap(skills),
    rewards: unwrap(rewards),
  };
}

export async function saveDevelopmentPlan(userId, careerId, pathwayType) {
  return unwrap(
    await supabase.from('development_plans')
      .upsert({ user_id: userId, career_id: careerId, pathway_type: pathwayType }, { onConflict: 'user_id' })
      .select().single()
  );
}

export async function startCourse(userId, courseId, careerId, recommended) {
  unwrap(
    await supabase.from('student_course_plans')
      .upsert({ user_id: userId, course_id: courseId, career_id: careerId, recommended }, { onConflict: 'user_id,course_id', ignoreDuplicates: true })
  );
}

export async function setCourseCompleted(userId, courseId) {
  unwrap(
    await supabase.from('student_course_plans')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('user_id', userId).eq('course_id', courseId)
  );
}

export async function completeModule(userId, courseId, moduleId) {
  unwrap(
    await supabase.from('course_module_progress')
      .upsert({ user_id: userId, course_id: courseId, module_id: moduleId }, { onConflict: 'user_id,course_id,module_id', ignoreDuplicates: true })
  );
}

const CHALLENGE_COLUMNS = ['career_id', 'course_id', 'module_id', 'title', 'description', 'requirements', 'skills', 'difficulty'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/** Insert the module's challenge (template wording), or return the existing one. */
export async function createChallenge(userId, challenge) {
  const existing = unwrap(
    await supabase.from('project_challenges').select('*')
      .eq('user_id', userId).eq('course_id', challenge.course_id).eq('module_id', challenge.module_id).maybeSingle()
  );
  if (existing) return { ...existing, customisation: null };
  const row = unwrap(
    await supabase.from('project_challenges').insert({ user_id: userId, ...pick(challenge, CHALLENGE_COLUMNS) }).select().single()
  );
  return { ...row, customisation: null };
}

export async function submitProject(userId, challengeId, submission) {
  const row = unwrap(
    await supabase.from('project_submissions').insert({ user_id: userId, challenge_id: challengeId, ...submission }).select().single()
  );
  unwrap(await supabase.from('project_challenges').update({ status: 'submitted' }).eq('id', challengeId));
  return row;
}

/**
 * Persist an evaluation decision and its consequences (challenge status, skills, reward);
 * the narrative (strengths/improvements/feedback) is stored as a generated output.
 */
export async function recordEvaluation(userId, { evaluation, narrative, challengeStatus, skills, reward }) {
  const ev = unwrap(await supabase.from('project_evaluations').insert({ user_id: userId, ...evaluation }).select().single());
  unwrap(await supabase.from('project_submissions').update({ status: 'evaluated' }).eq('id', evaluation.submission_id));
  unwrap(await supabase.from('project_challenges').update({ status: challengeStatus }).eq('id', evaluation.challenge_id));

  if (narrative) {
    unwrap(await supabase.from('generated_outputs').insert({
      user_id: userId,
      kind: 'evaluation_feedback',
      subject_type: 'project_evaluation',
      subject_id: ev.id,
      content: { feedback: narrative.feedback, strengths: narrative.strengths, improvements: narrative.improvements },
      generator: narrative.generator,
      model: narrative.model ?? null,
    }));
  }

  if (skills.length) {
    const existing = unwrap(await supabase.from('demonstrated_skills').select('*').eq('user_id', userId).in('skill', skills));
    const best = Object.fromEntries(existing.map((s) => [s.skill, s.score]));
    const rows = skills
      .filter((s) => best[s] == null || evaluation.total_score > best[s])
      .map((s) => ({
        user_id: userId, skill: s, score: evaluation.total_score,
        source_challenge_id: evaluation.challenge_id, demonstrated_at: new Date().toISOString(),
      }));
    if (rows.length) unwrap(await supabase.from('demonstrated_skills').upsert(rows, { onConflict: 'user_id,skill' }));
  }
  if (reward) unwrap(await supabase.from('reward_transactions').insert({ user_id: userId, ...reward }));
  return { ...ev, ...(narrative ? { feedback: narrative.feedback, strengths: narrative.strengths, improvements: narrative.improvements } : {}) };
}
