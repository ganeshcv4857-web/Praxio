// Adaptive assessment v2: stage specialisation, gates, unknowns and untouched sliders,
// verified end to end through the modules that consume the answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const C = await import('../src/lib/assessment/catalog.js');
const { planAssessment, writeAnswers, UNKNOWN } = await import('../src/lib/assessment/planner.js');
const { buildFeatures } = await import('../src/lib/features.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
const { evaluateDimensions, directPathway } = await import('../src/lib/alignment/engine.js');
const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
const { decide } = await import('../src/lib/decision/engine.js');

const inputs = { income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: ['job_security'], primary_funder: 'family', scholarship_interest: 'no' };
const likerts = (page, value = 4) => Object.fromEntries(C.CATALOG.filter((q) => q.page === page && q.kind === 'likert').map((q) => [q.id, value]));

/** What onboarding would save: plan → write only visible answers → profile-shaped row. */
function save(answers) {
  const plan = planAssessment({}, answers);
  const out = writeAnswers(answers, plan);
  return { plan, profile: { ...out.fields, assessment_meta: out.meta, assessment_version: out.meta.version }, out };
}
const visible = (answers) => planAssessment({}, answers).visible;
const ACAD = ['add_academic_record', 'take_subject', 'compare_routes'];

// ------------------------------------------------------------------ stage-specific selection
const PROFESSIONAL = ['current_role', 'branch', 'year_of_study'];
test('Class 10: stream leaning, no professional / degree / preference questions', () => {
  const v = visible({ current_stage: 'school_10' });
  assert.ok(v.includes('school_stream_leaning') && v.includes('tried_programming'));
  for (const id of [...PROFESSIONAL, 'school_stream', 'class12_results_status', 'pref_team', 'pref_coding', 'current_activity', 'int_people']) assert.ok(!v.includes(id), id);
});

test('Class 11: stream, no professional questions; Class 12: stream + results status', () => {
  const v11 = visible({ current_stage: 'school_11' });
  assert.ok(v11.includes('school_stream') && !v11.includes('school_stream_leaning') && !v11.includes('class12_results_status'));
  const v12 = visible({ current_stage: 'school_12' });
  assert.ok(v12.includes('school_stream') && v12.includes('class12_results_status'));
  for (const v of [v11, v12]) for (const id of PROFESSIONAL) assert.ok(!v.includes(id), id);
});

test('undergraduate: no school stream questions; branch and year asked; programming not gated', () => {
  const v = visible({ current_stage: 'undergraduate' });
  for (const id of ['school_stream', 'school_stream_leaning', 'class12_results_status', 'tried_programming', 'current_role']) assert.ok(!v.includes(id), id);
  for (const id of ['branch', 'year_of_study', 'apt_programming', 'pref_coding', 'pref_study']) assert.ok(v.includes(id), id);
});

test('working stages: further-study preference only when further study is the goal', () => {
  for (const stage of ['employed_professional', 'career_switcher']) {
    assert.ok(!visible({ current_stage: stage, primary_goal: 'upskill' }).includes('pref_study'), stage);
    assert.ok(visible({ current_stage: stage, primary_goal: 'higher_studies' }).includes('pref_study'), stage);
    assert.ok(visible({ current_stage: stage }).includes('current_role'));
  }
  assert.ok(visible({ current_stage: 'career_switcher' }).includes('tried_programming'), 'switchers are gated');
  assert.ok(!visible({ current_stage: 'employed_professional' }).includes('tried_programming'));
});

test('name is optional for every stage', () => {
  assert.equal(C.QUESTION_BY_ID.full_name.required, false);
  for (const stage of ['school_10', 'undergraduate', 'career_switcher']) {
    const p = planAssessment({}, { current_stage: stage, primary_goal: 'explore_careers' });
    assert.ok(!p.pages.find((x) => x.id === 'about').questions.filter((id) => C.QUESTION_BY_ID[id].required).includes('full_name'));
  }
});

// ------------------------------------------------------------------ programming gate
test('school student who has not tried programming: no programming rating, no coding preference, no fake value', () => {
  for (const tried of ['no', 'unsure']) {
    const answers = { current_stage: 'school_11', tried_programming: tried, apt_programming: 5, pref_coding: 90, ...likerts('aptitude') };
    const v = visible(answers);
    assert.ok(!v.includes('apt_programming') && !v.includes('pref_coding'), tried);
    const { profile } = save(answers);
    assert.ok(!('apt_programming' in profile.aptitude), 'hidden answer not written');
    assert.ok(!('pref_coding' in (profile.preferences ?? {})));
    const f = buildFeatures(profile);
    assert.equal(f.apt_programming, undefined, 'programming stays unknown for Career Fit');
    assert.equal(f.pref_coding, undefined);
    assert.equal(profile.assessment_meta.answers.tried_programming.value, tried, 'gate answer kept in meta only');
    assert.ok(!('tried_programming' in profile), 'no new profile column for the gate');
  }
});

test('school student who has tried programming: follow-ups visible and recorded', () => {
  const answers = { current_stage: 'school_12', tried_programming: 'yes', apt_programming: 4, pref_coding: 70 };
  const v = visible(answers);
  assert.ok(v.indexOf('tried_programming') < v.indexOf('apt_programming'));
  assert.ok(v.includes('pref_coding'));
  const { profile } = save(answers);
  assert.equal(profile.aptitude.apt_programming, 4);
  assert.equal(profile.preferences.pref_coding, 70);
});

// ------------------------------------------------------------------ unknown answers & sliders
test('"not sure" on a Likert item leaves the feature absent; Career Fit coverage drops instead of inventing', () => {
  const base = { current_stage: 'undergraduate', primary_goal: 'find_job', branch: 'cse', year_of_study: 2, ...likerts('interests'), ...likerts('aptitude'), ...likerts('traits') };
  const known = save(base).profile;
  const unsure = save({ ...base, int_software: UNKNOWN, apt_programming: UNKNOWN }).profile;
  assert.ok(!('int_software' in unsure.interests) && !('apt_programming' in unsure.aptitude));
  assert.equal(unsure.assessment_meta.answers.int_software.status, 'unknown');
  const cov = (p) => rankCareers(p).find((r) => r.domainId === 'software-eng').coverage;
  assert.ok(cov(unsure) < cov(known));
  for (const v of Object.values(unsure.interests)) assert.notEqual(v, 3, 'no neutral value invented');
});

test('untouched sliders create no preference data — not for Career Fit, not for Alignment', () => {
  const answers = { current_stage: 'undergraduate', primary_goal: 'find_job', branch: 'cse', year_of_study: 2, ...likerts('interests'), ...likerts('aptitude'), ...likerts('traits') };
  const { profile } = save(answers);
  assert.deepEqual(profile.preferences, {}, 'no slider was touched');
  const f = buildFeatures(profile);
  for (const k of ['pref_team', 'pref_solo', 'pref_stability', 'pref_novelty', 'pref_hands_on', 'pref_screen', 'pref_coding', 'pref_study', 'pref_research', 'pref_applied']) assert.equal(f[k], undefined, k);
  const rec = { domainId: 'software-eng', score: 80 };
  const dims = evaluateDimensions({ careerId: 'software-eng', pathway: directPathway('software-eng', inputs), profile, inputs, rec });
  const shared = dims.find((d) => d.dimension === 'priorities');
  assert.equal(shared.score, null, 'family value "job security" cannot be compared with a preference never given');
  const touched = save({ ...answers, pref_stability: 50 }).profile;
  assert.equal(touched.preferences.pref_stability, 50, 'a touched slider at 50 is a real answer');
  assert.notEqual(evaluateDimensions({ careerId: 'software-eng', pathway: directPathway('software-eng', inputs), profile: touched, inputs, rec }).find((d) => d.dimension === 'priorities').score, null);
});

test('hidden questions never create answers, even if a value is sitting in the answers', () => {
  const answers = { current_stage: 'undergraduate', school_stream: 'pcm', class12_results_status: 'out', current_role: 'Analyst', tried_programming: 'no' };
  const { profile } = save(answers);
  assert.equal(profile.school_stream, null);
  assert.equal(profile.class12_results_status, null);
  assert.equal(profile.current_role, null);
  for (const id of ['school_stream', 'class12_results_status', 'current_role', 'tried_programming']) assert.equal(profile.assessment_meta.answers[id], undefined, id);
});

// ------------------------------------------------------------------ academic consumers
const pipeline = (answers, recs, academicRecords = []) => {
  const { profile } = save(answers);
  const bundle = buildDecisionInputs({ profile, recs, inputs, academicRecords });
  return { profile, bundle, decision: decide(bundle) };
};
const SE = [{ domainId: 'software-eng', score: 90 }, { domainId: 'data-science', score: 70 }];

test('Class 10 leaning PCM → prospective B.Tech open; no professional questions', () => {
  const { profile, bundle, decision } = pipeline({ current_stage: 'school_10', primary_goal: 'explore_careers', school_stream_leaning: 'pcm' }, SE);
  assert.equal(profile.school_stream, 'pcm');
  assert.equal(profile.assessment_meta.answers.school_stream_leaning.status, 'answered');
  const be = bundle.academic.careers[0].routes.find((r) => r.routeId === 'be_btech');
  assert.equal(be.status, 'open');
  assert.equal(decision.nextAction.type, 'explore_stream');
});

test('Class 10 leaning undecided → no forced path, exploration stays available', () => {
  const { bundle, decision } = pipeline({ current_stage: 'school_10', primary_goal: 'explore_careers', school_stream_leaning: 'undecided' }, SE);
  assert.ok(bundle.academic.careers.every((c) => c.status === 'unknown'));
  assert.equal(decision.nextAction.type, 'explore_stream');
  assert.deepEqual([decision.nextAction, ...decision.alternatives.map((a) => a.action)].filter((a) => ACAD.includes(a.type)), []);
});

test('Class 11 PCB → Mathematics gap reaches the Decision Engine as take_subject', () => {
  const { bundle, decision } = pipeline({ current_stage: 'school_11', primary_goal: 'choose_career', school_stream: 'pcb' }, [{ domainId: 'embedded-iot', score: 90 }]);
  assert.equal(bundle.academic.careers[0].status, 'needs_subject');
  assert.deepEqual([decision.nextAction.type, decision.nextAction.subject], ['take_subject', 'mathematics']);
});

test('Class 12 results awaiting → no academic failure, adding marks stays non-urgent', () => {
  const { bundle, decision } = pipeline({ current_stage: 'school_12', primary_goal: 'choose_degree', school_stream: 'pcm', class12_results_status: 'awaiting' }, SE);
  assert.equal(bundle.academic.resultsStatus, 'awaiting');
  assert.ok(bundle.academic.careers.every((c) => c.status !== 'not_eligible'));
  const add = [decision.nextAction, ...decision.alternatives.map((a) => a.action)].find((a) => a.type === 'add_academic_record');
  assert.equal(add.tier, 'later');
  assert.match(add.reasons[0].text, /When your Class 12 results are out/);
});

test('Class 12 results out → adding marks becomes the evidence step', () => {
  const { decision } = pipeline({ current_stage: 'school_12', primary_goal: 'choose_degree', school_stream: 'pcm', class12_results_status: 'out' }, SE);
  assert.deepEqual([decision.nextAction.type, decision.nextAction.tier], ['add_academic_record', 'evidence']);
  const unsure = pipeline({ current_stage: 'school_12', primary_goal: 'choose_degree', school_stream: 'pcm', class12_results_status: 'unsure' }, SE).decision;
  assert.notEqual(unsure.nextAction.type, 'add_academic_record');
});

// ------------------------------------------------------------------ determinism & legacy
test('same context + answers → same plan and same saved payload', () => {
  const answers = { current_stage: 'school_12', school_stream: 'pcb', tried_programming: 'unsure', int_bio: 5, pref_study: 80 };
  assert.deepEqual(planAssessment({}, answers), planAssessment({}, answers));
  assert.deepEqual(save(answers).out, save(answers).out);
});

test('legacy profiles keep their meaning: unversioned → v1, Career Fit unchanged', () => {
  const legacy = { branch: 'cse', interests: { int_software: 5, int_people: 4 }, aptitude: { apt_programming: 4 }, preferences: { pref_team: 50, pref_coding: 50 }, traits: {} };
  assert.equal(C.assessmentVersionOf(legacy), 'assessment-v1');
  const before = structuredClone(legacy);
  const r = shortlist(rankCareers(legacy));
  assert.deepEqual(legacy, before);
  assert.equal(buildFeatures(legacy).pref_team, 50, 'old stored 50 is read as stored (not reinterpreted)');
  assert.ok(r.length >= 5);
});
