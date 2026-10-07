// Adaptive assessment: question catalog — consumers, versioning, legacy Career Fit golden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const C = await import('../src/lib/assessment/catalog.js');
const { CAREERS } = await import('../src/lib/careers.js');
const { rankCareers } = await import('../src/lib/scoring.js');
const { STAGE_PROFILES } = await import('../src/lib/userContext.js');
const F = await import('../src/lib/features.js');
const { APTITUDE_QUIZ } = await import('../src/lib/quiz.js');

const golden = JSON.parse(readFileSync(new URL('./fixtures/career_fit_golden.json', import.meta.url), 'utf8'));
const WEIGHTED = new Set(CAREERS.flatMap((c) => Object.keys(c.weights)));
// Derived features read through the slider that produces them.
const INVERSE = { pref_solo: 'pref_team', pref_applied: 'pref_research', pref_novelty: 'pref_stability', pref_screen: 'pref_hands_on' };
for (const [derived, source] of Object.entries(INVERSE)) if (WEIGHTED.has(derived)) WEIGHTED.add(source);

test('every question declares the schema fields', () => {
  for (const q of C.CATALOG) {
    for (const k of ['id', 'v', 'assessment', 'page', 'kind', 'field', 'label', 'feeds', 'purpose', 'priority']) assert.ok(q[k] != null, `${q.id}: ${k}`);
    assert.ok(Array.isArray(q.feeds), q.id);
    assert.ok(C.PAGES[q.assessment]?.includes(q.page), `${q.id}: page ${q.page}`);
    assert.ok(q.stages === null || q.stages.length > 0, q.id);
    assert.ok(Object.isFrozen(q), q.id);
  }
});

test('question ids and (id, v) pairs are unique; versions present', () => {
  const ids = C.CATALOG.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of C.CATALOG) assert.ok(Number.isInteger(q.v) && q.v >= 1, q.id);
  assert.match(C.ASSESSMENT_VERSION, /^assessment-v\d+$/);
  assert.equal(C.LEGACY_ASSESSMENT_VERSION, 'assessment-v1');
});

test('every feed names a known module; Career Fit feeds point at weighted features', () => {
  for (const q of C.CATALOG) {
    for (const f of q.feeds) {
      assert.ok(C.MODULES.includes(f.module), `${q.id}: ${f.module}`);
      if (q.store === 'meta') {
        // A gate is legitimate only if it gates questions that feed the module it names.
        const gated = C.CATALOG.filter((x) => x.requires.includes(q.id));
        assert.ok(gated.length && gated.every((x) => x.feeds.some((y) => y.module === f.module)), `${q.id} gates nothing for ${f.module}`);
        continue;
      }
      if (f.module === 'career_fit' && q.kind !== 'quiz' && q.id !== 'branch') assert.ok(WEIGHTED.has(q.id), `${q.id} feeds career_fit but no career weights it`);
      if (q.kind === 'quiz') assert.ok(WEIGHTED.has(q.dim), q.id);
    }
  }
  assert.ok(WEIGHTED.has('branch_fit'));
});

test('a question either has a real consumer or is an explicitly listed audit finding', () => {
  const orphans = C.CATALOG.filter((q) => q.feeds.length === 0).map((q) => q.id).sort();
  assert.deepEqual(orphans, [...C.AUDIT_NO_CONSUMER].sort());
  assert.ok(!WEIGHTED.has('int_people'), 'int_people really has no Career Fit consumer');
});

test('legacy profiles: Career Fit matches the golden snapshot exactly', () => {
  for (const [name, { profile, ranked }] of Object.entries(golden)) {
    const now = rankCareers(profile).map((r) => ({ domainId: r.domainId, score: r.score, coverage: r.coverage }));
    assert.deepEqual(now, ranked, name);
  }
});

