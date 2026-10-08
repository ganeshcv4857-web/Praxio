// D5: end-to-end academic pipeline — records → validator → eligibility → decisionInputs →
// Decision Engine → next action — plus privacy and dependency-direction checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
const { decide } = await import('../src/lib/decision/engine.js');
const El = await import('../src/lib/academic/eligibility.js');
const { SOURCES } = await import('../src/lib/academic/routes.js');
const { validateAcademicRecords } = await import('../supabase/functions/_shared/academic/validate.js');
const { decisionContext } = await import('../supabase/functions/career-ai/decision.js');
const { fallbackNarrative } = await import('../src/lib/decision/narrative.js');
const { evaluateAll } = await import('../src/lib/feasibility/scoring.js');

const OFFICIAL = { ...El.DEFAULT_CATALOG, sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { ...v, status: 'official' }])) };
const inputs = { income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [], primary_funder: 'family', scholarship_interest: 'no' };
const sub = (name_raw, obtained, max = 100) => ({ name_raw, obtained, max, origin: 'user_entered' });
const class12 = (over = {}) => ({ id: 'rec-12', qualification: 'class_12', board: 'CBSE', passing_year: 2026, result_stated: 'pass', subjects_complete: true, evidence_level: 'self_reported', official_verification: 'not_attempted', subjects: [sub('Physics', 81), sub('Mathematics', 88), sub('Chemistry', 76), sub('English Core', 90)], ...over });
const SE = [{ domainId: 'software-eng', score: 91 }, { domainId: 'data-science', score: 72 }];
const ACAD = ['add_academic_record', 'take_subject', 'compare_routes'];

/** The real pipeline, as the app runs it after loading data. */
function journey({ profile, records, recs = SE, marketById = {}, progress = null, catalog = null }) {
  let bundle = buildDecisionInputs({ profile, recs, inputs, marketById, progress, academicRecords: records });
  if (catalog) { // same pipeline, eligibility evaluated against an official-sourced catalog copy
    bundle = { ...bundle, academic: { ...bundle.academic, careers: recs.map((r) => El.summariseForDecision(El.evaluateCareerEligibility({ careerId: r.domainId, academicRecords: records, profile, catalog }))) } };
  }
  return { bundle, decision: decide(bundle) };
}
const actions = (d) => [d.nextAction, ...d.alternatives.map((a) => a.action)];
const academicActions = (d) => actions(d).filter((a) => ACAD.includes(a.type));
const career = (bundle, id = 'software-eng') => bundle.academic.careers.find((c) => c.careerId === id);

test('CASE 1: Class 10 student with a stream, no Class 12 record → prospective, no rejection, exploratory action', () => {
  const { bundle, decision } = journey({ profile: { current_stage: 'school_10', school_stream: 'pcm' }, records: [] });
  assert.deepEqual([bundle.academic.status, bundle.academic.mode], ['evaluated', 'prospective']);
  assert.ok(bundle.academic.careers.every((c) => !['not_eligible', 'eligible'].includes(c.status)));
  assert.equal(decision.mode, 'keep_open');
  assert.equal(decision.nextAction.type, 'explore_stream');
  assert.deepEqual(academicActions(decision), []);
});

test('CASE 2: Class 11 PCM → B.Tech open, future percentage, no false failure', () => {
  const { bundle, decision } = journey({ profile: { current_stage: 'school_11', school_stream: 'pcm' }, records: [] });
  const be = career(bundle).routes.find((r) => r.routeId === 'be_btech');
  assert.equal(be.status, 'open');
  assert.equal(be.requirements.find((q) => q.id === 'pm_plus_third_45').status, 'future');
  assert.ok(!decision.constraints.some((c) => c.module === 'academic'));
  assert.deepEqual(academicActions(decision), []);
});

