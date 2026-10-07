import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.fetch = async () => ({ ok: false, status: 404 }); // GitHub API in project flow
console.warn = () => {};
console.info = () => {};

const M = await import('../supabase/functions/career-ai/market.js');
const I = await import('../src/lib/marketInsights.js');
const { getMarketIntelligence, getCachedMarketIntelligence, buildMarketContext } = await import('../src/lib/marketIntelligence.js');
const db = await import('../src/lib/db.js');
const { DEMO_USER_ID, resetDemo, readDemoSnapshot } = await import('../src/lib/demoDb.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
const { fromRow } = await import('../src/lib/ai.js');
const { evaluateAll } = await import('../src/lib/feasibility/scoring.js');
const { deriveProgress } = await import('../src/lib/development/learning.js');
const { completeModuleFlow } = await import('../src/lib/development/service.js');

const uid = DEMO_USER_ID;
const NOW = new Date('2026-10-07T10:00:00Z');
beforeEach(() => resetDemo());

// A validated v2 record produced through the real pipeline with a fake Groq.
async function makeRecord(careerName = 'Data Science & Analytics', now = NOW) {
  const evidence = [{ title: 'Jobs report', url: 'https://www.naukri.com/r', content: 'x' }, { title: 'Salary survey', url: 'https://www.ambitionbox.com/s', content: 'y' }];
  const structured = {
    career: careerName,
    market: {
      demand: { level: 'high', trend: 'growing', summary: 'Demand is growing.', source_ids: [1] },
      salary: { currency: 'INR', region: 'India', entry_level: { range: '₹6–12 LPA', source_ids: [2] }, mid_level: { range: '', source_ids: [] }, senior_level: { range: '', source_ids: [] } },
      regions: [{ region: 'Bengaluru', scope: 'india', text: 'Bengaluru leads.', source_ids: [1] }],
      core_skills: [
        { skill: 'Python', text: 'Python is expected.', source_ids: [1] },
        { skill: 'SQL', text: 'SQL is a baseline.', source_ids: [1] },
        { skill: 'Machine Learning', text: 'ML is required.', source_ids: [1] },
      ],
      tools: [{ skill: 'Docker', text: 'Docker is common.', source_ids: [1] }],
      emerging_skills: [{ skill: 'Generative AI', text: 'GenAI is rising.', source_ids: [1] }],
      education_expectations: [{ text: 'A bachelor’s in a quantitative field is typical.', source_ids: [1] }],
      alternative_pathways: [], exams_certifications: [],
      industries_hiring: [{ text: 'BFSI hires heavily.', source_ids: [1] }],
      industry_trends: [], opportunities: [{ text: 'Analytics roles in fintech are expanding.', source_ids: [1] }],
      threats: [{ text: 'Entry-level competition is high.', source_ids: [2] }],
    },
    evidence_used: [], confidence: 70, limitations: '',
  };
  const fetchImpl = async (_u, init) => {
    const body = JSON.parse(init.body);
    const message = body.tools
      ? { content: 'notes', executed_tools: [{ search_results: { results: evidence } }] }
      : { content: JSON.stringify(structured) };
    return { ok: true, json: async () => ({ choices: [{ message }] }) };
  };
  return M.researchMarket({ career: { name: careerName } }, { apiKey: 'k', fetchImpl, now });
}

// ---------------------------------------------------------------- caching / freshness
test('valid cached data is reused without calling the gateway', async () => {
  const record = await makeRecord();
  let calls = 0;
  const invokeFn = async () => { calls++; return { research: record }; };
  await getMarketIntelligence({ userId: uid, careerId: 'data-science', context: {}, invokeFn, now: NOW });
  const cached = await getCachedMarketIntelligence(uid, 'data-science', NOW);
  assert.equal(cached.fresh, true);
  assert.equal(cached.record.career, 'Data Science & Analytics');
  const again = await getMarketIntelligence({ userId: uid, careerId: 'data-science', context: {}, invokeFn, now: NOW });
  assert.equal(again.cached, true);
  assert.equal(calls, 1);
  assert.match(I.freshness(record, NOW).label, /^Research updated today/);
});

test('expired cached data is flagged and triggers new research; old data is never shown as current', async () => {
  const record = await makeRecord();
  await db.saveGeneratedOutput(uid, { kind: 'market_insight', subject_type: 'career', subject_key: 'data-science', content: record, generator: 'groq', expires_at: record.expires_at });
  const later = new Date(NOW.getTime() + (I.MARKET_INTELLIGENCE_TTL_DAYS + 1) * 86_400_000);
  const cached = await getCachedMarketIntelligence(uid, 'data-science', later);
  assert.equal(cached.fresh, false);
  assert.match(I.freshness(record, later).label, /may be outdated/);
  // Refresh fails → unavailable + the stale record clearly separated, not passed off as current.
  const r = await getMarketIntelligence({ userId: uid, careerId: 'data-science', context: {}, invokeFn: async () => { throw new Error('Groq down'); }, now: later });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.message, 'Market intelligence temporarily unavailable.');
  assert.equal(r.record, undefined);
  assert.equal(r.stale.career, 'Data Science & Analytics');
});

