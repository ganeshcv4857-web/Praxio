import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
console.warn = () => {};

const E = await import('../src/lib/alignment/engine.js');
const { WEIGHTS, CATEGORIES } = await import('../src/lib/alignment/config.js');
const N = await import('../src/lib/alignment/narrative.js');
const A = await import('../supabase/functions/career-ai/alignment.js');
const { MODE_PROVIDERS } = await import('../supabase/functions/career-ai/gateway.js');
const db = await import('../src/lib/db.js');
const { DEMO_USER_ID, resetDemo, readDemoSnapshot } = await import('../src/lib/demoDb.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
const { fromRow } = await import('../src/lib/ai.js');
const { evaluateAll } = await import('../src/lib/feasibility/scoring.js');

const uid = DEMO_USER_ID;
beforeEach(() => resetDemo());

const profile = { branch: 'cse', interests: { int_software: 5 }, aptitude: { apt_programming: 5 }, preferences: { pref_stability: 70, pref_coding: 80 }, traits: { tr_risk: 2 } };
const riskyStudent = { ...profile, preferences: { pref_stability: 10 }, traits: { tr_risk: 5 } };
const family = (over = {}) => ({
  income_band: '10to20', education_budget: 'gt20', loan_willingness: 'yes', risk_tolerance: 'moderate',
  education_preference: 'masters_spec', location_preference: 'india', relocation: 'india',
  family_priorities: ['financial_stability', 'job_security'], ...over,
});
const rec = (domainId, score = 85) => ({ domainId, score, rank: 1 });
const align = (careerId, inputs, p = profile, recs = [rec(careerId)]) =>
  E.alignCareer({ careerId, rec: recs.find((r) => r.domainId === careerId), recs, profile: p, inputs });
const dim = (a, id) => a.dimensions.find((d) => d.dimension === id);

// 1
test('fully aligned case: every known dimension aligned, strong alignment', () => {
  const a = align('software-eng', family());
  for (const d of a.dimensions.filter((x) => x.score != null)) assert.equal(d.status, 'aligned', d.dimension);
  assert.equal(a.score, 100);
  assert.equal(a.category.id, 'strong');
  assert.equal(a.conflicts.length, 0);
  assert.equal(a.recommendedPathId, 'direct');
});

// 2
test('financial conflict: path costs more than the family can fund (no raw amounts shown for family)', () => {
  const a = align('product-management', family({ education_budget: 'lt2', loan_willingness: 'no' }));
  const f = dim(a, 'financial');
  assert.equal(f.status, 'conflict');
  assert.equal(f.severity, 'high');
  assert.match(f.family, /^Education budget: well below what this path costs$/);
  assert.ok(!/₹/.test(f.family), 'family budget never shown as an amount');
  assert.match(f.student, /₹/, 'pathway cost (career data) may be shown');
});

// 3
test('risk conflict: student comfortable, family not', () => {
  const a = align('quant-finance', family({ risk_tolerance: 'low' }), riskyStudent);
  const r = dim(a, 'risk');
  assert.equal(r.status, 'conflict');
  assert.equal(r.score, 20);
  assert.match(r.reason, /You're comfortable with the high risk/);
  assert.match(r.student, /high risk/);
  assert.match(r.family, /low/);
});

test('risk: low family income lowers effective comfort (reuses Module 2 rule)', () => {
  const a = align('embedded-iot', family({ risk_tolerance: 'moderate', income_band: 'lt3' }));
  assert.match(dim(a, 'risk').family, /adjusted for income/);
});

// 4
test('location conflict: family prefers staying close, career clusters in hubs', () => {
  const a = align('vlsi', family({ family_priorities: ['location_proximity'] }));
  const l = dim(a, 'location');
  assert.equal(l.status, 'conflict');
  assert.equal(l.family, 'Prefers staying close to home');
  assert.equal(dim(a, 'aspiration').status, 'unknown', 'location priority is not double-counted under career direction');
  // No location signal → unknown, not a guess.
  assert.equal(dim(align('vlsi', family()), 'location').status, 'unknown');
});

// 5
test('education conflict: family prefers earlier employment, path includes a PhD', () => {
  const a = align('research-academia', family());
  const e = dim(a, 'education');
  assert.equal(e.family, 'Prefers earlier employment');
  assert.equal(e.status, 'conflict');
  assert.match(e.reason, /delays employment/);
  // Family open to higher study (prestige) → aligned
  assert.equal(dim(align('research-academia', family({ family_priorities: ['prestige'] })), 'education').status, 'aligned');
});

// 6
test('multiple conflicts are each identified, ordered with reasons and positions', () => {
  const a = align('research-academia', family({ education_budget: 'lt2', loan_willingness: 'no', risk_tolerance: 'low', family_priorities: ['job_security', 'financial_stability', 'location_proximity'] }), riskyStudent);
  const conflictDims = a.conflicts.filter((d) => d.status === 'conflict').map((d) => d.dimension);
  for (const d of ['risk', 'location', 'education']) assert.ok(conflictDims.includes(d), d);
  for (const d of a.conflicts) {
    assert.ok(d.reason && d.severity && d.basis, d.dimension);
    assert.ok(['partial', 'conflict'].includes(d.status));
  }
  assert.ok(a.score < 60);
});

// 7
test('missing family information: those dimensions are unknown and excluded, result marked tentative', () => {
  const a = align('software-eng', family({ family_priorities: [] }));
  for (const id of ['aspiration', 'location', 'education']) assert.equal(dim(a, id).status, 'unknown', id);
  assert.equal(dim(a, 'aspiration').family, null);
  assert.equal(a.coverage, 0.45); // financial .25 + risk .20
  assert.equal(a.tentative, true);
  assert.equal(a.unknown.length, 4);
});

// 8
test('missing student preference: shown as not answered, never invented', () => {
  const blank = { branch: 'cse', interests: {}, aptitude: {}, preferences: {}, traits: {} };
  const a = align('quant-finance', family({ risk_tolerance: 'low' }), blank);
  const r = dim(a, 'risk');
  assert.equal(r.student, null);
  assert.equal(r.status, 'conflict', 'path vs family still evaluated');
  assert.doesNotMatch(r.reason, /You're comfortable/);
  assert.equal(dim(a, 'priorities').status, 'unknown');
});

// 9
test('alignment score is the renormalised weighted mean of known dimensions, reproducible', () => {
  const a = align('vlsi', family({ risk_tolerance: 'low', family_priorities: ['location_proximity', 'job_security'] }));
  const known = a.dimensions.filter((d) => d.score != null);
  const expected = Math.round(known.reduce((s, d) => s + WEIGHTS[d.dimension] * d.score, 0) / known.reduce((s, d) => s + WEIGHTS[d.dimension], 0));
  assert.equal(a.score, expected);
  assert.equal(a.category, CATEGORIES.find((c) => a.score >= c.min));
  assert.deepEqual(align('vlsi', family({ risk_tolerance: 'low', family_priorities: ['location_proximity', 'job_security'] })), a);
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((x, y) => x + y, 0) - 1) < 1e-9);
});

// 10
test('career-specific: the same family aligns differently with different careers', () => {
  const inputs = family({ risk_tolerance: 'low', family_priorities: ['job_security', 'financial_stability', 'location_proximity'] });
  const recs = [rec('software-eng', 80), rec('quant-finance', 90)];
  const [sw, qf] = E.alignShortlist({ recs, profile, inputs });
  assert.ok(sw.score > qf.score, `${sw.score} vs ${qf.score}`);
  assert.equal(dim(sw, 'risk').status, 'aligned');
  assert.equal(dim(qf, 'risk').status, 'conflict');
});

test('compromise paths: balanced path re-scored and preserves the goal; bridge only with real skill overlap', () => {
  const inputs = family({ family_priorities: ['job_security', 'financial_stability'] });
  const recs = [rec('ai-ml', 90), rec('data-science', 85)];
  const a = E.alignCareer({ careerId: 'ai-ml', rec: recs[0], recs, profile: riskyStudent, inputs });
  const direct = a.paths.find((p) => p.id === 'direct');
  const balanced = a.paths.find((p) => p.id === 'balanced');
  assert.ok(direct.pathway.chain.includes('M.Tech'));
  assert.ok(balanced && balanced.score > direct.score);
  assert.ok(balanced.solves.includes('Length of education'));
  assert.match(balanced.preserves[0], /Keeps AI \/ Machine Learning Engineering as the goal/);
  const bridge = a.paths.find((p) => p.id === 'bridge');
  if (bridge) {
    assert.equal(bridge.viaCareerId, 'data-science');
    assert.match(bridge.pathway.chain, /transition to AI \/ Machine Learning Engineering$/);
  }
  assert.ok(a.paths.some((p) => p.id === a.recommendedPathId));
});

test('market intelligence adds evidence but never changes the score', () => {
  const inputs = family({ risk_tolerance: 'low' });
  const market = { market: { demand: { level: 'high', trend: 'growing', summary: 'Hiring grows.', sources: [1] }, threats: [{ text: 'Entry-level competition is high.', sources: [2] }], regions: [], education_expectations: [] } };
  const without = align('quant-finance', inputs);
  const withM = E.alignCareer({ careerId: 'quant-finance', rec: rec('quant-finance'), profile, inputs, market });
  assert.equal(withM.score, without.score);
  assert.ok(dim(withM, 'risk').evidence.some((e) => /competition/.test(e.text) && e.sources[0] === 2));
});

// 11 + 12 + caching
test('Groq failure → deterministic fallback narrative, nothing stored', async () => {
  const a = align('research-academia', family());
  const r = await N.getAlignmentNarrative({ userId: uid, alignment: a, request: true, invokeFn: async () => { throw new Error('Groq down'); } });
  assert.equal(r.status, 'fallback');
  assert.match(r.narrative.summary, /^For Research & Academia/);
  assert.ok(r.narrative.recommendation_note);
  assert.ok(r.narrative.conversation_starters.length > 0);
  assert.equal((readDemoSnapshot()?.generated ?? []).length, 0);
});

test('invalid AI response is rejected; unknown paths/dimensions dropped; scores cannot be injected', async () => {
  const a = align('research-academia', family());
  const ctx = A.narrativeContext(a);
  assert.throws(() => A.validateNarrative('not json', ctx));
  assert.throws(() => A.validateNarrative({ summary: '', recommendation_note: 'x', difference_explanations: [], path_explanations: [], conversation_starters: [] }, ctx));
  assert.throws(() => A.validateNarrative({ summary: 'x', recommendation_note: 'y', difference_explanations: 'nope', path_explanations: [], conversation_starters: [] }, ctx));
  const v = A.validateNarrative({
    summary: 'S', why_it_matters: 'W', recommendation_note: 'R', score: 99, alignment: 99,
    difference_explanations: [{ dimension: 'education', explanation: 'E' }, { dimension: 'made_up', explanation: 'X' }],
    path_explanations: [{ path_id: 'direct', explanation: 'D' }, { path_id: 'ghost', explanation: 'G' }],
    conversation_starters: ['Q1', '', 'Q2'],
  }, ctx);
  assert.deepEqual(Object.keys(v.paths), ['direct']);
  assert.ok(!('made_up' in v.differences));
  assert.ok(!('score' in v) && !('alignment' in v), 'no score fields survive validation');
  assert.deepEqual(v.conversation_starters, ['Q1', 'Q2']);
  // Gateway call returning junk → fallback.
  const r = await N.getAlignmentNarrative({ userId: uid, alignment: a, request: true, invokeFn: async () => ({ narrative: { foo: 1 } }) });
  assert.equal(r.status, 'fallback');
});

test('schema given to Groq has no score fields and restricts ids to the analysis', () => {
  const ctx = A.narrativeContext(align('research-academia', family()));
  const schema = A.narrativeSchema(ctx);
  assert.ok(!JSON.stringify(schema).includes('"score"'));
  assert.deepEqual(schema.properties.path_explanations.items.properties.path_id.enum, ctx.paths.map((p) => p.id));
  assert.ok(!JSON.stringify(ctx).includes('budget') || !/₹\d/.test(JSON.stringify(ctx.differences.map((d) => d.family))), 'no raw family amounts');
  assert.equal(MODE_PROVIDERS.alignment, 'groq');
});

test('valid AI narrative is cached against the analysis and invalidated when it changes', async () => {
  const a = align('research-academia', family());
  const ok = { narrative: { summary: 'AI summary', why_it_matters: 'w', recommendation_note: 'AI note', difference_explanations: [], path_explanations: [], conversation_starters: ['Q'] }, model: 'openai/gpt-oss-120b' };
  let calls = 0;
  const invokeFn = async (b) => { calls++; assert.equal(b.mode, 'alignment'); return ok; };
  assert.equal((await N.getAlignmentNarrative({ userId: uid, alignment: a, request: true, invokeFn })).status, 'ai');
  const g = readDemoSnapshot().generated[0];
  assert.equal(g.kind, 'reasoning');
  assert.equal(g.content.type, 'alignment_narrative');
  const cached = await N.getAlignmentNarrative({ userId: uid, alignment: a, invokeFn });
  assert.equal(cached.status, 'cached');
  assert.equal(cached.narrative.summary, 'AI summary');
  assert.equal(calls, 1);
  const changed = align('research-academia', family({ risk_tolerance: 'low' }));
  assert.notEqual(N.hashContext(A.narrativeContext(changed)), N.hashContext(A.narrativeContext(a)));
  assert.equal((await N.getAlignmentNarrative({ userId: uid, alignment: changed, invokeFn })).status, 'fallback');
});

// End to end
test('end-to-end: profile → Career Fit → Feasibility → Market → Alignment → paths → recommendation', async () => {
  const prof = await db.saveProfile(uid, {
    full_name: 'Asha', branch: 'cse', year_of_study: 3, onboarded_at: 'x',
    interests: { int_data_ai: 5, int_software: 4, int_research: 4 }, aptitude: { apt_quant: 5, apt_programming: 4 },
    preferences: { pref_stability: 30, pref_study: 80 }, traits: { tr_risk: 4, tr_curiosity: 5 },
  });
  const recs = (await db.replaceRecommendations(uid, shortlist(rankCareers(prof)))).map(fromRow);
  const inputs = family({ income_band: '3to6', education_budget: '2to5', loan_willingness: 'maybe', risk_tolerance: 'low', family_priorities: ['job_security', 'financial_stability', 'location_proximity'] });
  const feas = evaluateAll(inputs, recs);
  await db.saveFeasibility(uid, inputs, feas, 'v');
  const market = { [recs[0].domainId]: { market: { demand: { level: 'high', trend: 'growing', summary: 'Demand grows.', sources: [1] }, threats: [], regions: [{ region: 'Bengaluru', scope: 'india', text: 'x', sources: [1] }], education_expectations: [] } } };

  const results = E.alignShortlist({ recs, profile: prof, inputs, marketById: market });
  assert.equal(results.length, recs.length);
  for (const a of results) {
    assert.ok(a.score >= 0 && a.score <= 100);
    assert.equal(a.dimensions.length, 6);
    assert.ok(a.paths.length >= 1 && a.paths.some((p) => p.id === a.recommendedPathId));
  }
  const top = results[0];
  const n = await N.getAlignmentNarrative({ userId: uid, alignment: top });
  assert.ok(n.narrative.summary && n.narrative.recommendation_note);
  // Authoritative data untouched.
  assert.deepEqual((await db.getRecommendations(uid)).map((r) => Number(r.score)), recs.map((r) => r.score));
  assert.deepEqual(evaluateAll(inputs, recs), feas);
});
