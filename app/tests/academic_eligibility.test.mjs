// Academic Eligibility D2: pure, deterministic requirement → route → career evaluation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const E = await import('../src/lib/academic/eligibility.js');
const { ENTRY_ROUTES, SOURCES } = await import('../src/lib/academic/routes.js');
const { evaluateCareerEligibility, DEFAULT_CATALOG } = E;

// Same catalog, but every source treated as official, to exercise definitive failures.
// (The real catalog has no official source, so it can never block.)
const OFFICIAL = { ...DEFAULT_CATALOG, sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, status: 'official' }])) };

const YEAR = 2026;
const sub = (name_raw, obtained, max = 100, extra = {}) => ({ name_raw, obtained, max, origin: 'extracted', ...extra });
const rec12 = (over = {}) => ({
  id: 'rec-12', qualification: 'class_12', board: 'CBSE', passing_year: 2025, result_stated: 'pass', subjects_complete: true,
  evidence_level: 'self_reported', official_verification: 'not_attempted', document_id: null,
  subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75), sub('English Core', 90)], ...over,
});
const UG = { current_stage: 'undergraduate' };
const run = (records, { career = 'ai-ml', profile = UG, catalog = DEFAULT_CATALOG } = {}) =>
  evaluateCareerEligibility({ careerId: career, academicRecords: records, profile, catalog, currentYear: YEAR });
const route = (res, id = 'be_btech') => res.routes.find((r) => r.routeId === id);
const req = (res, id, routeId = 'be_btech') => route(res, routeId).requirements.find((q) => q.id === id);
const remedyTypes = (x) => x.remedies.map((r) => r.type);

// ------------------------------------------------------------------ requirements: qualification
test('qualification passed / failed / unknown', () => {
  assert.equal(req(run([rec12()]), 'passed_12').status, 'satisfied');
  const failed = req(run([rec12({ result_stated: 'fail' })], { catalog: OFFICIAL }), 'passed_12');
  assert.deepEqual([failed.status, failed.reason], ['not_satisfied', 'failed']);
  for (const r of [null, 'compartment', 'withheld']) {
    assert.equal(req(run([rec12({ result_stated: r })], { catalog: OFFICIAL }), 'passed_12').status, 'unknown', String(r));
  }
  assert.ok(remedyTypes(req(run([rec12({ result_stated: null })]), 'passed_12')).includes('complete_record'));
});

// ------------------------------------------------------------------ requirements: subjects
test('required subjects present → satisfied', () => {
  assert.equal(req(run([rec12()]), 'physics_maths').status, 'satisfied');
  assert.equal(req(run([rec12()]), 'third_subject').status, 'satisfied');
});

test('required subject absent with a complete list → not_satisfied (official source)', () => {
  const r = req(run([rec12({ subjects: [sub('Mathematics', 85), sub('Chemistry', 75), sub('English', 80)] })], { catalog: OFFICIAL }), 'physics_maths');
  assert.deepEqual([r.status, r.reason], ['not_satisfied', 'subject_absent']);
  assert.deepEqual(r.evidence.values.absent, ['physics']);
});

test('required subject absent with an incomplete or unknown list → unknown, never absent', () => {
  for (const flag of [false, null, undefined]) {
    const r = req(run([rec12({ subjects_complete: flag, subjects: [sub('Mathematics', 85)] })], { catalog: OFFICIAL }), 'physics_maths');
    assert.deepEqual([r.status, r.reason], ['unknown', 'subject_list_incomplete'], String(flag));
    assert.ok(remedyTypes(r).includes('confirm_subject_list'));
  }
});