test('older-shape (v1) cached records are treated as absent', async () => {
  const record = await makeRecord();
  const v1 = { ...record, schema_version: undefined };
  await db.saveGeneratedOutput(uid, { kind: 'market_insight', subject_type: 'career', subject_key: 'ai-ml', content: v1, generator: 'groq', expires_at: record.expires_at });
  assert.equal(await getCachedMarketIntelligence(uid, 'ai-ml', NOW), null);
});

test('TTL is a single configurable value used for expiry', async () => {
  assert.equal(I.MARKET_INTELLIGENCE_TTL_DAYS, M.MARKET_CONFIG.ttlDays);
  const r = await makeRecord();
  assert.equal(new Date(r.expires_at) - new Date(r.researched_at), M.MARKET_CONFIG.ttlDays * 86_400_000);
});

// ---------------------------------------------------------------- skill gap
test('skill matching normalises names and synonyms without false positives', () => {
  assert.ok(I.skillMatches('Machine Learning', 'machine learning'));
  assert.ok(I.skillMatches('ML', 'Machine Learning'));
  assert.ok(I.skillMatches('SQL joins', 'SQL'));
  assert.ok(I.skillMatches('LLM Engineering', 'LLMs'));
  assert.ok(!I.skillMatches('Java', 'JavaScript'));
  assert.ok(!I.skillMatches('R', 'React'));
});

test('skill gap: demonstrated vs learned vs missing, with learning suggestions', async () => {
  const record = await makeRecord();
  const gap = I.marketSkillGap(record, { demonstrated: ['Python'], learned: ['Python', 'SQL joins', 'Relational data'] }, 'data-science');
  const by = Object.fromEntries(gap.items.map((i) => [i.skill, i]));
  assert.equal(by.Python.status, 'demonstrated');
  assert.equal(by.SQL.status, 'learned', 'completed a SQL module but never passed a project → learned, not demonstrated');
  assert.equal(by['Machine Learning'].status, 'missing');
  assert.equal(by.Docker.category, 'tool');
  assert.equal(by['Generative AI'].category, 'emerging');
  assert.deepEqual(gap.counts, { demonstrated: 1, learned: 1, missing: 3 });
  assert.equal(gap.coreReadiness, 33);
  assert.equal(by.Python.courses.length, 0, 'no suggestions for demonstrated skills');
  assert.ok(by['Machine Learning'].courses.some((c) => c.courseId === 'ml-foundations'), 'missing skill mapped to a catalog course');
  assert.ok(by['Machine Learning'].courses[0].relevant, 'courses tagged for the career come first');
  // Module 3 boundary
  const targets = I.marketSkillTargets(gap);
  assert.deepEqual(targets.map((t) => t.skill), ['SQL', 'Machine Learning', 'Docker', 'Generative AI']);
});

test('demonstrated skills come only from project evaluation, never from course completion', async () => {
  // Real Module 3 flow in demo mode: complete a module (learned) but no passed project.
  const dev0 = await db.getDevelopment(uid);
  await completeModuleFlow({ userId: uid, careerId: 'data-science', courseId: 'sql-analytics', moduleId: 'sql-joins', dev: dev0 });
  const progress = deriveProgress(await db.getDevelopment(uid));
  assert.ok(progress.learnedSkills.includes('SQL joins'));
  assert.deepEqual(progress.demonstratedSkills, []);
  const gap = I.marketSkillGap(await makeRecord(), { demonstrated: progress.demonstratedSkills, learned: progress.learnedSkills }, 'data-science');
  assert.equal(gap.items.find((i) => i.skill === 'SQL').status, 'learned');
  assert.equal(gap.counts.demonstrated, 0);
});

