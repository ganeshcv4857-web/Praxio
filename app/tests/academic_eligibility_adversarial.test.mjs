// Academic Eligibility D3: adversarial / boundary hardening of the eligibility engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const E = await import('../src/lib/academic/eligibility.js');
const { ENTRY_ROUTES, SOURCES } = await import('../src/lib/academic/routes.js');
const { evaluateCareerEligibility, DEFAULT_CATALOG } = E;
const OFFICIAL = { ...DEFAULT_CATALOG, sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, status: 'official' }])) };

const sub = (name_raw, obtained, max = 100, extra = {}) => ({ name_raw, obtained, max, ...extra });
const rec = (over = {}) => ({ qualification: 'class_12', result_stated: 'pass', subjects_complete: true, evidence_level: 'self_reported', subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75)], ...over });
const run = (records, { career = 'ai-ml', profile = { current_stage: 'undergraduate' }, catalog = OFFICIAL } = {}) =>
  evaluateCareerEligibility({ careerId: career, academicRecords: records, profile, catalog, currentYear: 2026 });
const req = (res, id) => res.routes[0].requirements.find((q) => q.id === id);
const pct = (marks) => req(run([rec({ subjects: marks.map(([n, o, m]) => sub(n, o, m ?? 100)) })]), 'pm_plus_third_45');

// ------------------------------------------------------------------ threshold boundaries
test('threshold boundaries are compared on exact values, never on rounded ones', () => {
  assert.equal(pct([['Physics', 45], ['Mathematics', 45], ['Chemistry', 45]]).status, 'satisfied', 'exactly 45% passes');
  // 134.99 / 300 = 44.9967% — rounds to 45.00 for display but is below the minimum.
  const under = pct([['Physics', 44.99], ['Mathematics', 45], ['Chemistry', 45]]);
  assert.deepEqual([under.status, under.reason], ['unknown', 'relaxation_band']);
  assert.equal(under.evidence.values.best.percentage, 45, 'display value is rounded');
  assert.ok(under.evidence.values.best.exact < 45, 'decision used the exact value');
  assert.equal(pct([['Physics', 40], ['Mathematics', 40], ['Chemistry', 40]]).reason, 'relaxation_band', 'exactly 40% is in the band');
  const below = pct([['Physics', 39.99], ['Mathematics', 40], ['Chemistry', 40]]);
  assert.deepEqual([below.status, below.reason], ['not_satisfied', 'below_minimum'], 'just under 40% fails (official catalog)');
});

test('combined percentage uses marks taken together, across different maximums', () => {
  // 40/50 + 85/100 + 150/200 = 275/350 = 78.57%
  const r = pct([['Physics', 40, 50], ['Mathematics', 85, 100], ['Chemistry', 150, 200]]);
  assert.equal(r.status, 'satisfied');
  assert.equal(r.evidence.values.best.percentage, 78.57);
});

test('equal-scoring third subjects resolve deterministically by subject id', () => {
  const r = pct([['Physics', 80], ['Mathematics', 85], ['Chemistry', 75], ['Biology', 75]]);
  assert.equal(r.evidence.values.best.third, 'biology');
  const reversed = pct([['Biology', 75], ['Chemistry', 75], ['Mathematics', 85], ['Physics', 80]]);
  assert.deepEqual(reversed.evidence.values, r.evidence.values);
});

// ------------------------------------------------------------------ malformed input never crashes or invents
test('malformed top-level input degrades to unknown / no route, never throws', () => {
  assert.equal(evaluateCareerEligibility().status, 'no_catalogued_route');
  for (const records of [null, undefined, {}, { qualification: 'class_12' }, 'class_12', 42, [null, undefined, 5, 'x']]) {
    const res = run(records);
    assert.equal(res.status, 'unknown', JSON.stringify(records));
    assert.equal(req(res, 'passed_12').reason, 'no_record');
  }
  assert.equal(run([rec()], { profile: null }).mode, 'achieved');
});

test('malformed subjects / marks become unknown via the validator, never satisfied', () => {
  const cases = [
    rec({ subjects: 'Physics, Mathematics' }),
    rec({ subjects: [null, sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75)] }),
    rec({ subjects: [sub('Physics', NaN), sub('Mathematics', 85), sub('Chemistry', 75)] }),
    rec({ subjects: [sub('Physics', 80, Infinity), sub('Mathematics', 85), sub('Chemistry', 75)] }),
    rec({ subjects: [sub('Physics', '80'), sub('Mathematics', 85), sub('Chemistry', 75)] }),
    rec({ subjects: [sub('Physics', -5), sub('Mathematics', 85), sub('Chemistry', 75)] }),
  ];
  for (const r of cases) {
    const res = run([r]);
    assert.notEqual(req(res, 'pm_plus_third_45').status, 'satisfied', JSON.stringify(r.subjects));
    assert.notEqual(res.status, 'eligible');
  }
});

test('qualification must match exactly; near-misses are no record, not a guess', () => {
  assert.equal(req(run([rec({ qualification: 'CLASS_12' })]), 'passed_12').reason, 'no_record');
  assert.equal(req(run([rec({ qualification: 'class_10' })]), 'passed_12').reason, 'no_record');
});

