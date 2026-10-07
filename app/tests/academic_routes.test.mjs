// Academic Eligibility D1: entry-route catalog integrity, sources and career linkage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const R = await import('../src/lib/academic/routes.js');
const { CAREER_ENTRY } = await import('../src/lib/careerEntry.js');
const { CAREERS } = await import('../src/lib/careers.js');
const { canonicaliseSubject } = await import('../supabase/functions/_shared/academic/subjects.js');

test('catalog is internally consistent', () => {
  assert.deepEqual(R.catalogProblems(CAREER_ENTRY), []);
  assert.ok(R.ROUTES_VERSION);
  assert.match(R.ACADEMIC_YEAR, /^\d{4}-\d{2}$/);
});

test('catalog self-check catches broken entries', () => {
  assert.ok(R.catalogProblems({ x: { routes: ['b_magic'] } }).some((p) => /unknown route b_magic/.test(p)));
});

test('every requirement has a source with authority, date and status', () => {
  for (const route of Object.values(R.ENTRY_ROUTES)) {
    for (const q of route.requirements) {
      const src = R.sourceOf(q);
      assert.ok(src, `${route.id}/${q.id}`);
      assert.ok(R.SOURCE_STATUSES.includes(src.status));
      assert.match(src.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
      if (src.status !== 'unverified') assert.match(src.url, /^https:\/\//);
    }
  }
});

test('no requirement is presented as official until a primary source is pinned', () => {
  // Today every source is secondary or unverified; this flips deliberately when the AICTE
  // handbook clause is recorded with status 'official'.
  for (const [key, src] of Object.entries(R.SOURCES)) {
    if (src.status === 'official') assert.ok(!/ptu\.ac\.in|uok\.edu\.in/.test(src.url), `${key}: a university copy is not a primary source`);
  }
  assert.equal(R.SOURCES.aicte_be_btech_ptu.status, 'secondary');
});

test('only supported requirement types and known subjects are used', () => {
  const used = new Set(Object.values(R.ENTRY_ROUTES).flatMap((r) => r.requirements.map((q) => q.type)));
  for (const t of used) assert.ok(R.REQUIREMENT_TYPES.includes(t));
  assert.deepEqual([...used].sort(), [...R.REQUIREMENT_TYPES].sort(), 'no unused requirement types are defined');
});

test('B.E./B.Tech route encodes the sourced national minimum', () => {
  const r = R.ENTRY_ROUTES.be_btech;
  const byId = Object.fromEntries(r.requirements.map((q) => [q.id, q]));
  assert.deepEqual(byId.physics_maths.params.subjects, ['physics', 'mathematics']);
  assert.ok(byId.third_subject.params.subjects.includes('chemistry'));
  assert.ok(!byId.third_subject.params.subjects.includes('mathematics'), 'third subject is in addition to P and M');
  assert.deepEqual([byId.pm_plus_third_45.params.min, byId.pm_plus_third_45.params.relaxedMin], [45, 40]);
  assert.ok(r.assumptions.some((a) => /recognised/.test(a)), 'recognised-board condition disclosed, not evaluated');
  assert.ok(r.steps.every((s) => s.kind === 'entrance'), 'entrance exams are steps, not requirements');
});

test('AICTE third-subject names canonicalise to the catalog ids', () => {
  for (const [name, id] of [['Chemistry', 'chemistry'], ['Electronics', 'electronics'], ['Agriculture', 'agriculture'], ['Entrepreneurship', 'entrepreneurship'], ['Engineering Graphics', 'engineering_graphics'], ['Business Studies', 'business_studies']]) {
    assert.equal(canonicaliseSubject(name).canonical, id, name);
  }
  assert.equal(canonicaliseSubject('Technical Vocational Subject').status, 'unknown', 'a category, not a subject: stays unknown');
});

test('university-specific routes cannot be decided from a marksheet', () => {
  for (const id of ['bca', 'bsc_cs']) {
    const r = R.ENTRY_ROUTES[id];
    assert.ok(r.requirements.some((q) => q.type === 'institution_specific'), id);
  }
  assert.equal(R.SOURCES.university_specific.status, 'unverified');
  assert.equal(R.SOURCES.university_specific.url, null);
});

test('every career links to at least one route; existing labels are untouched', () => {
  for (const c of CAREERS) {
    const e = CAREER_ENTRY[c.id];
    assert.ok(e, c.id);
    assert.ok(e.routes.length >= 1, c.id);
    assert.ok(e.degrees.length && e.streams.length && e.exams.length, `${c.id} labels kept`);
  }
  assert.deepEqual(CAREER_ENTRY['software-eng'].routes, ['be_btech', 'bca', 'bsc_cs']);
  assert.deepEqual(CAREER_ENTRY['software-eng'].degrees, ['B.Tech / B.E. in CSE or IT', 'BCA', 'B.Sc Computer Science']);
});

test('catalog objects are frozen (no runtime mutation)', () => {
  assert.ok(Object.isFrozen(R.ENTRY_ROUTES) && Object.isFrozen(R.ENTRY_ROUTES.be_btech) && Object.isFrozen(R.SOURCES.aicte_be_btech_ptu));
});
