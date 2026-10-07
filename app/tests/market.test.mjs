import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
console.warn = () => {};

const M = await import('../supabase/functions/career-ai/market.js');
const { MODE_PROVIDERS, checkMode, requireUser } = await import('../supabase/functions/career-ai/gateway.js');
const { getMarketIntelligence, buildMarketContext } = await import('../src/lib/marketIntelligence.js');
const { DEMO_USER_ID, resetDemo, readDemoSnapshot } = await import('../src/lib/demoDb.js');

const NOW = new Date('2026-10-07T10:00:00Z');
const context = {
  career: { id: 'data-science', name: 'Data Scientist', summary: 'Turn data into decisions.' },
  student: { name: 'Asha Rao', branch: 'Computer Science', year: 2, location: 'India' },
  skills: ['Python', 'SQL'],
  feasibility: { income_band: 'lt3', score: 40 },
  career_fit: { score: 88 },
};

// What Groq's browser_search response might contain (shape deliberately nested).
const executedTools = [{
  type: 'browser.search',
  arguments: '{"query":"data scientist jobs India 2026"}',
  search_results: { results: [
    { title: 'India Tech Jobs Report 2026', url: 'https://www.naukri.com/reports/tech-2026', content: 'Data science hiring up 18%', published_date: '2026-08-01' },
    { title: 'AmbitionBox Data Scientist Salaries', url: 'https://www.ambitionbox.com/data-scientist-salary', content: '₹6–12 LPA entry level' },
  ] },
  output: 'Also see https://www.nasscom.in/knowledge-center/ai-talent-2026 for AI talent demand.',
}];

const validStructured = {
  career: 'Data Scientist',
  market: {
    demand: { level: 'high', summary: 'Hiring for data scientists in India grew about 18% year on year.', source_ids: [1] },
    salary: {
      currency: 'INR', region: 'India',
      entry_level: { range: '₹6–12 LPA', source_ids: [2] },
      mid_level: { range: '₹15–25 LPA', source_ids: [2] },
      senior_level: { range: '', source_ids: [] },
    },
    regions: [{ text: 'Bengaluru, Hyderabad and Pune lead hiring.', source_ids: [1] }],
    core_skills: [{ text: 'Python, SQL and statistics are expected.', source_ids: [1, 2] }],
    emerging_skills: [{ text: 'LLM application development is in demand.', source_ids: [3] }],
    education_expectations: [{ text: 'Unsourced claim that should be dropped.', source_ids: [] }],
    industry_trends: [{ text: 'GenAI adoption is reshaping analytics roles.', source_ids: [99] }],
    opportunities: [],
    threats: [{ text: 'Entry-level competition is intensifying.', source_ids: [1] }],
  },
  evidence_used: [{ id: 1, publisher: 'Naukri', published_at: '2026-08-01' }],
  confidence: 90,
  limitations: 'Salary data varies by city.',
};

/** Fake Groq: first call = research (with tools), second = structuring. */
function fakeGroq({ research, structured, status = 200, throwOn } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    if (throwOn === calls.length) throw new Error('network down');
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const message = body.tools
      ? { content: 'Research notes…', executed_tools: research ?? executedTools }
      : { content: typeof structured === 'string' ? structured : JSON.stringify(structured ?? validStructured) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) };
  };
  return { fetchImpl, calls };
}

const run = (opts = {}, ctx = context) => M.researchMarket(ctx, { apiKey: 'test-key', now: NOW, ...opts });

