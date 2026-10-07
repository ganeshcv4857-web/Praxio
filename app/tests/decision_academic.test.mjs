// D4: Decision Engine consumes academic eligibility (never computes it).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
const { decide } = await import('../src/lib/decision/engine.js');
const { academicCandidates } = await import('../src/lib/decision/candidates.js');
const El = await import('../src/lib/academic/eligibility.js');
const { SOURCES } = await import('../src/lib/academic/routes.js');

const OFFICIAL = { ...El.DEFAULT_CATALOG, sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, status: 'official' }])) };
const base = { income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [], primary_funder: 'family', scholarship_interest: 'no' };
const sub = (name_raw, obtained, max = 100) => ({ name_raw, obtained, max, origin: 'extracted' });
const r12 = (over = {}) => ({ id: 'r12', qualification: 'class_12', result_stated: 'pass', subjects_complete: true, evidence_level: 'self_reported', official_verification: 'not_attempted', subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75)], ...over });
const SE = [{ domainId: 'software-eng', score: 92 }, { domainId: 'data-science', score: 70 }];
const ACAD = ['add_academic_record', 'take_subject', 'compare_routes'];

const bundleFor = (profile, records, recs = SE) => buildDecisionInputs({ profile, recs, inputs: base, academicRecords: records });
const all = (d) => [d.nextAction, ...d.alternatives.map((a) => a.action)];
const academicActions = (d) => all(d).filter((a) => ACAD.includes(a.type));
// Swap in eligibility summaries computed from an official-sourced catalog (definitive verdicts).
const withOfficial = (bundle, profile, records) => ({
  ...bundle,
  academic: { ...bundle.academic, careers: bundle.careers.map((c) => El.summariseForDecision(El.evaluateCareerEligibility({ careerId: c.careerId, academicRecords: records, profile, catalog: OFFICIAL }))) },
});