test('ambiguous subject → unknown with clarify remedy (not counted as present or absent)', () => {
  const r = req(run([rec12({ subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Computer', 88)] })], { catalog: OFFICIAL }), 'third_subject');
  assert.deepEqual([r.status, r.reason], ['unknown', 'ambiguous_subject']);
  assert.deepEqual(r.remedies[0], { type: 'clarify_subject', qualification: 'class_12', name: 'Computer' });
});

test('unrecognised subject on a complete list → unknown (it could be the required one)', () => {
  const r = req(run([rec12({ subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Underwater Basketry', 70)] })], { catalog: OFFICIAL }), 'third_subject');
  assert.deepEqual([r.status, r.reason], ['unknown', 'unrecognised_subject']);
});

// ------------------------------------------------------------------ requirements: combined percentage
test('combined percentage passes (best third subject chosen)', () => {
  const r = req(run([rec12({ subjects: [sub('Physics', 40), sub('Mathematics', 46), sub('Chemistry', 30), sub('Computer Science', 70)] })]), 'pm_plus_third_45');
  assert.equal(r.status, 'satisfied');
  assert.equal(r.evidence.values.best.third, 'computer_science');
  assert.equal(r.evidence.values.best.percentage, 52);
  assert.deepEqual(r.evidence.values.combinations.map((c) => c.third), ['computer_science', 'chemistry']);
});

test('combined percentage below the relaxed minimum → not_satisfied (official source)', () => {
  const r = req(run([rec12({ subjects: [sub('Physics', 30), sub('Mathematics', 35), sub('Chemistry', 30)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([r.status, r.reason], ['not_satisfied', 'below_minimum']);
});

test('40–45% → unknown (category not collected), never failure', () => {
  const r = req(run([rec12({ subjects: [sub('Physics', 42), sub('Mathematics', 43), sub('Chemistry', 41)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([r.status, r.reason], ['unknown', 'relaxation_band']);
  assert.equal(r.indicative, undefined, 'genuinely unknown, not a hidden failure');
});

test('below minimum but another third subject is unmarked or uncertain → unknown', () => {
  const unmarked = req(run([rec12({ subjects: [sub('Physics', 30), sub('Mathematics', 30), sub('Chemistry', 30), sub('Biology', null, null)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([unmarked.status, unmarked.reason], ['unknown', 'other_combinations_possible']);
  const incomplete = req(run([rec12({ subjects_complete: null, subjects: [sub('Physics', 30), sub('Mathematics', 30), sub('Chemistry', 30)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.equal(incomplete.status, 'unknown');
});

test('grade-only record → unknown, no percentage invented', () => {
  const r = req(run([rec12({ subjects: [{ name_raw: 'Physics', grade: 'A1' }, { name_raw: 'Mathematics', grade: 'A2' }, { name_raw: 'Chemistry', grade: 'B1' }] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([r.status, r.reason], ['unknown', 'grade_only']);
  assert.equal(r.evidence.values.best, undefined);
});

test('missing marks and missing maximum marks → unknown', () => {
  const noMarks = req(run([rec12({ subjects: [sub('Physics', null, null), sub('Mathematics', 85), sub('Chemistry', 75)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([noMarks.status, noMarks.reason], ['unknown', 'marks_missing']);
  const noMax = req(run([rec12({ subjects: [sub('Physics', 80, null), sub('Mathematics', 85), sub('Chemistry', 75)] })], { catalog: OFFICIAL }), 'pm_plus_third_45');
  assert.deepEqual([noMax.status, noMax.reason], ['unknown', 'max_marks_missing']);
  assert.ok(remedyTypes(noMax).includes('complete_record'));
});

test('validation error on a relevant field → unknown with fix_record; unrelated errors do not', () => {
  const bad = run([rec12({ subjects: [sub('Physics', 120), sub('Mathematics', 85), sub('Chemistry', 75)] })], { catalog: OFFICIAL });
  assert.deepEqual([req(bad, 'pm_plus_third_45').status, req(bad, 'pm_plus_third_45').reason], ['unknown', 'record_has_errors']);
  assert.ok(remedyTypes(req(bad, 'pm_plus_third_45')).includes('fix_record'));
  const dup = run([rec12({ subjects: [sub('Physics', 80), sub('Physics', 70), sub('Mathematics', 85), sub('Chemistry', 75)] })], { catalog: OFFICIAL });
  assert.equal(req(dup, 'pm_plus_third_45').status, 'unknown');
  const unrelated = run([rec12({ subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75), sub('English', 'AB')] })]);
  assert.equal(req(unrelated, 'pm_plus_third_45').status, 'satisfied', 'an error on English does not affect PCM');
  const badResult = run([rec12({ result_stated: 'passed!' })]);
  assert.equal(req(badResult, 'passed_12').reason, 'record_has_errors');
});

test('validation never corrects the record: stated mismatches do not change eligibility inputs', () => {
  const r = rec12({ percentage_stated: 99, total_obtained: 1, total_max: 500 });
  const before = structuredClone(r);
  run([r]);
  assert.deepEqual(r, before);
});

test('no academic record → unknown with add_record', () => {
  const res = run([]);
  assert.equal(route(res).status, 'unknown');
  for (const q of route(res).requirements) assert.equal(q.status, 'unknown');
  assert.ok(remedyTypes(route(res)).includes('add_record'));
  const dup = run([rec12(), rec12({ id: 'other' })]);
  assert.ok(remedyTypes(route(dup)).includes('fix_record'));
});

// ------------------------------------------------------------------ evidence
test('evidence level is reported as stored, never upgraded; official verification separate', () => {
  for (const level of ['self_reported', 'extracted', 'document_checked']) {
    const res = run([rec12({ evidence_level: level })]);
    assert.equal(route(res).evidenceLevel, level);
    assert.equal(res.evidenceLevel, level);
    assert.equal(req(res, 'physics_maths').evidence.evidenceLevel, level);
  }
  assert.equal(route(run([rec12({ evidence_level: 'document_checked', official_verification: 'verification_unavailable' })])).officiallyVerified, false);
  assert.equal(route(run([rec12({ evidence_level: 'document_checked', official_verification: 'officially_verified' })])).officiallyVerified, true);
});

test('provenance and record references pass through unchanged', () => {
  const res = run([rec12({ id: 'rec-9', document_id: 'doc-1', subjects: [sub('Physics', 80, 100, { origin: 'user_corrected' }), sub('Mathematics', 85, 100, { origin: 'user_entered' }), sub('Chemistry', 75)] })]);
  const ev = req(res, 'physics_maths').evidence;
  assert.deepEqual([ev.recordId, ev.documentId], ['rec-9', 'doc-1']);
  assert.deepEqual(ev.origins, [{ subject: 'physics', origin: 'user_corrected' }, { subject: 'mathematics', origin: 'user_entered' }]);
});

test('self-reported definitive failure suggests verifying the record', () => {
  const res = run([rec12({ result_stated: 'fail' })], { catalog: OFFICIAL });
  assert.ok(remedyTypes(route(res)).includes('verify_record'));
});

// ------------------------------------------------------------------ routes
test('route: all satisfied → eligible; one failure → not_eligible; unknown without failure → unknown', () => {
  assert.equal(route(run([rec12()], { catalog: OFFICIAL })).status, 'eligible');
  const failed = route(run([rec12({ result_stated: 'fail' })], { catalog: OFFICIAL }));
  assert.deepEqual([failed.status, failed.blocking], ['not_eligible', ['passed_12']]);
  const unk = route(run([rec12({ subjects: [sub('Physics', 42), sub('Mathematics', 43), sub('Chemistry', 41)] })], { catalog: OFFICIAL }));
  assert.deepEqual([unk.status, unk.blocking, unk.unknown], ['unknown', [], ['pm_plus_third_45']]);
});

test('secondary-source requirement cannot block: indicative failure becomes unknown', () => {
  const res = run([rec12({ subjects: [sub('Mathematics', 85), sub('Chemistry', 75), sub('English', 80)] })]);
  const r = req(res, 'physics_maths');
  assert.deepEqual([r.status, r.reason, r.indicative, r.indicativeReason], ['unknown', 'source_not_official', 'not_satisfied', 'subject_absent']);
  assert.equal(r.source.status, 'secondary');
  assert.equal(route(res).status, 'unknown');
  assert.equal(SOURCES.aicte_be_btech_ptu.status, 'secondary', 'source status never upgraded');
  const low = req(run([rec12({ subjects: [sub('Physics', 30), sub('Mathematics', 30), sub('Chemistry', 30)] })]), 'pm_plus_third_45');
  assert.deepEqual([low.status, low.indicative], ['unknown', 'not_satisfied']);
});

test('secondary-source requirement can still be satisfied by the evidence', () => {
  assert.equal(route(run([rec12()])).status, 'eligible');
});

test('BCA / B.Sc CS institution rules stay unknown, never decided', () => {
  for (const id of ['bca', 'bsc_cs']) {
    for (const catalog of [DEFAULT_CATALOG, OFFICIAL]) {
      const r = route(run([rec12()], { career: 'software-eng', catalog }), id);
      assert.equal(r.status, 'unknown', id);
      assert.equal(r.requirements.find((q) => q.id === 'university_rules').status, 'unknown');
      assert.ok(remedyTypes(r).includes('check_institution'));
    }
  }
});

test('entrance exams are steps, not requirements', () => {
  const r = route(run([rec12()]));
  assert.ok(!r.requirements.some((q) => /entrance|jee/i.test(q.id + q.label)));
  assert.ok(r.steps.some((s) => s.kind === 'entrance'));
  assert.ok(remedyTypes(r).includes('prepare_entrance'));
  assert.ok(r.assumptions.some((a) => /recognised/.test(a)), 'recognised board stays an assumption');
});

// ------------------------------------------------------------------ careers
const catalogWith = (routesForCareer) => ({ ...OFFICIAL, careerEntry: { test: { routes: routesForCareer } } });
const extra = {
  ...ENTRY_ROUTES,
  needs_bio: { ...ENTRY_ROUTES.be_btech, id: 'needs_bio', label: 'Needs biology', requirements: [{ id: 'bio', type: 'subjects_all', label: 'Biology', params: { subjects: ['biology'] }, source: 'aicte_be_btech_ptu' }] },
  needs_pass: { ...ENTRY_ROUTES.be_btech, id: 'needs_pass', label: 'Needs pass', requirements: [{ id: 'p', type: 'qualification_passed', label: 'Pass', params: { qualification: 'class_12' }, source: 'aicte_be_btech_ptu' }] },
};
const careerRun = (records, routeIds) => evaluateCareerEligibility({ careerId: 'test', academicRecords: records, profile: UG, catalog: { ...catalogWith(routeIds), routes: extra }, currentYear: YEAR });

test('career: one eligible route + one failed route → eligible; failed route points to the others', () => {
  const res = careerRun([rec12()], ['be_btech', 'needs_bio']);
  assert.deepEqual(res.routes.map((r) => r.status), ['eligible', 'not_eligible']);
  assert.equal(res.status, 'eligible');
  assert.deepEqual(res.viableRoutes, ['be_btech']);
  assert.deepEqual(res.routes[1].remedies.find((r) => r.type === 'compare_routes').routes, ['be_btech']);
});

test('career: all routes failed → not_eligible', () => {
  const res = careerRun([rec12({ result_stated: 'fail' })], ['be_btech', 'needs_pass']);
  assert.deepEqual([res.status, res.viableRoutes], ['not_eligible', []]);
});

test('career: failed + unknown → unknown; all unknown → unknown', () => {
  const mixed = careerRun([rec12()], ['needs_bio', 'bca']);
  assert.deepEqual([mixed.status, mixed.viableRoutes], ['unknown', ['bca']]);
  assert.equal(run([], { career: 'software-eng' }).status, 'unknown');
});

test('career: no catalogued route → no_catalogued_route (not failure)', () => {
  const res = evaluateCareerEligibility({ careerId: 'nonexistent', academicRecords: [rec12()], profile: UG });
  assert.deepEqual([res.status, res.routes, res.viableRoutes], ['no_catalogued_route', [], []]);
});

test('career result shape', () => {
  const res = run([rec12()], { career: 'software-eng' });
  assert.deepEqual(Object.keys(res).sort(), ['careerId', 'catalogVersion', 'evidenceLevel', 'mode', 'routes', 'status', 'viableRoutes']);
  assert.deepEqual(Object.keys(route(res)).sort(), ['assumptions', 'blocking', 'catalogVersion', 'evidenceLevel', 'label', 'officiallyVerified', 'remedies', 'requirements', 'routeId', 'source', 'status', 'steps', 'unknown']);
  assert.equal(res.catalogVersion, DEFAULT_CATALOG.version);
  for (const k of ['score', 'eligibilityScore', 'careerFit']) assert.ok(!(k in res), `no ${k}`);
});

// ------------------------------------------------------------------ prospective school stages
const pros = (stage, stream, records = [], career = 'ai-ml') => evaluateCareerEligibility({ careerId: career, academicRecords: records, profile: { current_stage: stage, school_stream: stream }, currentYear: YEAR });

test('Class 10 + PCM → open; Class 11 + PCM → open', () => {
  for (const stage of ['school_10', 'school_11']) {
    const res = pros(stage, 'pcm');
    assert.deepEqual([res.mode, res.status, route(res).status], ['prospective', 'open', 'open'], stage);
  }
});

test('Class 11 + PCB → needs_subject (Mathematics) for B.Tech', () => {
  const res = pros('school_11', 'pcb');
  assert.equal(route(res).status, 'needs_subject');
  assert.deepEqual(route(res).remedies.filter((r) => r.type === 'take_subject').map((r) => r.subject), ['mathematics']);
  assert.equal(res.status, 'needs_subject');
  const se = pros('school_11', 'pcb', [], 'software-eng');
  assert.equal(se.status, 'unknown', 'BCA/B.Sc stay possible: career not closed');
});

test('undecided / commerce / humanities → unknown, not closed', () => {
  for (const stream of ['undecided', 'commerce', 'humanities', null]) {
    const res = pros('school_11', stream);
    assert.equal(route(res).status, 'unknown', String(stream));
    assert.ok(!res.routes.some((r) => r.status === 'not_eligible'));
  }
});

test('future percentage requirement does not fail the student', () => {
  const r = req(pros('school_11', 'pcm'), 'pm_plus_third_45');
  assert.equal(r.status, 'future');
  assert.equal(req(pros('school_11', 'pcm'), 'passed_12').status, 'future');
});

test('Class 10 marks never satisfy a Class 12 requirement', () => {
  const class10 = { id: 'r10', qualification: 'class_10', board: 'CBSE', passing_year: 2024, result_stated: 'pass', subjects_complete: true, evidence_level: 'document_checked', subjects: [sub('Mathematics Standard', 99), sub('Science', 98)] };
  const res = pros('school_11', 'pcm', [class10]);
  assert.equal(req(res, 'pm_plus_third_45').status, 'future');
  assert.equal(route(res).evidenceLevel, null, 'prospective result is not backed by academic evidence');
  const ug = run([class10]);
  assert.equal(req(ug, 'pm_plus_third_45').reason, 'no_record', 'achieved mode still needs a Class 12 record');
});

test('school_12 without a Class 12 record is prospective; with one it is achieved', () => {
  assert.equal(pros('school_12', 'pcm').mode, 'prospective');
  assert.equal(pros('school_12', 'pcm', [rec12()]).mode, 'achieved');
  assert.equal(E.eligibilityMode({}, []), 'achieved', 'legacy profile → undergraduate → achieved');
});

// ------------------------------------------------------------------ invariants
test('pure: inputs not mutated, identical inputs give identical output', () => {
  const records = [rec12(), { id: 'r10', qualification: 'class_10', subjects: [sub('Maths', 90)] }];
  const profile = { current_stage: 'undergraduate', school_stream: 'pcm' };
  const before = structuredClone({ records, profile });
  const a = evaluateCareerEligibility({ careerId: 'software-eng', academicRecords: records, profile, currentYear: YEAR });
  const b = evaluateCareerEligibility({ careerId: 'software-eng', academicRecords: records, profile, currentYear: YEAR });
  assert.deepEqual(a, b);
  assert.deepEqual({ records, profile }, before);
  assert.ok(Object.isFrozen(ENTRY_ROUTES.be_btech), 'catalog untouched');
});

test('eligibility never touches Career Fit, decisionInputs or the Decision Engine', async () => {
  const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
  const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
  const { decide } = await import('../src/lib/decision/engine.js');
  const profile = { current_stage: 'school_12', school_stream: 'pcm', branch: 'cse', interests: { int_software: 5 }, aptitude: { apt_programming: 5 }, preferences: {}, traits: {} };
  const inputs = { income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [] };
  const recs = shortlist(rankCareers(profile));
  const bundle = buildDecisionInputs({ profile, recs, inputs });
  const decision = decide(bundle);
  const snap = structuredClone({ recs, bundle, decision });
  for (const r of recs) evaluateCareerEligibility({ careerId: r.domainId, academicRecords: [rec12()], profile, currentYear: YEAR });
  assert.deepEqual({ recs, bundle, decision }, snap);
  assert.deepEqual(shortlist(rankCareers(profile)), recs);
  assert.deepEqual(decide(buildDecisionInputs({ profile, recs, inputs })), decision);
  assert.ok(!('academic' in bundle.careers[0]), 'decisionInputs has no eligibility yet (D4)');
});