// ------------------------------------------------------------ 1. valid response
test('valid research: structured, source-backed, timestamped record', async () => {
  const { fetchImpl, calls } = fakeGroq();
  const r = await run({ fetchImpl });
  assert.equal(r.career, 'Data Scientist');
  assert.equal(r.market.demand.level, 'high');
  assert.deepEqual(r.market.salary.entry_level, { range: '₹6–12 LPA', sources: [2] });
  assert.equal(r.market.salary.senior_level, null, 'unsourced/empty band becomes null');
  assert.equal(r.researched_at, NOW.toISOString());
  assert.equal(r.expires_at, new Date(NOW.getTime() + 7 * 86400000).toISOString());
  assert.equal(r.provider, 'groq');
  assert.ok(M.isValidMarketRecord(r));
  // Sources come only from executed search results, each with access timestamp.
  assert.deepEqual(r.sources.map((s) => s.url).sort(), [
    'https://www.ambitionbox.com/data-scientist-salary',
    'https://www.nasscom.in/knowledge-center/ai-talent-2026',
    'https://www.naukri.com/reports/tech-2026',
  ]);
  assert.ok(r.sources.every((s) => s.accessed_at === NOW.toISOString()));
  assert.equal(r.sources.find((s) => s.id === 1).published_at, '2026-08-01');
  // Two-stage protocol: browser_search, then strict json_schema without tools.
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.tools, [{ type: 'browser_search' }]);
  assert.equal(calls[0].body.model, 'openai/gpt-oss-120b');
  assert.equal(calls[1].body.tools, undefined);
  assert.equal(calls[1].body.response_format.json_schema.strict, true);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
});

test('unsourced and fabricated-source claims are dropped; confidence capped by evidence', async () => {
  const { fetchImpl } = fakeGroq();
  const r = await run({ fetchImpl });
  assert.deepEqual(r.market.education_expectations, [], 'claim with no source dropped');
  assert.deepEqual(r.market.industry_trends, [], 'claim citing non-existent source 99 dropped');
  assert.ok(r.confidence <= 30 + 15 * r.sources.length);
  const one = await run({ fetchImpl: fakeGroq({ structured: { ...validStructured, market: { ...validStructured.market,
    emerging_skills: [], core_skills: [], salary: { ...validStructured.market.salary, entry_level: { range: '', source_ids: [] }, mid_level: { range: '', source_ids: [] } } } } }).fetchImpl });
  assert.equal(one.sources.length, 1);
  assert.equal(one.confidence, 45, '90 proposed, capped at 30 + 15×1');
});

test('only minimal student context reaches Groq (no name, scores or finances)', async () => {
  const { fetchImpl, calls } = fakeGroq();
  await run({ fetchImpl });
  const sent = JSON.stringify(calls.map((c) => c.body.messages));
  assert.ok(!sent.includes('Asha'), 'name not sent');
  assert.ok(!sent.includes('lt3') && !sent.includes('"score"'), 'feasibility/career-fit not sent');
  assert.ok(sent.includes('Computer Science') && sent.includes('Python'));
});

// ------------------------------------------------------------ 2. invalid JSON
test('invalid model JSON is rejected, not repaired or invented', async () => {
  await assert.rejects(run({ fetchImpl: fakeGroq({ structured: 'Here is the data: {broken' }).fetchImpl }),
    (e) => e instanceof M.MarketResearchError && e.code === 'invalid_output' && e.message === M.UNAVAILABLE_MESSAGE);
});

// ------------------------------------------------------------ 3. missing fields
test('missing required fields are rejected', async () => {
  const cases = [
    { ...validStructured, career: '' },
    { ...validStructured, market: undefined },
    { ...validStructured, market: { ...validStructured.market, regions: 'Bengaluru' } },
    { ...validStructured, market: { ...validStructured.market, demand: { level: 'skyrocketing', summary: 'x', source_ids: [1] } } },
    { ...validStructured, market: { ...validStructured.market, salary: undefined } },
  ];
  for (const structured of cases) {
    await assert.rejects(run({ fetchImpl: fakeGroq({ structured }).fetchImpl }), (e) => e.code === 'invalid_output');
  }
});

test('oversized model output is rejected', async () => {
  const huge = { ...validStructured, limitations: 'x'.repeat(70000) };
  await assert.rejects(run({ fetchImpl: fakeGroq({ structured: huge }).fetchImpl }), (e) => e.code === 'invalid_output');
});