// ------------------------------------------------------------------ parity with the pre-catalog form
// Expected questions per stage, derived independently from the existing stage config
// (STAGE_PROFILES steps + asks flags) and feature lists that the onboarding form uses.
function legacyForm(stage) {
  const p = STAGE_PROFILES[stage];
  const pages = ['stage', ...p.steps];
  const out = [{ id: 'current_stage', req: true }, { id: 'current_activity', req: true }, { id: 'primary_goal', req: true }];
  if (pages.includes('about')) {
    out.push({ id: 'full_name', req: true });
    if (p.asks.stream) out.push({ id: 'school_stream', req: true });
    if (p.asks.branch) out.push({ id: 'branch', req: true });
    if (p.asks.year) out.push({ id: 'year_of_study', req: true });
    if (p.asks.role) out.push({ id: 'current_role', req: false });
  }
  if (pages.includes('interests')) F.INTERESTS.forEach((x) => out.push({ id: x.key, req: true }));
  if (pages.includes('aptitude')) F.APTITUDES.forEach((x) => out.push({ id: x.key, req: true }));
  if (pages.includes('quiz')) APTITUDE_QUIZ.forEach((_, i) => out.push({ id: `quiz_${i}`, req: false }));
  if (pages.includes('preferences')) F.PREFERENCES.forEach((x) => out.push({ id: x.key, req: false }));
  if (pages.includes('traits')) F.TRAITS.forEach((x) => out.push({ id: x.key, req: true }));
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const catalogFor = (stage) => C.CATALOG
  .filter((q) => q.assessment === 'profile' && (q.stages === null || q.stages.includes(stage)))
  .map((q) => ({ id: q.id, req: q.required }))
  .sort((a, b) => a.id.localeCompare(b.id));

test('v1 → v2: the only differences from the old form are the approved changes', () => {
  const ADDED = {
    school_10: ['school_stream_leaning', 'tried_programming'],
    school_11: ['tried_programming'],
    school_12: ['class12_results_status', 'tried_programming'],
    career_switcher: ['tried_programming'],
  };
  const REMOVED = ['current_activity', 'int_people'];
  for (const stage of Object.keys(STAGE_PROFILES)) {
    const v1 = legacyForm(stage);
    const v2 = catalogFor(stage);
    const ids1 = v1.map((x) => x.id);
    const ids2 = v2.map((x) => x.id);
    assert.deepEqual(ids2.filter((id) => !ids1.includes(id)).sort(), (ADDED[stage] ?? []).sort(), `${stage}: added`);
    assert.deepEqual(ids1.filter((id) => !ids2.includes(id)).sort(), REMOVED, `${stage}: removed`);
    const req1 = Object.fromEntries(v1.map((x) => [x.id, x.req]));
    const changed = v2.filter((x) => x.id in req1 && req1[x.id] !== x.req).map((x) => x.id);
    assert.deepEqual(changed, ['full_name'], `${stage}: only the name became optional`);
  }
});

test('Module 2 catalog still matches the wizard (changed in AA5)', () => {
  const wiz = C.CATALOG.filter((q) => q.assessment === 'feasibility');
  assert.deepEqual(wiz.map((q) => q.id).sort(), ['education_budget', 'education_preference', 'family_priorities', 'income_band', 'loan_willingness', 'location_preference', 'primary_funder', 'relocation', 'risk_tolerance', 'scholarship_interest']);
});

test('sliders have no default and offer "not sure"; Likert items offer "not sure"', () => {
  for (const q of C.CATALOG.filter((x) => x.kind === 'slider')) {
    assert.equal(q.legacyDefault, undefined, q.id);
    assert.equal(q.unknown, 'absent', q.id);
    assert.equal(q.required, false, `${q.id}: untouched means unknown`);
  }
  for (const q of C.CATALOG.filter((x) => x.kind === 'likert')) assert.equal(q.unknown, 'absent', q.id);
});

test('retired questions are gone from the catalog but kept in the feature model for legacy data', () => {
  for (const id of Object.keys(C.RETIRED)) assert.equal(C.QUESTION_BY_ID[id], undefined, id);
  assert.ok(F.INTERESTS.some((x) => x.key === 'int_people'), 'legacy int_people answers stay readable');
});

test('wording changes bumped the version; meaning changes got new ids', () => {
  for (const q of C.CATALOG) {
    if (q.schoolLabel && q.schoolLabel !== q.label) assert.ok(q.v >= 2, `${q.id}: school wording needs a version bump`);
    if (q.schoolLeft && (q.schoolLeft !== q.left || q.schoolRight !== q.right)) assert.ok(q.v >= 2, q.id);
  }
  // Class 10 "leaning" is a different measurement from Class 11–12 "stream": a new id on the same field.
  assert.notEqual(C.QUESTION_BY_ID.school_stream_leaning.id, C.QUESTION_BY_ID.school_stream.id);
  assert.equal(C.QUESTION_BY_ID.school_stream_leaning.field, C.QUESTION_BY_ID.school_stream.field);
  assert.equal(C.ASSESSMENT_VERSION, 'assessment-v2');
  assert.equal(C.assessmentVersionOf({}), 'assessment-v1', 'unversioned profiles are legacy v1');
  assert.equal(C.assessmentVersionOf({ assessment_version: 'assessment-v2' }), 'assessment-v2');
});

test('assessment migration is additive: nullable/defaulted columns, no backfill, no RLS change', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261011000000_adaptive_assessment.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  for (const col of ['assessment_version text', 'assessment_meta jsonb not null default', 'class12_results_status text check']) assert.ok(sql.includes(col), col);
  assert.match(sql, /class12_results_status in \('out', 'awaiting', 'unsure'\)/);
  assert.ok(!/\bupdate\s+public\./i.test(sql), 'no backfill of old answers');
  assert.ok(!/policy|row level security|drop column/i.test(sql), 'no RLS change, nothing dropped');
});
