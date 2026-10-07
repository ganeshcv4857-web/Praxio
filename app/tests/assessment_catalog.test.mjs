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

test('parity: for every stage the catalog yields exactly the current form', () => {
  for (const stage of Object.keys(STAGE_PROFILES)) assert.deepEqual(catalogFor(stage), legacyForm(stage), stage);
});

test('parity: Module 2 catalog matches the current wizard', () => {
  const wiz = C.CATALOG.filter((q) => q.assessment === 'feasibility');
  assert.deepEqual(wiz.map((q) => q.id).sort(), ['education_budget', 'education_preference', 'family_priorities', 'income_band', 'loan_willingness', 'location_preference', 'primary_funder', 'relocation', 'risk_tolerance', 'scholarship_interest']);
  assert.deepEqual(wiz.filter((q) => q.required).map((q) => q.id).sort(), ['education_budget', 'education_preference', 'income_band', 'loan_willingness', 'location_preference', 'relocation', 'risk_tolerance']);
});

test('parity: sliders still record the legacy default until AA3 changes it', () => {
  for (const q of C.CATALOG.filter((x) => x.kind === 'slider')) assert.equal(q.legacyDefault, 50, q.id);
});