test('CASE 3: Class 11 PCB wanting engineering → take Mathematics; career not rejected', () => {
  const { bundle, decision } = journey({ profile: { current_stage: 'school_11', school_stream: 'pcb' }, records: [], recs: [{ domainId: 'embedded-iot', score: 90 }] });
  assert.equal(career(bundle, 'embedded-iot').status, 'needs_subject');
  assert.equal(decision.direction.careerId, 'embedded-iot');
  assert.deepEqual([decision.nextAction.type, decision.nextAction.subject], ['take_subject', 'mathematics']);
  assert.notEqual(decision.mode, 'no_viable_path');
});

test('CASE 4: Class 12 student with no record → add_academic_record available', () => {
  const { bundle, decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records: [] });
  assert.deepEqual(bundle.academic.pendingRecords, ['class_12']);
  const add = academicActions(decision).find((a) => a.type === 'add_academic_record');
  assert.deepEqual([add.qualification, add.tier], ['class_12', 'later']);
});

test('CASE 5: Class 12 with valid evidence → route eligible, no academic remediation', () => {
  const records = [class12()];
  assert.equal(validateAcademicRecords(records, { currentYear: 2026 }).valid, true);
  const { bundle, decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records });
  assert.equal(bundle.academic.mode, 'achieved');
  assert.equal(career(bundle).status, 'eligible');
  assert.equal(career(bundle).evidenceLevel, 'self_reported', 'evidence level visible, not upgraded');
  assert.deepEqual(academicActions(decision), []);
  assert.equal(decision.nextAction.type, 'compare_degrees');
});

test('CASE 6: authoritative block on B.Tech, alternative route exists → compare_routes', () => {
  const records = [class12({ subjects: [sub('Mathematics', 88), sub('Chemistry', 76), sub('English Core', 90), sub('Computer Science', 92)] })];
  const { bundle, decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records, catalog: OFFICIAL });
  const be = career(bundle).routes.find((r) => r.routeId === 'be_btech');
  assert.deepEqual([be.status, be.blocking], ['not_eligible', ['physics_maths']]);
  assert.equal(career(bundle).status, 'unknown', 'BCA / B.Sc still possible');
  assert.equal(decision.nextAction.type, 'compare_routes');
  assert.equal(decision.direction.careerId, 'software-eng');
});

test('CASE 7: same record against the real (secondary-source) catalog → no definitive rejection', () => {
  const records = [class12({ subjects: [sub('Mathematics', 88), sub('Chemistry', 76), sub('English Core', 90), sub('Computer Science', 92)] })];
  const { bundle, decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records });
  const be = career(bundle).routes.find((r) => r.routeId === 'be_btech');
  assert.equal(be.status, 'unknown');
  assert.equal(be.requirements.find((q) => q.id === 'physics_maths').indicative, 'not_satisfied');
  assert.ok(!academicActions(decision).some((a) => a.type === 'compare_routes'));
  assert.ok(!decision.constraints.some((c) => c.module === 'academic'));
});

test('CASE 8: route A not eligible + route B unknown → career unknown, not impossible', () => {
  // No Physics on a complete list: B.Tech closed (official); BCA / B.Sc stay unknown.
  const rec = [class12({ subjects: [sub('Mathematics', 88), sub('Chemistry', 76)] })];
  const j = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records: rec, recs: [{ domainId: 'software-eng', score: 91 }], catalog: OFFICIAL });
  const c = career(j.bundle);
  assert.deepEqual(c.routes.map((r) => r.status), ['not_eligible', 'unknown', 'unknown']);
  assert.equal(c.status, 'unknown');
  assert.notEqual(j.decision.mode, 'no_viable_path');
  assert.equal(j.decision.direction.careerId, 'software-eng');
  assert.ok(!j.decision.constraints.some((x) => x.module === 'academic'));
});

