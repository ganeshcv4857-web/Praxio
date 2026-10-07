// Adaptive assessment: pure deterministic planner + storage adapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const C = await import('../src/lib/assessment/catalog.js');
const P = await import('../src/lib/assessment/planner.js');
const { STAGE_PROFILES } = await import('../src/lib/userContext.js');
const { planAssessment, readAnswers, writeAnswers, UNKNOWN } = P;
const STAGES = Object.keys(STAGE_PROFILES);

// Small synthetic catalog for gate behaviour (independent of the content phases).
const g = (o) => Object.freeze({ v: 1, assessment: 'profile', stages: null, goals: null, when: null, requires: [], required: false, unknown: null, priority: 50, feeds: [{ module: 'career_fit', use: 'x' }], purpose: 'p', label: o.id, ...o });
const GATED = [
  g({ id: 'current_stage', page: 'stage', kind: 'choice', field: 'current_stage', required: true, priority: 1 }),
  g({ id: 'gate', page: 'aptitude', kind: 'choice', field: 'meta_only', required: true, priority: 1 }),
  g({ id: 'follow', page: 'aptitude', kind: 'likert', field: 'aptitude.apt_programming', required: true, priority: 2, requires: ['gate'], when: (a) => a.gate === 'yes' }),
  g({ id: 'late', page: 'preferences', kind: 'slider', field: 'preferences.pref_coding', priority: 1, requires: ['gate'], when: (a) => a.gate === 'yes' }),
  g({ id: 'school_only', page: 'about', kind: 'choice', field: 'school_stream', stages: ['school_11'], priority: 1 }),
  g({ id: 'goal_only', page: 'about', kind: 'choice', field: 'goal_thing', goals: ['higher_studies'], priority: 2 }),
];

// ------------------------------------------------------------------ visibility
test('before a stage is chosen, only the stage page is planned', () => {
  const p = planAssessment({}, {});
  assert.deepEqual(p.pages.map((x) => x.id), ['stage']);
  assert.equal(p.next, 'current_stage');
  assert.equal(p.complete, false);
});

test('every stage gets only its applicable questions (real catalog)', () => {
  for (const stage of STAGES) {
    const p = planAssessment({}, { current_stage: stage });
    for (const id of p.visible) {
      const q = C.QUESTION_BY_ID[id];
      assert.ok(q.stages === null || q.stages.includes(stage), `${stage}: ${id}`);
    }
    const hidden = C.CATALOG.filter((q) => q.assessment === 'profile' && q.stages && !q.stages.includes(stage)).map((q) => q.id);
    for (const id of hidden) assert.ok(!p.visible.includes(id), `${stage} must not see ${id}`);
  }
});

test('goal-specific questions follow the goal', () => {
  const off = planAssessment({}, { current_stage: 'undergraduate', primary_goal: 'find_job' }, GATED);
  const on = planAssessment({}, { current_stage: 'undergraduate', primary_goal: 'higher_studies' }, GATED);
  assert.ok(!off.visible.includes('goal_only'));
  assert.ok(on.visible.includes('goal_only'));
});

test('gated follow-ups: hidden until the gate says yes; unknown suppresses them', () => {
  const base = { current_stage: 'school_11' };
  assert.ok(!planAssessment({}, base, GATED).visible.includes('follow'));
  for (const v of ['no', UNKNOWN]) {
    const p = planAssessment({}, { ...base, gate: v }, GATED);
    assert.ok(!p.visible.includes('follow') && !p.visible.includes('late'), String(v));
  }
  const yes = planAssessment({}, { ...base, gate: 'yes' }, GATED);
  assert.ok(yes.visible.includes('follow') && yes.visible.includes('late'));
});

test('prerequisites are always planned before their dependents', () => {
  const p = planAssessment({}, { current_stage: 'school_11', gate: 'yes' }, GATED);
  for (const id of p.visible) {
    for (const dep of GATED.find((q) => q.id === id).requires) {
      assert.ok(p.visible.indexOf(dep) < p.visible.indexOf(id), `${dep} before ${id}`);
    }
  }
});

