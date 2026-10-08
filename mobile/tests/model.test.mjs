// Unit tests for the mobile view-model (src/model.js): run with `npm test` in mobile/.
// The data is produced by Praxio's own scoring/feasibility/decision logic, so it has the exact
// shapes the app receives from Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { derive, pickInputs, timeAgo, reminderText, weeklyActivity, pathCourses } = await import('../src/model.js');
const { rankCareers, shortlist } = await import('../../app/src/lib/scoring.js');
const { INTERESTS, APTITUDES, TRAITS, PREFERENCES } = await import('../../app/src/lib/features.js');
const F = await import('../../app/src/lib/feasibility/config.js');
const { COURSE_BY_ID } = await import('../../app/src/lib/development/catalog.js');
const { buildDecisionInputs } = await import('../../app/src/lib/decisionInputs.js');
const { decide } = await import('../../app/src/lib/decision/engine.js');

const score = (list, hi) => Object.fromEntries(list.map((x, i) => [x.key, hi.includes(x.key) ? 5 : (i % 3) + 2]));
function realistic() {
  const profile = {
    id: 'u1', full_name: 'Asha Rao', current_stage: 'school_12', primary_goal: 'choose_degree', school_stream: 'pcm',
    interests: score(INTERESTS, ['int_software']), aptitude: score(APTITUDES, ['apt_programming']),
    traits: score(TRAITS, []), preferences: score(PREFERENCES, ['pref_coding']), onboarded_at: '2026-10-01T00:00:00Z',
  };
  const recs = shortlist(rankCareers(profile));
  const feasibilityRow = {
    income_band: F.INCOME_BANDS[2].id, education_budget: F.BUDGET_BANDS[2].id, loan_willingness: F.LOAN_OPTIONS[1].id,
    risk_tolerance: F.RISK_LEVELS[1].id, education_preference: F.EDUCATION_OPTIONS[1].id, relocation: F.RELOCATION_OPTIONS[1].id,
    family_priorities: [F.FAMILY_PRIORITIES[0].id], primary_funder: 'family', scholarship_interest: 'no', id: 'row', user_id: 'u1',
  };
  const dev = { plan: null, coursePlans: [], moduleProgress: [], challenges: [], submissions: [], evaluations: [], skills: [], rewards: [] };
  const decision = decide(buildDecisionInputs({ profile, recs, inputs: pickInputs(feasibilityRow), dev, marketById: {}, academicRecords: null }));
  return { profile, recs, feasibilityRow, dev, decision, errors: [] };
}

test('derive never throws on empty or garbage input', () => {
  for (const raw of [undefined, null, {}, 'oops', 42, { recs: 'x', dev: 5, feasibilityRow: 'y', profile: { onboarded_at: '2026' } }]) {
    const d = derive(raw);
    assert.equal(d.m1Done, false);
    assert.equal(d.m2Done, false);
    assert.deepEqual(d.stages, []);
    assert.ok(d.progress && typeof d.progress.isDone === 'function');
  }
});

test('derive on realistic data: matches, feasibility and a learning path', () => {
  const d = derive(realistic());
  assert.ok(d.m1Done && d.m2Done);
  assert.ok(d.chosen, 'a pathway is chosen');
  assert.ok(d.stages.some((s) => s.kind === 'course'), 'path has courses');
  assert.ok(Object.keys(d.feasibility).length > 0);
  assert.deepEqual(d.errors, []);
});

test('old or partial caches (missing lists) still derive', () => {
  const raw = realistic();
  raw.dev = { plan: null }; // a cache written before some lists existed
  const d = derive(raw);
  assert.ok(d.m2Done);
  assert.deepEqual(d.dev.challenges, []);
  assert.equal(d.progress.points, 0);
});

test('everything the app caches survives a JSON round trip (offline mode)', () => {
  const raw = realistic();
  const restored = JSON.parse(JSON.stringify(raw)); // throws on circular data
  const a = derive(raw);
  const b = derive(restored);
  assert.equal(b.m2Done, a.m2Done);
  assert.equal(b.chosen?.id, a.chosen?.id);
  assert.equal(b.stages.length, a.stages.length);
});

test('reminder text follows the real next step', () => {
  const d = derive(realistic());
  assert.match(reminderText(d), /Keep going: “.+” is next in .+\./);
  const withProject = { ...d, dev: { ...d.dev, challenges: [{ status: 'open', title: 'Grade Calculator CLI' }] } };
  assert.match(reminderText(withProject), /Grade Calculator CLI.+waiting/);
  const needsWork = { ...d, dev: { ...d.dev, challenges: [{ status: 'needs_improvement', title: 'Grade Calculator CLI' }] } };
  assert.match(reminderText(needsWork), /needs one more pass/);
  assert.equal(reminderText({ decision: { nextAction: { title: 'Compare degrees' } } }), 'Your next move: Compare degrees');
  assert.equal(reminderText(null), 'Check your next move in Praxio.');
});

test('weekly activity counts real events and streaks', () => {
  const now = new Date(2026, 9, 8, 18, 0); // Thu 8 Oct 2026, local time
  const at = (daysAgo, hour = 10) => new Date(2026, 9, 8 - daysAgo, hour).toISOString();
  const dev = {
    moduleProgress: [
      { status: 'completed', completed_at: at(0) }, { status: 'completed', completed_at: at(1) },
      { status: 'completed', completed_at: at(2) }, { status: 'in_progress', completed_at: at(3) },
      { status: 'completed', completed_at: 'not a date' }, { status: 'completed', completed_at: at(20) },
    ],
    submissions: [{ submitted_at: at(1, 15) }],
  };
  const w = weeklyActivity(dev, now);
  assert.equal(w.days.length, 7);
  assert.equal(w.days[6].today, true);
  assert.equal(w.modules, 3);
  assert.equal(w.projects, 1);
  assert.equal(w.activeDays, 3);
  assert.equal(w.streak, 3);
  // Nothing yet today: the streak still counts up to yesterday.
  const w2 = weeklyActivity({ moduleProgress: [{ status: 'completed', completed_at: at(1) }, { status: 'completed', completed_at: at(2) }] }, now);
  assert.equal(w2.streak, 2);
  const empty = weeklyActivity(null, now);
  assert.equal(empty.modules + empty.projects + empty.streak, 0);
});

test('path courses list every module with done flags', () => {
  const raw = realistic();
  const first = derive(raw).stages.find((s) => s.kind === 'course');
  const course = COURSE_BY_ID[first.courseId];
  raw.dev.moduleProgress = [{ course_id: course.id, module_id: course.modules[0].id, status: 'completed', completed_at: '2026-10-07T10:00:00Z' }];
  const courses = pathCourses(derive(raw));
  const c = courses.find((x) => x.courseId === course.id);
  assert.equal(c.modules.length, course.modules.length);
  assert.equal(c.modules[0].done, true);
  assert.equal(c.modules.filter((m) => m.done).length, 1);
  assert.equal(c.done, 1);
  assert.deepEqual(pathCourses(null), []);
});

test('timeAgo', () => {
  const now = 1_000_000_000_000;
  assert.equal(timeAgo(now - 5_000, now), 'just now');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3 h ago');
  assert.equal(timeAgo(now - 86_400_000, now), '1 day ago');
  assert.equal(timeAgo(undefined, now), '');
});