test('CASE 9: route A not eligible + route B eligible → career eligible, decision proceeds normally', () => {
  const records = [class12({ subjects: [sub('Mathematics', 88), sub('Chemistry', 76), sub('English Core', 90)] })];
  const catalog = {
    ...OFFICIAL,
    routes: { ...OFFICIAL.routes, maths_route: { ...OFFICIAL.routes.be_btech, id: 'maths_route', label: 'Maths route', requirements: [{ id: 'm', type: 'subjects_all', label: 'Mathematics', params: { subjects: ['mathematics'] }, source: 'aicte_be_btech_ptu' }] } },
    careerEntry: { 'software-eng': { routes: ['be_btech', 'maths_route'] } },
  };
  const { bundle, decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records, recs: [{ domainId: 'software-eng', score: 91 }], catalog });
  assert.deepEqual(career(bundle).routes.map((r) => r.status), ['not_eligible', 'eligible']);
  assert.equal(career(bundle).status, 'eligible');
  assert.equal(decision.mode, 'commit');
  assert.equal(decision.nextAction.type, 'compare_routes', 'points at the open route');
  assert.equal(decision.nextAction.tier, 'dependency');
});

test('CASE 10: academic + Career Fit + Feasibility + Market + skills coexist without overwriting', () => {
  const now = Date.now();
  const market = { career: 'Software Engineering', researched_at: new Date(now).toISOString(), expires_at: new Date(now + 864e6).toISOString(),
    market: { demand: { level: 'high', trend: 'growing', summary: '', sources: ['https://example.org'] }, core_skills: [{ skill: 'Python', text: '', sources: [] }], tools: [], emerging_skills: [] } };
  const progress = { demonstratedSkills: ['Python'], learnedSkills: ['Python'], points: 30, evaluations: [{ total_score: 80 }] };
  const profile = { current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' };
  const withAcademic = journey({ profile, records: [class12()], marketById: { 'software-eng': market }, progress });
  const without = journey({ profile, records: undefined, marketById: { 'software-eng': market }, progress });
  assert.equal(career(withAcademic.bundle).status, 'eligible');
  // Eligibility is a feasibility gate: an open result adds the factor and changes nothing else.
  const stripGate = (cs) => cs.map((c) => (c.feasibility?.factors?.eligibility
    ? { ...c, feasibility: { ...c.feasibility, factors: Object.fromEntries(Object.entries(c.feasibility.factors).filter(([k]) => k !== 'eligibility')) } }
    : c));
  assert.equal(withAcademic.bundle.careers.find((c) => c.careerId === 'software-eng').feasibility.factors.eligibility.status, 'good');
  assert.deepEqual(stripGate(withAcademic.bundle.careers), stripGate(without.bundle.careers), 'fit, feasibility score, alignment, market, skill gap identical');
  assert.deepEqual(withAcademic.bundle.skills, without.bundle.skills);
  const ev = withAcademic.decision.evidence;
  assert.equal(ev.careerFit, 91);
  assert.equal(ev.feasibility.score, evaluateAll(inputs, SE)[0].score);
  assert.equal(ev.market.demand, 'high');
  assert.deepEqual(ev.skills.demonstrated, ['Python']);
  assert.equal(ev.academic.status, 'eligible');
  const { academic: _a, ...restWith } = ev;
  assert.deepEqual(restWith, without.decision.evidence, 'academic evidence is additive only');
});

// ------------------------------------------------------------------ privacy
test('privacy: no marks, record ids or document ids reach the decision or the AI prompt context', () => {
  const records = [class12({ id: 'rec-PRIVATE', document_id: 'doc-PRIVATE', subjects: [sub('Physics', 81.37), sub('Mathematics', 88.61), sub('Chemistry', 76.29)] })];
  for (const profile of [{ current_stage: 'school_12', school_stream: 'pcm' }, { current_stage: 'graduate_unemployed', primary_goal: 'choose_degree' }]) {
    const { bundle, decision } = journey({ profile, records });
    const outputs = [JSON.stringify(bundle.academic), JSON.stringify(decision), JSON.stringify(decisionContext(decision)), JSON.stringify(fallbackNarrative(decision))];
    for (const text of outputs) {
      for (const leak of ['81.37', '88.61', '76.29', 'rec-PRIVATE', 'doc-PRIVATE', 'name_raw', 'obtained']) assert.ok(!text.includes(leak), `${leak} leaked`);
    }
  }
  // Decision for a missing-record student also leaks nothing about other users or records.
  const { decision } = journey({ profile: { current_stage: 'school_12', school_stream: 'pcm' }, records: [] });
  assert.ok(!JSON.stringify(decisionContext(decision)).includes('subjects'));
});

// ------------------------------------------------------------------ architecture
const DIR = resolve(fileURLToPath(new URL('../src/lib/', import.meta.url)));
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
});
// Static `import … from '…'`, bare `import '…'` and `export … from '…'`.
const importsOf = (p) => [...readFileSync(p, 'utf8').matchAll(/(?:\bfrom|^\s*import)\s+'([^']+)'/gm)].map((m) => m[1]);