test('answered questions are not repeated; complete only when required ones are answered', () => {
  const answers = { current_stage: 'undergraduate', gate: 'yes' };
  let p = planAssessment({}, answers, GATED);
  assert.deepEqual(p.questions, ['follow', 'late']);
  assert.equal(p.next, 'follow');
  assert.equal(p.complete, false);
  p = planAssessment({}, { ...answers, follow: 4 }, GATED);
  assert.deepEqual(p.questions, ['late']);
  assert.equal(p.complete, true, 'optional question left open');
  assert.equal(planAssessment({}, { ...answers, follow: UNKNOWN }, GATED).complete, true, 'explicit unknown answers a required question');
});

test('pages keep the existing page order; page completeness is per page', () => {
  const p = planAssessment({}, { current_stage: 'undergraduate' });
  const order = C.PAGES.profile;
  const ids = p.pages.map((x) => x.id);
  assert.deepEqual(ids, order.filter((x) => ids.includes(x)));
  assert.equal(p.pages.find((x) => x.id === 'quiz').complete, true, 'quiz is optional');
  assert.equal(p.pages.find((x) => x.id === 'interests').complete, false);
});

test('deterministic and duplicate-free; inputs not mutated', () => {
  for (const stage of STAGES) {
    const answers = { current_stage: stage, primary_goal: STAGE_PROFILES[stage].goals[0], int_software: 4 };
    const before = structuredClone(answers);
    const a = planAssessment({}, answers);
    const b = planAssessment({}, answers);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.visible).size, a.visible.length);
    assert.deepEqual(answers, before);
  }
  const shuffled = [...GATED].reverse();
  assert.deepEqual(planAssessment({}, { current_stage: 'school_11', gate: 'yes' }, shuffled).visible, planAssessment({}, { current_stage: 'school_11', gate: 'yes' }, GATED).visible);
});

test('explicit context overrides stage/goal from answers', () => {
  const p = planAssessment({ stage: 'school_11' }, { current_stage: 'undergraduate' });
  assert.ok(p.visible.includes('school_stream'));
  assert.ok(!p.visible.includes('branch'));
});

test('feasibility assessment plans Module 2 pages only', () => {
  const p = planAssessment({ stage: 'undergraduate' }, {}, C.CATALOG, { assessment: 'feasibility' });
  assert.deepEqual(p.pages.map((x) => x.id), C.PAGES.feasibility);
  assert.ok(p.visible.every((id) => C.QUESTION_BY_ID[id].assessment === 'feasibility'));
});

// ------------------------------------------------------------------ adapters
test('readAnswers: reads stored values, keeps missing ones missing, restores explicit unknowns', () => {
  const profile = { current_stage: 'school_11', school_stream: 'pcb', interests: { int_software: 4 }, preferences: {} };
  const a = readAnswers({ profile, quiz: [1, null], meta: { answers: { int_bio: { status: 'unknown', v: 1 } } } });
  assert.deepEqual(a, { current_stage: 'school_11', school_stream: 'pcb', int_software: 4, int_bio: UNKNOWN, quiz_0: 1 });
});

test('writeAnswers: hidden questions create no answers; unknown never becomes module data', () => {
  const answers = { current_stage: 'school_11', gate: 'no', follow: 5, late: 80, school_only: 'pcm' };
  const plan = planAssessment({}, answers, GATED);
  const out = writeAnswers(answers, plan, GATED);
  assert.ok(!('aptitude' in out.fields) || !('apt_programming' in out.fields.aptitude), 'hidden follow-up not written');
  assert.ok(!out.fields.preferences, 'no visible preference question → map not written at all');
  assert.equal(out.meta.answers.follow, undefined);
  const unk = { current_stage: 'school_11', gate: 'yes', follow: UNKNOWN, late: UNKNOWN, school_only: UNKNOWN };
  const w = writeAnswers(unk, planAssessment({}, unk, GATED), GATED);
  assert.deepEqual(w.fields.aptitude, {});
  assert.deepEqual(w.fields.preferences, {});
  assert.equal(w.fields.school_stream, null, 'unknown clears a top-level field');
  assert.equal(w.meta.answers.follow.status, 'unknown');
});