// ------------------------------------------------------------ 4. invalid confidence
test('invalid confidence is rejected', async () => {
  for (const confidence of [150, -1, 55.5, 'high', null]) {
    await assert.rejects(run({ fetchImpl: fakeGroq({ structured: { ...validStructured, confidence } }).fetchImpl }), (e) => e.code === 'invalid_output');
  }
});

// ------------------------------------------------------------ 5. Groq failures
test('Groq API failures become a controlled "unavailable" error', async () => {
  await assert.rejects(run({ fetchImpl: fakeGroq({ status: 500 }).fetchImpl }), (e) => e.code === 'upstream' && e.message === M.UNAVAILABLE_MESSAGE);
  await assert.rejects(run({ fetchImpl: fakeGroq({ status: 429 }).fetchImpl }), (e) => e.code === 'upstream');
  await assert.rejects(run({ fetchImpl: fakeGroq({ throwOn: 1 }).fetchImpl }), (e) => e.code === 'upstream');
  await assert.rejects(run({ fetchImpl: fakeGroq({ throwOn: 2 }).fetchImpl }), (e) => e.code === 'upstream');
  await assert.rejects(run({ apiKey: '' }), (e) => e.code === 'not_configured');
});

test('no search evidence → fails instead of answering from model memory', async () => {
  const { fetchImpl, calls } = fakeGroq({ research: [] });
  await assert.rejects(run({ fetchImpl }), (e) => e.code === 'no_evidence');
  assert.equal(calls.length, 1, 'structuring stage never runs without evidence');
  // All claims citing nothing real → no_evidence too.
  const allBad = { ...validStructured, market: { ...validStructured.market,
    demand: { level: 'high', summary: 'x', source_ids: [42] },
    salary: { currency: '', region: '', entry_level: { range: '1', source_ids: [] }, mid_level: { range: '', source_ids: [] }, senior_level: { range: '', source_ids: [] } },
    regions: [], core_skills: [], emerging_skills: [], education_expectations: [], industry_trends: [], opportunities: [], threats: [] } };
  await assert.rejects(run({ fetchImpl: fakeGroq({ structured: allBad }).fetchImpl }), (e) => e.code === 'no_evidence');
});

test('bad request: missing career name', async () => {
  await assert.rejects(run({ fetchImpl: fakeGroq().fetchImpl }, { career: {} }), (e) => e.code === 'bad_request');
});

test('evidence extraction ignores private/local URLs and model-text URLs', () => {
  const ev = M.extractEvidence({
    content: 'See https://made-up.example.com/report',
    executed_tools: [{ output: 'http://localhost:3000/x https://192.168.1.4/y https://real.org/page.' }],
  });
  assert.deepEqual(ev.map((e) => e.url), ['https://real.org/page']);
});

// ------------------------------------------------------------ 6. gateway routing unchanged
test('existing modes still route to Gemini; market_research to Groq; keys checked per mode', () => {
  assert.deepEqual(
    Object.fromEntries(['explain', 'chat', 'project', 'evaluate'].map((m) => [m, MODE_PROVIDERS[m]])),
    { explain: 'gemini', chat: 'gemini', project: 'gemini', evaluate: 'gemini' }
  );
  assert.equal(MODE_PROVIDERS.market_research, 'groq');
  assert.equal(checkMode('explain', { GEMINI_API_KEY: 'g' }), null);
  assert.equal(checkMode('market_research', { GEMINI_API_KEY: 'g' }).status, 503, 'Groq mode needs GROQ key');
  assert.equal(checkMode('market_research', { GROQ_API_KEY: 'q' }), null, 'Groq works without Gemini key');
  assert.equal(checkMode('explain', { GROQ_API_KEY: 'q' }).status, 500, 'Gemini modes still need Gemini key');
  assert.equal(checkMode('nope', {}).status, 400);
});