test('architecture: dependency direction is evidence → validation → eligibility → decision inputs → engine', () => {
  const dir = DIR;
  const lib = (rel) => join(dir, rel);
  // Eligibility must not depend on decisions, Career Fit, AI or the database.
  for (const imp of importsOf(lib('academic/eligibility.js'))) {
    assert.ok(!/decision|scoring|features|\/ai|career-ai|db\.js|supabase\.js|marketIntelligence/.test(imp), `eligibility imports ${imp}`);
  }
  // The engine consumes results; it never imports the eligibility engine, validator or routes.
  for (const f of ['decision/engine.js', 'decision/candidates.js', 'decision/config.js']) {
    for (const imp of importsOf(lib(f))) assert.ok(!/academic\//.test(imp), `${f} imports ${imp}`);
  }
  // Career Fit does not know about academics.
  for (const f of ['scoring.js', 'features.js', 'careers.js']) {
    for (const imp of importsOf(lib(f))) assert.ok(!/academic/.test(imp), `${f} imports ${imp}`);
  }
  // Only decisionInputs (the boundary) calls the eligibility engine.
  const callers = files(dir).filter((p) => importsOf(p).some((i) => /academic\/eligibility\.js$/.test(i))).map((p) => p.slice(dir.length + 1).replace(/\\/g, '/'));
  assert.deepEqual(callers, ['decisionInputs.js']);
});

test('architecture: no circular imports in src/lib', () => {
  const dir = DIR;
  const graph = new Map();
  for (const f of files(dir)) {
    graph.set(f, importsOf(f).filter((i) => i.startsWith('.')).map((i) => resolve(f, '..', i)).filter((p) => p.startsWith(dir)));
  }
  const edges = [...graph.values()].reduce((n, e) => n + e.length, 0);
  assert.ok(edges > 50, `import graph was built (${edges} edges), so the check is not vacuous`);
  const state = new Map();
  const cycles = [];
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'active') { cycles.push([...path.slice(path.indexOf(n)), n].map((p) => p.slice(dir.length))); return; }
    state.set(n, 'active');
    for (const m of graph.get(n) ?? []) visit(m, [...path, n]);
    state.set(n, 'done');
  };
  for (const n of graph.keys()) visit(n, []);
  // KNOWN, pre-existing (Review 1, Module 2): scoring.js ↔ financing.js. It works only because
  // ES modules hoist function declarations. Out of scope here; any OTHER cycle fails.
  const KNOWN = ['feasibility/financing.js', 'feasibility/scoring.js'];
  const norm = (c) => [...new Set(c.map((p) => p.replace(/\\/g, '/').replace(/^\//, '')))].sort();
  const unexpected = cycles.filter((c) => JSON.stringify(norm(c)) !== JSON.stringify(KNOWN));
  assert.deepEqual(unexpected, []);
  assert.ok(cycles.length <= 1, 'the known cycle is the only one');
});
