// Demo mode (no Supabase configured): same API as supabaseDb.js, backed by localStorage.
// Single local user; for previewing the UI only.
import { CATALOG_VERSION } from './careers.js';

export const DEMO_USER_ID = 'demo-user';
const KEY = 'app_demo_db_v1';

const empty = () => ({
  profile: { id: DEMO_USER_ID, full_name: '', interests: {}, aptitude: {}, aptitude_quiz: {}, preferences: {}, traits: {}, onboarded_at: null },
  recommendations: [],
  sessions: [],
  messages: [],
  assessmentSessions: [],
  generated: [], // mirrors generated_outputs: AI/template content kept apart from authoritative rows
});

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? empty();
  } catch {
    return empty();
  }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* preview still works in memory */ }
  return state;
}
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const now = () => new Date().toISOString();

export function resetDemo() {
  save(empty());
}

/** Raw demo snapshot (for importing browser-only progress into a real account). */
export function readDemoSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
export function clearDemoSnapshot() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ---- Generated outputs ----------------------------------------------------

const generatedList = (s) => (s.generated ??= []);

export async function saveGeneratedOutput(userId, output) {
  const s = load();
  const row = { id: id(), user_id: userId, sources: [], created_at: now(), ...output };
  generatedList(s).push(row);
  save(s);
  return row;
}

export async function getLatestGeneratedOutput(_userId, subjectType, subjectKey, kind) {
  return [...generatedList(load())]
    .filter((r) => r.subject_type === subjectType && r.subject_key === subjectKey && r.kind === kind)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function latestOutputs(s, subjectType, kind) {
  const out = {};
  for (const r of [...generatedList(s)].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (r.subject_type === subjectType && r.kind === kind) out[r.subject_id] ??= r;
  }
  return out;
}

// ---- Module 1: assessment sessions ------------------------------------------

const sessionsList = (s) => (s.assessmentSessions ??= []);

export async function getAssessmentSession() {
  return sessionsList(load()).find((r) => r.status === 'in_progress') ?? null;
}

export async function saveAssessmentDraft(userId, sessionId, { current_step, draft, quiz_answers }) {
  const s = load();
  let row = sessionsList(s).find((r) => r.id === sessionId) ?? sessionsList(s).find((r) => r.status === 'in_progress');
  if (!row) {
    row = { id: id(), user_id: userId, status: 'in_progress', started_at: now(), completed_at: null };
    sessionsList(s).push(row);
  }
  Object.assign(row, { current_step, draft, quiz_answers, updated_at: now() });
  save(s);
  return row;
}

export async function completeAssessmentSession(userId, sessionId, { draft, quiz_answers }) {
  const s = load();
  let row = sessionsList(s).find((r) => r.id === sessionId);
  if (!row) {
    row = { id: id(), user_id: userId, started_at: now(), current_step: 0 };
    sessionsList(s).push(row);
  }
  Object.assign(row, { status: 'completed', draft, quiz_answers, catalog_version: CATALOG_VERSION, completed_at: now(), updated_at: now() });
  save(s);
  return row;
}

export async function getProfile() {
  return load().profile;
}

export async function saveProfile(_userId, fields) {
  const s = load();
  s.profile = { ...s.profile, ...fields, updated_at: now() };
  return save(s).profile;
}

export async function getRecommendations() {
  const s = load();
  const ex = latestOutputs(s, 'recommendation', 'career_explanation');
  return [...s.recommendations]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({ ...r, explanation: ex[r.id]?.content ?? null, explanation_model: ex[r.id]?.model ?? null }));
}

export async function replaceRecommendations(userId, shortlist) {
  const s = load();
  s.recommendations = shortlist.map((r) => ({
    id: id(),
    user_id: userId,
    domain_id: r.domainId,
    rank: r.rank,
    score: r.score,
    breakdown: { coverage: r.coverage, rows: r.breakdown },
    catalog_version: CATALOG_VERSION,
    created_at: now(),
  }));
  return save(s).recommendations;
}

export async function saveExplanations(userId, recs, explanations, model) {
  const s = load();
  for (const r of recs) {
    if (!explanations[r.domainId] || !r.id) continue;
    generatedList(s).push({
      id: id(), user_id: userId, kind: 'career_explanation', subject_type: 'recommendation', subject_id: r.id,
      subject_key: r.domainId, content: explanations[r.domainId], generator: 'gemini', model, sources: [],
      context_version: CATALOG_VERSION, created_at: now(),
    });
  }
  save(s);
}