// ------------------------------------------------------------------ decisionInputs
test('decisionInputs: explicit academic states; eligibility comes from the eligibility engine', () => {
  assert.deepEqual(bundleFor({ current_stage: 'school_12' }, undefined).academic, { status: 'not_supplied', mode: null, pendingRecords: [], careers: [] });
  assert.equal(bundleFor({ current_stage: 'undergraduate' }, [r12()]).academic.status, 'not_applicable');
  assert.equal(bundleFor({ current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' }, []).academic.status, 'evaluated');
  const b = bundleFor({ current_stage: 'school_12', school_stream: 'pcm' }, [r12()]);
  assert.equal(b.modules.academic, true);
  const direct = El.summariseForDecision(El.evaluateCareerEligibility({ careerId: 'software-eng', academicRecords: [r12()], profile: { current_stage: 'school_12', school_stream: 'pcm' } }));
  assert.deepEqual(b.academic.careers[0], direct, 'decisionInputs carries the engine result unchanged');
});

test('decisionInputs: academic summary carries no marks, percentages or record ids', () => {
  const b = bundleFor({ current_stage: 'school_12', school_stream: 'pcm' }, [r12({ id: 'secret-record-id', subjects: [sub('Physics', 81.5), sub('Mathematics', 86.25), sub('Chemistry', 77.75)] })]);
  const json = JSON.stringify(b.academic);
  for (const leak of ['81.5', '86.25', '77.75', 'secret-record-id', 'obtained', 'percentage', 'combinations']) assert.ok(!json.includes(leak), leak);
});

// ------------------------------------------------------------------ 1–3: the three actions
test('1. missing academic record → add_academic_record (evidence tier when it blocks requirements)', () => {
  const d = decide(bundleFor({ current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' }, []));
  assert.equal(d.nextAction.type, 'add_academic_record');
  assert.deepEqual([d.nextAction.tier, d.nextAction.qualification], ['evidence', 'class_12']);
  assert.ok(d.confidence.missing.includes('academic_record'));
  assert.ok(d.wouldChange.some((w) => /Class 12 marks/.test(w.condition)));
});

test('1b. Class 12 student without a marksheet → add_academic_record, not urgent', () => {
  const d = decide(bundleFor({ current_stage: 'school_12', school_stream: 'pcm' }, []));
  const a = academicActions(d).find((x) => x.type === 'add_academic_record');
  assert.deepEqual([a.tier, a.qualification], ['later', 'class_12']);
  assert.notEqual(d.nextAction.type, 'add_academic_record', 'results may not be out yet: does not displace degree comparison');
});

test('2. prospective missing required subject → take_subject (dependency tier)', () => {
  const d = decide(bundleFor({ current_stage: 'school_11', school_stream: 'pcb' }, []));
  assert.equal(d.nextAction.type, 'take_subject');
  assert.deepEqual([d.nextAction.tier, d.nextAction.subject], ['dependency', 'mathematics']);
  assert.ok(d.wouldChange.some((w) => /Mathematics/.test(w.condition)));
  assert.equal(d.direction.careerId, 'software-eng', 'career kept');
});

test('3. first route blocked, another viable → compare_routes (dependency tier)', () => {
  const profile = { current_stage: 'school_12', school_stream: 'pcm' };
  const records = [r12({ subjects: [sub('Mathematics', 85), sub('Chemistry', 75), sub('English', 80)] })]; // no physics: B.Tech closed (official)
  const d = decide(withOfficial(bundleFor(profile, records), profile, records));
  const cr = academicActions(d).find((a) => a.type === 'compare_routes');
  assert.ok(cr);
  assert.deepEqual([cr.tier, cr.careerId], ['dependency', 'software-eng']);
  assert.equal(d.nextAction.type, 'compare_routes');
  assert.equal(d.direction.careerId, 'software-eng', 'career not rejected');
  assert.ok(!d.constraints.some((c) => c.module === 'academic'), 'career still has viable (unknown) routes');
});

// ------------------------------------------------------------------ 4–6: unknown, not applicable, eligible
test('4. academic unknown never becomes failure', () => {
  const profile = { current_stage: 'school_12', school_stream: 'pcm' };
  const records = [r12({ subjects: [sub('Mathematics', 85), sub('Chemistry', 75), sub('English', 80)] })]; // secondary source: indicative only
  const b = bundleFor(profile, records);
  assert.equal(b.academic.careers[0].status, 'unknown');
  const d = decide(b);
  assert.equal(d.mode, 'commit');
  assert.equal(d.direction.careerId, 'software-eng');
  assert.equal(d.evidence.academic.status, 'unknown');
  assert.ok(!d.constraints.some((c) => c.module === 'academic'));
  assert.ok(!academicActions(d).some((a) => a.type === 'compare_routes'), 'no alternative is clearly eligible either');
});

test('5. academic not relevant → no academic action and no academic evidence', () => {
  for (const profile of [{ current_stage: 'undergraduate' }, { current_stage: 'employed_professional' }, {}]) {
    const d = decide(bundleFor(profile, [r12()]));
    assert.deepEqual(academicActions(d), [], JSON.stringify(profile));
    assert.ok(!('academic' in (d.evidence ?? {})));
  }
});

test('6. eligible route → no academic remediation', () => {
  const profile = { current_stage: 'school_12', school_stream: 'pcm' };
  const records = [r12()];
  for (const b of [bundleFor(profile, records), withOfficial(bundleFor(profile, records), profile, records)]) {
    const d = decide(b);
    assert.equal(b.academic.careers[0].status, 'eligible');
    assert.deepEqual(academicActions(d), []);
    assert.ok(!d.confidence.missing.includes('academic_record'));
  }
});

test('Class 10 / Class 11 PCM: no false rejection, no academic action', () => {
  for (const stage of ['school_10', 'school_11']) {
    const d = decide(bundleFor({ current_stage: stage, school_stream: 'pcm' }, []));
    assert.deepEqual(academicActions(d), [], stage);
    assert.ok(!d.constraints.some((c) => c.module === 'academic'));
  }
});

// ------------------------------------------------------------------ 7: unchanged without academic evidence
test('7. decisions are unchanged when academic records are not supplied', () => {
  const profiles = ['school_10', 'school_11', 'school_12', 'undergraduate', 'graduate_unemployed', 'career_switcher'].map((s) => ({ current_stage: s, school_stream: 'pcb', primary_goal: 'choose_degree' }));
  for (const profile of profiles) {
    const without = decide(buildDecisionInputs({ profile, recs: SE, inputs: base }));
    const notSupplied = decide(buildDecisionInputs({ profile, recs: SE, inputs: base, academicRecords: null }));
    assert.deepEqual(without, notSupplied, profile.current_stage);
    assert.deepEqual(academicActions(without), []);
  }
});

test('7b. academic actions only add to the ranking; everything else keeps its relative order', () => {
  const profile = { current_stage: 'school_12', school_stream: 'pcm' };
  const without = decide(bundleFor(profile, undefined));
  const withAcad = decide(bundleFor(profile, []));
  const strip = (d) => all(d).filter((a) => !ACAD.includes(a.type)).map((a) => a.type);
  assert.deepEqual(strip(withAcad).slice(0, 2), strip(without).slice(0, 2));
  assert.deepEqual(without.nextAction, withAcad.nextAction, 'non-urgent academic action does not displace the stage action');
});

// ------------------------------------------------------------------ 8: independence from Career Fit
test('8. Career Fit and academic eligibility stay independent signals', () => {
  const profile = { current_stage: 'school_12', school_stream: 'pcm' };
  const high = [{ domainId: 'software-eng', score: 95 }];
  const low = [{ domainId: 'software-eng', score: 40 }];
  const hi = decide(bundleFor({ current_stage: 'school_12', school_stream: 'undecided' }, [], high));
  const lo = decide(bundleFor(profile, [r12()], low));
  assert.equal(hi.direction.careerFit, 95);
  assert.equal(hi.evidence.academic.status, 'unknown', 'high fit + academically unknown');
  assert.equal(lo.mode, 'keep_open', 'low fit is not rescued by eligibility');
  const b = bundleFor(profile, [r12()], low);
  assert.equal(b.academic.careers[0].status, 'eligible', 'low fit + academically eligible');
  assert.equal(b.careers[0].careerFit, 40);
  for (const k of ['score', 'academicScore', 'eligibilityScore']) assert.ok(!(k in hi) && !(k in hi.nextAction), k);
});

// ------------------------------------------------------------------ 9–10: priority & simultaneous dependencies
test('9. academic actions fit existing tiers (evidence > dependency > stage > later)', () => {
  const g = decide(bundleFor({ current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' }, []));
  assert.equal(g.nextAction.tier, 'evidence');
  const p = decide(bundleFor({ current_stage: 'school_11', school_stream: 'pcb' }, []));
  assert.equal(p.nextAction.tier, 'dependency');
  assert.ok(p.alternatives.some((a) => a.action.type === 'compare_degrees' && a.action.tier === 'stage'), 'stage action still offered after');
  const c = decide(bundleFor({ current_stage: 'school_12', school_stream: 'pcm' }, []));
  assert.equal(c.nextAction.tier, 'stage');
});

test('10. multiple simultaneous dependencies rank deterministically', () => {
  const profile = { current_stage: 'school_11', school_stream: 'pcb', primary_goal: 'choose_degree' };
  const recs = [{ domainId: 'software-eng', score: 82 }, { domainId: 'biomedical', score: 80 }, { domainId: 'data-science', score: 79 }];
  const d1 = decide(bundleFor(profile, [], recs));
  const d2 = decide(bundleFor(profile, [], [...recs].reverse()));
  assert.equal(d1.mode, 'keep_open');
  const ts = academicActions(d1).filter((a) => a.type === 'take_subject');
  assert.equal(ts.length, 1, 'one action per subject across tied careers');
  assert.equal(ts[0].careerId, null, 'shared by several careers');
  assert.deepEqual(all(d1).map((a) => a.type), all(d2).map((a) => a.type));
});

test('academicCandidates requires a concrete dependency', () => {
  assert.deepEqual(academicCandidates({ status: 'not_applicable', careers: [], pendingRecords: [] }, [{ careerId: 'x' }]), []);
  assert.deepEqual(academicCandidates({ status: 'evaluated', mode: 'achieved', pendingRecords: [], careers: [{ careerId: 'x', mode: 'achieved', status: 'eligible', routes: [{ routeId: 'a', label: 'A', status: 'eligible', remedies: [] }] }] }, [{ careerId: 'x' }]), []);
  const unknownOnly = { status: 'evaluated', mode: 'achieved', pendingRecords: [], careers: [{ careerId: 'x', mode: 'achieved', status: 'unknown', routes: [
    { routeId: 'a', label: 'A', status: 'unknown', remedies: [{ type: 'check_institution' }] }, { routeId: 'b', label: 'B', status: 'unknown', remedies: [] }] }] };
  assert.deepEqual(academicCandidates(unknownOnly, [{ careerId: 'x' }]), [], 'unknown + unknown: nothing deterministic to recommend');
});

// ------------------------------------------------------------------ 11–12: purity
test('11. inputs are not mutated', () => {
  const profile = { current_stage: 'school_11', school_stream: 'pcb' };
  const records = [r12()];
  const recs = SE.map((r) => ({ ...r }));
  const before = structuredClone({ profile, records, recs });
  const b = bundleFor(profile, records, recs);
  const snap = structuredClone(b);
  decide(b);
  assert.deepEqual({ profile, records, recs }, before);
  assert.deepEqual(b, snap);
});

test('12. same inputs → same decision', () => {
  for (const profile of [{ current_stage: 'school_11', school_stream: 'pcb' }, { current_stage: 'school_12', school_stream: 'pcm' }, { current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' }]) {
    assert.deepEqual(decide(bundleFor(profile, [])), decide(bundleFor(profile, [])));
  }
});
