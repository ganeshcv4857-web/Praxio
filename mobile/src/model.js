// Pure view-model for the mobile app: no React Native imports, so it is unit-tested with Node
// (tests/model.test.mjs). Everything here turns raw Praxio records into what the screens show,
// using the website's shared logic. Defensive by design: any missing or odd field degrades to
// an empty state instead of throwing.
import { isComplete, evaluateAll } from '../../app/src/lib/feasibility/scoring.js';
import { deriveProgress, pathwayStages } from '../../app/src/lib/development/learning.js';
import { rankPathways } from '../../app/src/lib/development/pathways.js';
import { COURSE_BY_ID } from '../../app/src/lib/development/catalog.js';

// Same keys as the website's feasibility wizard (pickInputs).
const FEASIBILITY_KEYS = [
  'income_band', 'education_budget', 'loan_willingness', 'risk_tolerance', 'education_preference',
  'location_preference', 'relocation', 'family_priorities', 'primary_funder', 'scholarship_interest',
];
export function pickInputs(row) {
  if (!row || typeof row !== 'object') return {};
  return Object.fromEntries(FEASIBILITY_KEYS.filter((k) => row[k] != null).map((k) => [k, row[k]]));
}

const arr = (v) => (Array.isArray(v) ? v : []);

/** Normalise a development record so every list is an array (old caches, partial loads). */
function normaliseDev(dev) {
  if (!dev || typeof dev !== 'object') return null;
  return {
    ...dev,
    coursePlans: arr(dev.coursePlans), moduleProgress: arr(dev.moduleProgress), challenges: arr(dev.challenges),
    submissions: arr(dev.submissions), evaluations: arr(dev.evaluations), skills: arr(dev.skills), rewards: arr(dev.rewards),
  };
}

/** Everything the screens need, derived from raw records. Never throws. */
export function derive(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const errors = [...arr(r.errors)];
  const profile = r.profile ?? null;
  const recs = arr(r.recs).filter((x) => x && typeof x.domainId === 'string');
  const dev = normaliseDev(r.dev);
  const decision = r.decision ?? null;
  const inputs = pickInputs(r.feasibilityRow);
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  let m2Done = false;
  try { m2Done = m1Done && isComplete(inputs); } catch { m2Done = false; }

  let progress;
  try {
    progress = deriveProgress(dev);
  } catch (e) {
    errors.push(`Progress: ${e?.message ?? 'failed'}`);
    progress = deriveProgress(null);
  }

  let chosen = null;
  let stages = [];
  let feasibility = {};
  if (m2Done) {
    try {
      const pathways = rankPathways(recs, inputs);
      chosen = (dev?.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || pathways[0] || null;
      stages = chosen ? pathwayStages(chosen, progress) : [];
    } catch (e) {
      errors.push(`Learning path: ${e?.message ?? 'failed'}`);
    }
    try {
      feasibility = Object.fromEntries(evaluateAll(inputs, recs).map((x) => [x.domainId, x]));
    } catch (e) {
      errors.push(`Feasibility results: ${e?.message ?? 'failed'}`);
    }
  }
  return { profile, recs, inputs, feasibility, dev, decision, progress, chosen, stages, m1Done, m2Done, errors };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** One short, specific reminder line from the person's real data. */
export function reminderText(data) {
  const d = data ?? {};
  const challenges = arr(d.dev?.challenges);
  const project = challenges.find((c) => c?.status === 'needs_improvement') ?? challenges.find((c) => c?.status === 'open');
  if (project?.title) {
    return project.status === 'needs_improvement'
      ? `“${project.title}” needs one more pass. Use the feedback and resubmit.`
      : `Your project “${project.title}” is waiting. Submit it to prove the skill.`;
  }
  const current = arr(d.stages).find((s) => s?.kind === 'course' && s.status === 'current');
  const course = current ? COURSE_BY_ID[current.courseId] : null;
  const next = current?.progress?.next?.title;
  if (course && next) return `Keep going: “${next}” is next in ${course.title}.`;
  if (d.decision?.nextAction?.title) return `Your next move: ${d.decision.nextAction.title}`;
  return 'Check your next move in Praxio.';
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The last 7 days (oldest first) from real timestamps: modules completed and projects submitted.
 * Streak = consecutive days with activity ending today (or yesterday, if nothing yet today).
 */
export function weeklyActivity(dev, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ key: dayKey(d), label: WEEKDAY[d.getDay()], modules: 0, projects: 0, today: i === 0 });
  }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  const seen = new Set(); // every active day, for the streak (not just this week)
  const add = (ts, field) => {
    const t = ts ? new Date(ts) : null;
    if (!t || Number.isNaN(t.getTime())) return;
    const k = dayKey(t);
    seen.add(k);
    if (byKey[k]) byKey[k][field] += 1;
  };
  for (const m of arr(dev?.moduleProgress)) if (m?.status === 'completed') add(m.completed_at, 'modules');
  for (const s of arr(dev?.submissions)) add(s?.submitted_at, 'projects');

  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!seen.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (seen.has(dayKey(cursor)) && streak < 366) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    days,
    modules: days.reduce((s, d) => s + d.modules, 0),
    projects: days.reduce((s, d) => s + d.projects, 0),
    activeDays: days.filter((d) => d.modules + d.projects > 0).length,
    streak,
  };
}

/** Course stages on the chosen path, each with its full module list and done flags. */
export function pathCourses(data) {
  const d = data ?? {};
  const isDone = typeof d.progress?.isDone === 'function' ? d.progress.isDone : () => false;
  return arr(d.stages)
    .filter((s) => s?.kind === 'course' && COURSE_BY_ID[s.courseId])
    .map((s) => {
      const course = COURSE_BY_ID[s.courseId];
      return {
        courseId: course.id, title: course.title, status: s.status, stageTitle: s.title,
        done: s.progress?.done ?? 0, total: s.progress?.total ?? course.modules.length,
        modules: course.modules.map((m) => ({ id: m.id, title: m.title, skills: arr(m.skills), done: Boolean(isDone(course.id, m.id)) })),
      };
    });
}