// ------------------------------------------------------------ client abstraction
test('client: caches validated research as a generated output, reuses it while fresh', async () => {
  resetDemo();
  const record = await run({ fetchImpl: fakeGroq().fetchImpl });
  let calls = 0;
  const invokeFn = async (body) => { calls++; assert.equal(body.mode, 'market_research'); return { research: record }; };
  const ctx = buildMarketContext('data-science', { branch: 'cse', year_of_study: 2 }, { skills: ['Python'] });
  assert.equal(ctx.student.branch, 'Computer Science / IT');

  const a = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'data-science', context: ctx, invokeFn, now: NOW });
  assert.equal(a.status, 'ok'); assert.equal(a.cached, false);
  const row = readDemoSnapshot().generated.find((g) => g.kind === 'market_insight');
  assert.equal(row.subject_key, 'data-science');
  assert.equal(row.generator, 'groq');
  assert.ok(row.confidence >= 0 && row.confidence <= 1);

  const b = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'data-science', context: ctx, invokeFn, now: NOW });
  assert.equal(b.cached, true); assert.equal(calls, 1);

  const later = new Date(NOW.getTime() + 8 * 86400000);
  const c = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'data-science', context: ctx, invokeFn, now: later });
  assert.equal(c.cached, false); assert.equal(calls, 2, 'stale cache triggers new research');
});

test('client: failure → "unavailable", never fabricated; invalid gateway data rejected', async () => {
  resetDemo();
  const failing = async () => { throw new Error('Edge Function returned a non-2xx status code'); };
  const r = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'ai-ml', context: {}, invokeFn: failing, now: NOW });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.message, 'Market intelligence temporarily unavailable.');
  assert.equal(r.record, undefined);
  const junk = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'ai-ml', context: {}, invokeFn: async () => ({ research: { career: 'x', confidence: 500 } }), now: NOW });
  assert.equal(junk.status, 'unavailable');
  assert.equal((readDemoSnapshot().generated ?? []).length, 0, 'nothing stored on failure');
});

test('client: demo mode (no Supabase) is a clean "unavailable"', async () => {
  resetDemo();
  const r = await getMarketIntelligence({ userId: DEMO_USER_ID, careerId: 'vlsi', context: {}, now: NOW });
  assert.equal(r.status, 'unavailable');
  assert.match(r.reason, /Demo mode/);
});

// ------------------------------------------------------------ gateway auth
test('gateway requires a real signed-in user, not just the public key', async () => {
  const seen = [];
  const authFetch = async (url, init) => {
    seen.push({ url, init });
    const token = init.headers.Authorization.slice(7);
    return token === 'user-jwt'
      ? { ok: true, json: async () => ({ id: 'user-123' }) }
      : { ok: false, status: 401, json: async () => ({ msg: 'invalid JWT' }) };
  };
  const opts = { supabaseUrl: 'https://p.supabase.co', apiKey: 'sb_publishable_x', fetchImpl: authFetch };
  assert.equal(await requireUser('Bearer user-jwt', opts), 'user-123');
  assert.equal(seen[0].url, 'https://p.supabase.co/auth/v1/user');
  assert.equal(await requireUser('Bearer sb_publishable_x', opts), null, 'publishable key is not a user');
  assert.equal(await requireUser(null, opts), null);
  assert.equal(await requireUser('Basic abc', opts), null);
  assert.equal(await requireUser('Bearer user-jwt', { ...opts, fetchImpl: async () => { throw new Error('down'); } }), null);
});

test('Groq error message is surfaced as a short diagnostic, never the key', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'tool_choice is invalid for this model' } }) });
  await assert.rejects(run({ fetchImpl }), (e) => e.code === 'upstream' && e.detail === 'Groq HTTP 400: tool_choice is invalid for this model' && !e.detail.includes('test-key'));
});