export async function listChatSessions() {
  return [...load().sessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createChatSession(userId, title, focusDomain = null) {
  const s = load();
  const row = { id: id(), user_id: userId, title, focus_domain: focusDomain, created_at: now() };
  s.sessions.push(row);
  save(s);
  return row;
}

export async function deleteChatSession(sessionId) {
  const s = load();
  s.sessions = s.sessions.filter((x) => x.id !== sessionId);
  s.messages = s.messages.filter((m) => m.session_id !== sessionId);
  save(s);
}

export async function getChatMessages(sessionId) {
  return load().messages.filter((m) => m.session_id === sessionId);
}

export async function addChatMessage(userId, sessionId, role, content) {
  const s = load();
  const row = { id: id(), session_id: sessionId, user_id: userId, role, content, created_at: now() };
  s.messages.push(row);
  save(s);
  return row;
}

// ---- Module 2: feasibility ------------------------------------------------

export async function getFeasibility() {
  return load().feasibility ?? null;
}

export async function saveFeasibility(userId, inputs, results, configVersion) {
  const s = load();
  const prev = s.feasibility;
  s.feasibility = {
    user_id: userId,
    ...inputs,
    results,
    config_version: configVersion,
    created_at: prev?.created_at ?? now(),
    updated_at: now(),
  };
  return save(s).feasibility;
}

// ---- Module 3: career development ----------------------------------------

const devState = (s) => {
  s.dev ??= { plan: null, coursePlans: [], moduleProgress: [], challenges: [], submissions: [], evaluations: [], skills: [], rewards: [] };
  return s.dev;
};

export async function getDevelopment() {
  const s = load();
  const d = structuredClone(devState(s));
  const custom = latestOutputs(s, 'project_challenge', 'project_customisation');
  const narrative = latestOutputs(s, 'project_evaluation', 'evaluation_feedback');
  d.challenges = d.challenges.map((c) => ({ ...c, customisation: custom[c.id]?.content ?? null }));
  d.evaluations = d.evaluations.map((e) => ({ ...e, ...(narrative[e.id]?.content ?? { strengths: [], improvements: [], feedback: null }) }));
  return d;
}

export async function saveDevelopmentPlan(userId, careerId, pathwayType) {
  const s = load();
  const d = devState(s);
  d.plan = { user_id: userId, career_id: careerId, pathway_type: pathwayType, created_at: d.plan?.created_at ?? now(), updated_at: now() };
  save(s);
  return d.plan;
}

export async function startCourse(userId, courseId, careerId, recommended) {
  const s = load();
  const d = devState(s);
  if (!d.coursePlans.some((r) => r.course_id === courseId)) {
    d.coursePlans.push({ id: id(), user_id: userId, course_id: courseId, career_id: careerId, status: 'active', recommended, started_at: now(), completed_at: null });
    save(s);
  }
}

export async function setCourseCompleted(_userId, courseId) {
  const s = load();
  const row = devState(s).coursePlans.find((r) => r.course_id === courseId);
  if (row) Object.assign(row, { status: 'completed', completed_at: now() });
  save(s);
}

export async function completeModule(userId, courseId, moduleId) {
  const s = load();
  const d = devState(s);
  if (!d.moduleProgress.some((r) => r.course_id === courseId && r.module_id === moduleId)) {
    d.moduleProgress.push({ id: id(), user_id: userId, course_id: courseId, module_id: moduleId, status: 'completed', completed_at: now() });
    save(s);
  }
}

export async function createChallenge(userId, challenge) {
  const s = load();
  const d = devState(s);
  const existing = d.challenges.find((c) => c.course_id === challenge.course_id && c.module_id === challenge.module_id);
  if (existing) return { ...existing, customisation: null };
  const { model: _m, source: _s, customisation: _c, ...rest } = challenge;
  const row = { id: id(), user_id: userId, status: 'open', created_at: now(), ...rest };
  d.challenges.push(row);
  save(s);
  return { ...row, customisation: null };
}

export async function submitProject(userId, challengeId, submission) {
  const s = load();
  const d = devState(s);
  const row = { id: id(), user_id: userId, challenge_id: challengeId, status: 'submitted', submitted_at: now(), ...submission };
  d.submissions.push(row);
  const ch = d.challenges.find((c) => c.id === challengeId);
  if (ch) ch.status = 'submitted';
  save(s);
  return row;
}

export async function recordEvaluation(userId, { evaluation, narrative, challengeStatus, skills, reward }) {
  const s = load();
  const d = devState(s);
  // Mirrors the unique(submission_id) constraint in Postgres.
  if (d.evaluations.some((e) => e.submission_id === evaluation.submission_id)) {
    throw new Error('This submission has already been evaluated');
  }
  const ev = { id: id(), user_id: userId, evaluated_at: now(), ...evaluation };
  d.evaluations.push(ev);
  const sub = d.submissions.find((x) => x.id === evaluation.submission_id);
  if (sub) sub.status = 'evaluated';
  const ch = d.challenges.find((c) => c.id === evaluation.challenge_id);
  if (ch) ch.status = challengeStatus;
  for (const skill of skills) {
    const cur = d.skills.find((x) => x.skill === skill);
    if (!cur) {
      d.skills.push({ id: id(), user_id: userId, skill, score: evaluation.total_score, source_challenge_id: evaluation.challenge_id, demonstrated_at: now() });
    } else if (evaluation.total_score > cur.score) {
      Object.assign(cur, { score: evaluation.total_score, source_challenge_id: evaluation.challenge_id, demonstrated_at: now() });
    }
  }
  if (reward) d.rewards.push({ id: id(), user_id: userId, created_at: now(), ...reward });
  if (narrative) {
    generatedList(s).push({
      id: id(), user_id: userId, kind: 'evaluation_feedback', subject_type: 'project_evaluation', subject_id: ev.id,
      content: { feedback: narrative.feedback, strengths: narrative.strengths, improvements: narrative.improvements },
      generator: narrative.generator, model: narrative.model ?? null, sources: [], created_at: now(),
    });
  }
  save(s);
  return { ...ev, ...(narrative ? { feedback: narrative.feedback, strengths: narrative.strengths, improvements: narrative.improvements } : {}) };
}