test('writeAnswers: stage-inapplicable top-level fields are cleared (as the old form did)', () => {
  const answers = { current_stage: 'undergraduate', school_stream: 'pcm', branch: 'cse' };
  const out = writeAnswers(answers, planAssessment({}, answers));
  assert.equal(out.fields.school_stream, null);
  assert.equal(out.fields.branch, 'cse');
});

test('writeAnswers: round-trips through readAnswers', () => {
  const answers = { current_stage: 'undergraduate', primary_goal: 'find_job', branch: 'cse', year_of_study: 3, int_software: 5, int_bio: UNKNOWN, pref_team: 70, quiz_2: 2 };
  const plan = planAssessment({}, answers);
  const out = writeAnswers(answers, plan);
  const back = readAnswers({ profile: out.fields, quiz: out.quiz, meta: out.meta });
  assert.deepEqual(back, answers);
  assert.equal(out.meta.version, C.ASSESSMENT_VERSION);
});

// ------------------------------------------------------------------ reachability of module inputs
// The inputs each module needs, per stage. A required input must be collectable for every stage
// that uses that module, under at least one combination of gate answers.
const F = await import('../src/lib/features.js');
const CORE_INTERESTS = F.INTERESTS.map((x) => x.key).filter((k) => k !== 'int_people');
function moduleInputs(stage) {
  const school = stage.startsWith('school_');
  const fields = ['current_stage', 'primary_goal'];
  fields.push(...CORE_INTERESTS.map((k) => `interests.${k}`));
  fields.push(...['apt_logical', 'apt_quant', 'apt_verbal', 'apt_spatial', 'apt_programming'].map((k) => `aptitude.${k}`));
  fields.push(...F.TRAITS.map((x) => `traits.${x.key}`));
  if (stage !== 'school_10') fields.push('preferences.pref_stability', 'preferences.pref_team', 'preferences.pref_hands_on', 'preferences.pref_research', 'preferences.pref_coding');
  if (['school_11', 'school_12'].includes(stage)) fields.push('school_stream');
  if (!school) fields.push('branch');
  if (['undergraduate', 'postgraduate'].includes(stage)) fields.push('year_of_study');
  if (['employed_professional', 'career_switcher'].includes(stage)) fields.push('current_role');
  return fields;
}
const FEASIBILITY_INPUTS = ['income_band', 'education_budget', 'loan_willingness', 'risk_tolerance', 'education_preference', 'relocation'];

/** Can some question collect `field` for this stage under some answers to its prerequisites? */
function reachable(field, stage, catalog = C.CATALOG, assessment = 'profile') {
  const byId = Object.fromEntries(catalog.map((q) => [q.id, q]));
  return catalog.filter((q) => q.assessment === assessment && q.field === field).some((q) => {
    const goals = q.goals ?? [null];
    const options = (id) => [...(Array.isArray(byId[id]?.options) ? byId[id].options : ['yes', 'no']), UNKNOWN];
    let combos = [{}];
    for (const id of q.requires) combos = combos.flatMap((c) => options(id).map((o) => ({ ...c, [id]: o })));
    return goals.some((goal) => combos.some((c) => P.isVisible(q, { current_stage: stage, primary_goal: goal, ...c }, { stage, goal })));
  });
}

test('every required module input is reachable for every stage that uses it', () => {
  for (const stage of STAGES) {
    for (const field of moduleInputs(stage)) assert.ok(reachable(field, stage), `${stage}: ${field} unreachable`);
    for (const field of FEASIBILITY_INPUTS) assert.ok(reachable(field, stage, C.CATALOG, 'feasibility'), `${stage}: ${field} unreachable (Module 2)`);
  }
});

test('reachability check is not vacuous', () => {
  assert.equal(reachable('school_stream', 'undergraduate'), false);
  assert.equal(reachable('aptitude.apt_programming', 'school_11', GATED), true, 'reachable through the gate');
  assert.equal(reachable('aptitude.apt_programming', 'school_11', GATED.filter((q) => q.id !== 'follow')), false);
});