// ---------------------------------------------------------------- personalization
test('personal summary and opportunities/threats are grounded in data, with stated basis', async () => {
  const record = await makeRecord();
  const gap = I.marketSkillGap(record, { demonstrated: ['Python'], learned: ['SQL'] }, 'data-science');
  const summary = I.personalSummary(record, gap, { fit: 82 });
  assert.match(summary, /strong demand and growing/);
  assert.match(summary, /demonstrated Python/);
  assert.match(summary, /studied SQL but haven't proven it/);
  assert.match(summary, /largest gap is Machine Learning/);
  assert.match(summary, /Career Fit for this path is 82%/);

  const feas = { score: 45, category: 'barrier', factors: { education: { status: 'warn' }, financial: { status: 'bad' } } };
  const { opportunities, threats } = I.personalOpportunitiesThreats(record, gap, { fit: 82, feasibility: feas, inputs: { relocation: 'no' } });
  assert.ok(opportunities.some((o) => o.basis === 'market' && o.sources.length));
  assert.ok(opportunities.some((o) => /demonstrated Python/.test(o.text) && o.basis === 'your demonstrated skills'));
  assert.ok(opportunities.some((o) => /strong personal fit \(82%\)/.test(o.text)));
  assert.ok(threats.some((t) => /core skills? not yet demonstrated/.test(t.text) && t.sources.length));
  assert.ok(threats.some((t) => /Bengaluru; you prefer not to relocate/.test(t.text)));
  assert.ok(threats.some((t) => /exceed your current budget/.test(t.text) && t.basis === 'your Feasibility check'));
  for (const x of [...opportunities, ...threats]) assert.ok(x.basis, 'every item states its basis');
});

// ---------------------------------------------------------------- comparison
test('comparison reads Fit and Feasibility from Praxio engines, demand only from research', async () => {
  const recs = [{ domainId: 'data-science', score: 86.4 }, { domainId: 'ai-ml', score: 82 }];
  const feasibilityById = { 'data-science': { score: 78, category: 'high' } };
  const marketById = { 'data-science': await makeRecord() };
  const rows = I.compareCareers(recs, { feasibilityById, marketById, now: NOW });
  assert.deepEqual(rows.map((r) => [r.careerId, r.fit, r.feasibility, r.demand]), [
    ['data-science', 86, 78, 'high'],
    ['ai-ml', 82, null, null],
  ]);
  assert.equal(rows[0].fresh, true);
  assert.equal(rows[0].feasibilityCategory.label, 'Highly Feasible');
});

// ---------------------------------------------------------------- full flow
test('end-to-end: profile → Career Fit → Feasibility → research → save → gap → comparison', async () => {
  // 1-2. Existing student profile + deterministic Career Fit
  const profile = await db.saveProfile(uid, {
    full_name: 'Asha', branch: 'cse', year_of_study: 3, onboarded_at: 'x',
    interests: { int_data_ai: 5, int_software: 4 }, aptitude: { apt_quant: 5, apt_programming: 4, apt_logical: 4 },
    preferences: { pref_coding: 70 }, traits: { tr_curiosity: 5 },
  });
  const recs = (await db.replaceRecommendations(uid, shortlist(rankCareers(profile)))).map(fromRow);
  const fitBefore = recs.map((r) => r.score);
  // 3. Deterministic Feasibility
  const inputs = { income_band: '6to10', education_budget: '5to10', loan_willingness: 'maybe', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [] };
  await db.saveFeasibility(uid, inputs, evaluateAll(inputs, recs), 'v');
  const feas = Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r]));
  // 4-5. Shortlist → pick a researched career
  const career = recs.find((r) => r.domainId === 'data-science') ?? recs[0];
  // 6-8. Research via the gateway contract, validate, save
  const context = buildMarketContext(career.domainId, profile, { skills: [] });
  assert.equal(context.student.branch, 'Computer Science / IT');
  const record = await makeRecord(context.career.name);
  const res = await getMarketIntelligence({ userId: uid, careerId: career.domainId, context, invokeFn: async (b) => { assert.equal(b.mode, 'market_research'); return { research: record }; }, now: NOW });
  assert.equal(res.status, 'ok');
  const stored = readDemoSnapshot().generated.find((g) => g.kind === 'market_insight');
  assert.equal(stored.subject_key, career.domainId);
  assert.ok(stored.sources.length > 0);
  // 9-10. Display data + personalised gap (from cache)
  const cached = await getCachedMarketIntelligence(uid, career.domainId, NOW);
  const gap = I.marketSkillGap(cached.record, { demonstrated: [], learned: [] }, career.domainId);
  assert.ok(gap.items.length > 0);
  // 11. Comparison
  const rows = I.compareCareers(recs, { feasibilityById: feas, marketById: { [career.domainId]: cached.record }, now: NOW });
  const row = rows.find((r) => r.careerId === career.domainId);
  assert.equal(row.fit, Math.round(career.score));
  assert.equal(row.feasibility, feas[career.domainId].score);
  assert.equal(row.demand, 'high');
  // 12. Sources + freshness
  assert.ok(cached.record.sources.every((s) => s.url.startsWith('https://') && s.accessed_at));
  assert.equal(cached.fresh, true);
  // Authoritative data untouched
  const recsAfter = (await db.getRecommendations(uid)).map(fromRow);
  assert.deepEqual(recsAfter.map((r) => r.score), fitBefore);
  assert.ok(readDemoSnapshot().recommendations.every((r) => !('market' in r)));
});