// ------------------------------------------------------------------ prototype-key hostility
test('inherited object keys never resolve as careers, streams, routes, sources or subjects', () => {
  for (const careerId of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(evaluateCareerEligibility({ careerId }).status, 'no_catalogued_route', careerId);
  }
  for (const stream of ['constructor', '__proto__', 'toString']) {
    const res = evaluateCareerEligibility({ careerId: 'ai-ml', profile: { current_stage: 'school_11', school_stream: stream } });
    assert.equal(res.routes[0].status, 'unknown', stream);
  }
  const hostileCatalog = { ...OFFICIAL, careerEntry: { t: { routes: ['toString', 'be_btech'] } } };
  assert.deepEqual(evaluateCareerEligibility({ careerId: 't', academicRecords: [rec()], catalog: hostileCatalog }).routes.map((r) => r.routeId), ['be_btech']);
  const r = E.evaluateRequirement({ id: 'x', type: 'qualification_passed', label: 'p', params: { qualification: 'class_12' }, source: 'toString' },
    { qualification: 'class_12', record: { result_stated: 'fail' }, subjects: [], errorFields: [], complete: true });
  assert.deepEqual([r.status, r.source.status], ['unknown', 'unverified'], 'unknown source key is not official');
  const canonicalHack = run([rec({ subjects: [sub('Physics', 80), sub('Mathematics', 85), sub('Chemistry', 75, 100, { canonical: 'constructor' })] })]);
  assert.notEqual(req(canonicalHack, 'third_subject').status, 'satisfied');
});

// ------------------------------------------------------------------ catalog hostility
test('unsupported requirement types and unknown source keys never block', () => {
  const route = (requirements) => ({ ...OFFICIAL, careerEntry: { t: { routes: ['r'] } }, routes: { r: { ...ENTRY_ROUTES.be_btech, id: 'r', requirements } } });
  const telepathy = evaluateCareerEligibility({ careerId: 't', academicRecords: [rec()], catalog: route([{ id: 'z', type: 'telepathy', label: '?', params: {}, source: 'aicte_be_btech_ptu' }]) });
  assert.deepEqual([telepathy.status, telepathy.routes[0].requirements[0].reason], ['unknown', 'unsupported_requirement']);
  const noSource = evaluateCareerEligibility({ careerId: 't', academicRecords: [rec({ result_stated: 'fail' })], catalog: route([{ id: 'p', type: 'qualification_passed', label: 'p', params: { qualification: 'class_12' }, source: 'missing' }]) });
  assert.equal(noSource.status, 'unknown', 'an unsourced rule cannot fail anyone');
});

test('a route listed twice for a career is evaluated once', () => {
  const res = evaluateCareerEligibility({ careerId: 't', academicRecords: [rec()], catalog: { ...OFFICIAL, careerEntry: { t: { routes: ['be_btech', 'be_btech'] } } } });
  assert.deepEqual(res.routes.map((r) => r.routeId), ['be_btech']);
});

test('career with only uncatalogued route ids → no_catalogued_route', () => {
  const res = evaluateCareerEligibility({ careerId: 't', academicRecords: [rec()], catalog: { ...OFFICIAL, careerEntry: { t: { routes: ['b_arch', 'nata'] } } } });
  assert.equal(res.status, 'no_catalogued_route');
});

// ------------------------------------------------------------------ evidence hostility
test('unknown evidence levels are not treated as stronger evidence', () => {
  assert.equal(run([rec({ evidence_level: 'super_verified' })]).routes[0].evidenceLevel, null);
  assert.equal(run([rec({ evidence_level: 'officially_verified' })]).routes[0].evidenceLevel, null, 'not an evidence_level value');
  assert.equal(E.weakestEvidence(['document_checked', 'self_reported', 'extracted']), 'self_reported');
  assert.equal(E.weakestEvidence([null, undefined, 'bogus']), null);
});

test('officiallyVerified is only true for the exact stored value', () => {
  for (const v of ['verified', 'OFFICIALLY_VERIFIED', true, 'document_checked']) {
    assert.equal(run([rec({ official_verification: v })]).routes[0].officiallyVerified, false, String(v));
  }
});

// ------------------------------------------------------------------ prospective hostility
test('prospective mode ignores Class 12-looking records for school_10 / school_11', () => {
  for (const stage of ['school_10', 'school_11']) {
    const res = run([rec()], { profile: { current_stage: stage, school_stream: 'pcm' } });
    assert.equal(res.mode, 'prospective', stage);
    assert.ok(res.routes.every((r) => r.status !== 'eligible' && r.status !== 'not_eligible'));
  }
});

test('prospective statuses never include achieved verdicts', () => {
  for (const stream of ['pcm', 'pcb', 'pcmb', 'commerce', 'humanities', 'undecided', null, 'nonsense']) {
    const res = run([], { career: 'software-eng', profile: { current_stage: 'school_11', school_stream: stream } });
    for (const r of res.routes) assert.ok(['open', 'needs_subject', 'unknown'].includes(r.status), `${stream}: ${r.status}`);
    assert.ok(['open', 'needs_subject', 'unknown'].includes(res.status));
  }
});

// ------------------------------------------------------------------ determinism & isolation at scale
test('large inputs stay deterministic and do not mutate', () => {
  const many = rec({ subjects: Array.from({ length: 200 }, (_, i) => sub(`Elective ${String.fromCharCode(65 + (i % 26))}${i}`, 50)) });
  const before = structuredClone(many);
  const a = run([many]);
  const b = run([many]);
  assert.deepEqual(a, b);
  assert.deepEqual(many, before);
});

test('results do not share mutable state between calls', () => {
  const a = run([rec()]);
  a.routes[0].remedies.push({ type: 'tampered' });
  a.routes[0].steps.push({ kind: 'tampered' });
  const b = run([rec()]);
  assert.ok(!b.routes[0].remedies.some((r) => r.type === 'tampered'));
  assert.ok(!b.routes[0].steps.some((s) => s.kind === 'tampered'));
  assert.ok(!ENTRY_ROUTES.be_btech.steps.some((s) => s.kind === 'tampered'));
});
