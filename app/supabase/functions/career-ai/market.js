// Market intelligence research via Groq (used by the career-ai gateway).
//
// Plain ES module with no Deno or browser APIs, so the same code runs in the edge function,
// is reused by the client for re-validation, and is unit-tested under Node.
//
// Two stages, because Groq's built-in browser search cannot be combined with strict
// structured outputs:
//   1. RESEARCH: gpt-oss + browser_search → research notes + executed search results.
//   2. STRUCTURE: gpt-oss + strict json_schema (no tools) → claims that cite evidence ids.
// Source URLs come ONLY from the search tool's executed results (never from model text),
// and every claim must cite at least one of them or it is dropped. With no verifiable
// evidence the request fails; nothing is invented as a fallback.

export const MARKET_CONFIG = {
  model: 'openai/gpt-oss-120b',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  ttlDays: 7,                 // MARKET_INTELLIGENCE_TTL_DAYS: researched data counts as fresh for this long
  schemaVersion: 'market-v2', // bump when the record shape changes; older cached records are re-researched
  researchTimeoutMs: 90_000,
  structureTimeoutMs: 45_000,
  maxEvidence: 20,
  maxNotesChars: 12_000,
  maxOutputChars: 60_000,     // reject absurdly large model JSON
  maxItemsPerList: 10,
  maxClaimChars: 300,
};

export const DEMAND_LEVELS = ['very_high', 'high', 'moderate', 'low', 'mixed', 'unknown'];
export const DEMAND_TRENDS = ['growing', 'stable', 'declining', 'mixed', 'unknown'];
export const REGION_SCOPES = ['india', 'global', 'remote'];
// Plain sourced claims: { text, sources }
export const CLAIM_FIELDS = [
  'education_expectations', 'alternative_pathways', 'exams_certifications',
  'industries_hiring', 'industry_trends', 'opportunities', 'threats',
];
// Named skills: { skill, text, sources } — skill is a short name used for gap analysis
export const SKILL_FIELDS = ['core_skills', 'tools', 'emerging_skills'];
// Every array field in market (regions are { region, scope, text, sources })
export const LIST_FIELDS = ['regions', ...SKILL_FIELDS, ...CLAIM_FIELDS];
export const UNAVAILABLE_MESSAGE = 'Market intelligence temporarily unavailable.';

export class MarketResearchError extends Error {
  constructor(code, detail) {
    super(UNAVAILABLE_MESSAGE);
    this.code = code; // not_configured | bad_request | upstream | timeout | no_evidence | invalid_output
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- context
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Whitelist the minimum context research needs. Names, answers, scores and family
 * finances are deliberately not forwarded to the model, whatever the client sends.
 */
export function sanitiseContext(context) {
  const career = context?.career ?? {};
  const out = {
    career: { id: str(career.id, 60), name: str(career.name, 120), summary: str(career.summary, 400) },
    student: {
      branch: str(context?.student?.branch, 80) || null,
      year: Number.isInteger(context?.student?.year) && context.student.year > 0 && context.student.year < 8 ? context.student.year : null,
      location: str(context?.student?.location, 80) || 'India',
    },
    skills: (Array.isArray(context?.skills) ? context.skills : []).map((s) => str(s, 60)).filter(Boolean).slice(0, 30),
  };
  if (!out.career.name) throw new MarketResearchError('bad_request', 'context.career.name is required');
  return out;
}

// ---------------------------------------------------------------- prompts
const RESEARCH_SYSTEM = `You are a labour-market research assistant for engineering students.
Use browser search to find CURRENT (prefer the last 12-18 months), reputable information: industry reports, government/statistics bodies, major job boards' published data, established salary surveys, recognised news outlets.
Report only what you found in sources, noting which source supports each point. If something cannot be found, say so explicitly. Do not estimate or invent figures.`;

export function researchPrompt(ctx) {
  const where = ctx.student.location;
  return [
    `Research the current job market for the career "${ctx.career.name}"${ctx.career.summary ? ` (${ctx.career.summary})` : ''}, focusing on ${where} and noting global context where relevant.`,
    ctx.student.branch ? `The student studies ${ctx.student.branch}${ctx.student.year ? `, year ${ctx.student.year}` : ''}.` : '',
    ctx.skills.length ? `Skills the student has demonstrated: ${ctx.skills.join(', ')}.` : '',
    'Find: (1) current demand, hiring outlook and whether demand is growing or declining, (2) salary ranges for entry, mid and senior levels with currency,',
    '(3) cities/regions with the most opportunity in India, global markets, and remote-work availability, (4) core required skills and commonly requested tools/technologies,',
    '(5) emerging skills, (6) education expectations, alternative (non-degree) pathways, and important exams or certifications if genuinely relevant,',
    '(7) industries hiring, (8) industry trends, (9) opportunities, (10) threats or risks (e.g. automation, saturation, competition).',
    'For every finding, mention the source it came from.',
  ].filter(Boolean).join('\n');
}

const STRUCTURE_SYSTEM = `You convert labour-market research notes into a strict JSON record.
Rules:
- Use ONLY information present in the research notes and evidence list. Do not add knowledge of your own.
- Every claim must cite the evidence ids (the numbers in the evidence list) that support it in "source_ids".
- If a value is not supported by the evidence, use an empty string / empty list and leave source_ids empty. Never guess salaries.
- Keep each claim to one concise sentence. For skills and tools, "skill" is a short canonical name (e.g. "Python", "SQL", "Docker"), one per item.
- regions: "scope" is "india" for Indian cities/regions, "global" for other countries, "remote" for remote-work availability.
- confidence (0-100) reflects how well-sourced, recent and consistent the evidence is.`;

const ids = { type: 'array', items: { type: 'integer' } };
const claim = { type: 'object', additionalProperties: false, required: ['text', 'source_ids'],
  properties: { text: { type: 'string' }, source_ids: ids } };
const skillClaim = { type: 'object', additionalProperties: false, required: ['skill', 'text', 'source_ids'],
  properties: { skill: { type: 'string' }, text: { type: 'string' }, source_ids: ids } };
const regionClaim = { type: 'object', additionalProperties: false, required: ['region', 'scope', 'text', 'source_ids'],
  properties: { region: { type: 'string' }, scope: { type: 'string', enum: REGION_SCOPES }, text: { type: 'string' }, source_ids: ids } };
const band = { type: 'object', additionalProperties: false, required: ['range', 'source_ids'],
  properties: { range: { type: 'string' }, source_ids: { type: 'array', items: { type: 'integer' } } } };

/** JSON schema for the structuring stage (Groq strict mode: all fields required, no extras). */
export const STRUCTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['career', 'market', 'evidence_used', 'confidence', 'limitations'],
  properties: {
    career: { type: 'string' },
    market: {
      type: 'object',
      additionalProperties: false,
      required: ['demand', 'salary', ...LIST_FIELDS],
      properties: {
        demand: { type: 'object', additionalProperties: false, required: ['level', 'trend', 'summary', 'source_ids'],
          properties: { level: { type: 'string', enum: DEMAND_LEVELS }, trend: { type: 'string', enum: DEMAND_TRENDS }, summary: { type: 'string' }, source_ids: ids } },
        salary: { type: 'object', additionalProperties: false, required: ['currency', 'region', 'entry_level', 'mid_level', 'senior_level'],
          properties: { currency: { type: 'string' }, region: { type: 'string' }, entry_level: band, mid_level: band, senior_level: band } },
        regions: { type: 'array', items: regionClaim },
        ...Object.fromEntries(SKILL_FIELDS.map((f) => [f, { type: 'array', items: skillClaim }])),
        ...Object.fromEntries(CLAIM_FIELDS.map((f) => [f, { type: 'array', items: claim }])),
      },
    },
    evidence_used: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'publisher', 'published_at'],
      properties: { id: { type: 'integer' }, publisher: { type: 'string' }, published_at: { type: 'string' } } } },
    confidence: { type: 'integer' },
    limitations: { type: 'string' },
  },
};

// ---------------------------------------------------------------- evidence
const URL_RE = /https?:\/\/[^\s"'<>)\]}]+/g;

function isPublicHttpUrl(u) {
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') && p.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.)/.test(p.hostname);
  } catch {
    return false;
  }
}

/**
 * Collect search evidence from the research response's executed tool results only.
 * Structure-agnostic: walks the tool output for {url,title,...} objects and bare URLs,
 * because Groq does not document a fixed schema for built-in tool results.
 */
export function extractEvidence(message) {
  const tools = Array.isArray(message?.executed_tools) ? message.executed_tools : [];
  const found = new Map();
  const add = (url, title = '', snippet = '', published = '') => {
    const clean = String(url).replace(/[.,;:]+$/, '');
    if (!isPublicHttpUrl(clean) || found.has(clean)) return;
    found.set(clean, { url: clean, title: str(title, 200), snippet: str(snippet, 400), published_at: str(published, 40) });
  };
  const walk = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string') {
      // Tool output may be serialised JSON or text containing URLs.
      if (node.trim().startsWith('{') || node.trim().startsWith('[')) {
        try { walk(JSON.parse(node), depth + 1); return; } catch { /* fall through to URL scan */ }
      }
      for (const m of node.match(URL_RE) ?? []) add(m);
      return;
    }
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node === 'object') {
      if (typeof node.url === 'string') {
        add(node.url, node.title ?? node.name, node.content ?? node.snippet ?? node.description, node.published_date ?? node.published_at ?? node.date);
      }
      for (const [k, v] of Object.entries(node)) if (k !== 'url') walk(v, depth + 1);
    }
  };
  walk(tools);
  return [...found.values()].slice(0, MARKET_CONFIG.maxEvidence).map((e, i) => ({ id: i + 1, ...e }));
}

// ---------------------------------------------------------------- validation
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));

function cleanIds(ids, valid) {
  if (!Array.isArray(ids)) throw new MarketResearchError('invalid_output', 'source_ids must be an array');
  return [...new Set(ids.filter((n) => Number.isInteger(n) && valid.has(n)))];
}

/**
 * Validate the structuring stage's JSON against the evidence and build the final record.
 * Throws MarketResearchError('invalid_output') for malformed or out-of-range output.
 * Unsourced claims are dropped; salary bands without sources become null.
 */
export function validateMarketResearch(raw, evidence, { now = new Date(), model = MARKET_CONFIG.model } = {}) {
  const fail = (d) => { throw new MarketResearchError('invalid_output', d); };
  if (typeof raw === 'string') {
    if (raw.length > MARKET_CONFIG.maxOutputChars) fail('output too large');
    try { raw = JSON.parse(raw); } catch { fail('model returned invalid JSON'); }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('output is not an object');
  if (JSON.stringify(raw).length > MARKET_CONFIG.maxOutputChars) fail('output too large');

  const career = str(raw.career, 120);
  if (!career) fail('career is missing');
  const m = raw.market;
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('market is missing');
  if (!Number.isInteger(raw.confidence) || raw.confidence < 0 || raw.confidence > 100) fail('confidence must be an integer 0-100');
  if (!m.demand || typeof m.demand !== 'object') fail('market.demand is missing');
  if (!DEMAND_LEVELS.includes(m.demand.level)) fail('market.demand.level is invalid');
  if (!m.salary || typeof m.salary !== 'object') fail('market.salary is missing');

  const valid = new Set(evidence.map((e) => e.id));
  const used = new Set();
  const cite = (ids) => { const c = cleanIds(ids, valid); c.forEach((i) => used.add(i)); return c; };

  // Each item: drop it unless it has text and at least one real evidence id.
  const cleanList = (f, shape) => {
    if (!Array.isArray(m[f])) fail(`market.${f} must be an array`);
    const out = m[f]
      .slice(0, MARKET_CONFIG.maxItemsPerList * 2)
      .map((item) => {
        if (!item || typeof item !== 'object') fail(`market.${f} items must be objects`);
        const text = str(item.text, MARKET_CONFIG.maxClaimChars);
        const sources = cleanIds(item.source_ids, valid);
        if (!text || !sources.length) return null;
        return shape(item, text, sources);
      })
      .filter(Boolean)
      .slice(0, MARKET_CONFIG.maxItemsPerList);
    out.forEach((c) => c.sources.forEach((i) => used.add(i)));
    return out;
  };
  const lists = {
    regions: cleanList('regions', (item, text, sources) => {
      if (!REGION_SCOPES.includes(item.scope)) fail('market.regions scope is invalid');
      const region = str(item.region, 80);
      return region ? { region, scope: item.scope, text, sources } : null;
    }),
  };
  for (const f of SKILL_FIELDS) {
    lists[f] = cleanList(f, (item, text, sources) => {
      const skill = str(item.skill, 60);
      return skill ? { skill, text, sources } : null;
    });
  }
  for (const f of CLAIM_FIELDS) lists[f] = cleanList(f, (_item, text, sources) => ({ text, sources }));

  const bandOut = (b, name) => {
    if (!b || typeof b !== 'object') fail(`market.salary.${name} is missing`);
    const range = str(b.range, 80);
    const sources = range ? cite(b.source_ids) : cleanIds(b.source_ids, valid) && [];
    return range && sources.length ? { range, sources } : null;
  };
  const salary = {
    currency: str(m.salary.currency, 10) || null,
    region: str(m.salary.region, 80) || null,
    entry_level: bandOut(m.salary.entry_level, 'entry_level'),
    mid_level: bandOut(m.salary.mid_level, 'mid_level'),
    senior_level: bandOut(m.salary.senior_level, 'senior_level'),
  };
  const demandSources = str(m.demand.summary, 600) ? cite(m.demand.source_ids) : cleanIds(m.demand.source_ids, valid) && [];
  if (!DEMAND_TRENDS.includes(m.demand.trend)) fail('market.demand.trend is invalid');
  const demand = {
    level: demandSources.length ? m.demand.level : 'unknown',
    trend: demandSources.length ? m.demand.trend : 'unknown',
    summary: demandSources.length ? str(m.demand.summary, 600) : '',
    sources: demandSources,
  };

  if (used.size === 0) throw new MarketResearchError('no_evidence', 'no claim was backed by a retrieved source');

  const meta = Object.fromEntries(
    (Array.isArray(raw.evidence_used) ? raw.evidence_used : [])
      .filter((e) => e && Number.isInteger(e.id))
      .map((e) => [e.id, e])
  );
  const researchedAt = now.toISOString();
  const sources = evidence
    .filter((e) => used.has(e.id))
    .map((e) => ({
      id: e.id,
      title: e.title || hostOf(e.url),
      url: e.url,
      publisher: str(meta[e.id]?.publisher, 120) || hostOf(e.url),
      published_at: str(e.published_at || meta[e.id]?.published_at, 40) || null,
      accessed_at: researchedAt,
    }));

  // Evidence-based ceiling: thinly sourced research can't claim high confidence.
  const confidence = Math.min(raw.confidence, 30 + 15 * sources.length);

  return {
    career,
    market: { demand, salary, ...lists },
    sources,
    confidence,
    limitations: str(raw.limitations, 600),
    researched_at: researchedAt,
    expires_at: new Date(now.getTime() + MARKET_CONFIG.ttlDays * 86_400_000).toISOString(),
    provider: 'groq',
    model,
    schema_version: MARKET_CONFIG.schemaVersion,
  };
}

/** Re-validate a stored/returned record (client side, before display or caching). */
export function isValidMarketRecord(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.career !== 'string' || !r.career) return false;
  if (!r.market || typeof r.market !== 'object') return false;
  if (r.schema_version !== MARKET_CONFIG.schemaVersion) return false; // older shapes are re-researched
  if (!LIST_FIELDS.every((f) => Array.isArray(r.market[f]))) return false;
  if (!r.market.demand || !DEMAND_LEVELS.includes(r.market.demand.level)) return false;
  if (!Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 100) return false;
  if (!Array.isArray(r.sources) || !r.sources.length) return false;
  if (!r.sources.every((s) => typeof s.url === 'string' && isPublicHttpUrl(s.url) && typeof s.title === 'string')) return false;
  return isIso(r.researched_at) && isIso(r.expires_at);
}

// ---------------------------------------------------------------- Groq calls
export async function groq(fetchImpl, apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(MARKET_CONFIG.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new MarketResearchError(e?.name === 'AbortError' ? 'timeout' : 'upstream', 'Groq request failed');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // Groq's error message (e.g. invalid parameter) helps diagnose; it never contains our key.
    const err = await res.json().catch(() => null);
    const msg = typeof err?.error?.message === 'string' ? `: ${err.error.message.slice(0, 200)}` : '';
    throw new MarketResearchError('upstream', `Groq HTTP ${res.status}${msg}`);
  }
  const data = await res.json().catch(() => null);
  const message = data?.choices?.[0]?.message;
  if (!message) throw new MarketResearchError('upstream', 'Groq returned no message');
  return message;
}

/**
 * Strict structured-output call on Groq (no tools). Returns { data, model }.
 * Throws MarketResearchError('invalid_output') if the reply isn't valid JSON.
 */
export async function groqJson({ apiKey, system, user, name, schema, model = MARKET_CONFIG.model, temperature = 0.3, maxTokens = 4096, timeoutMs = 60_000, fetchImpl = fetch }) {
  let msg;
  try {
    msg = await groq(fetchImpl, apiKey, {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      temperature,
      max_completion_tokens: maxTokens,
    }, timeoutMs);
  } catch (e) {
    // Strict mode rejects the whole reply when the model drifts from the schema even slightly
    // ("HTTP 400: Parsing failed … failed_generation"). Retry once in JSON mode with the schema
    // spelled out; every caller still validates the result before using it.
    if (!(e instanceof MarketResearchError) || !/HTTP 400.*(pars|json|schema|generat|validat)/i.test(`${e.detail ?? ''} ${e.message}`)) throw e;
    msg = await groq(fetchImpl, apiKey, {
      model,
      messages: [
        { role: 'system', content: `${system}\n\nReply with ONE JSON object only (no prose, no code fences) that matches this JSON Schema exactly, including every required field:\n${JSON.stringify(schema)}` },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: Math.min(temperature, 0.2),
      max_completion_tokens: Math.max(maxTokens, 6144),
    }, timeoutMs);
  }
  try {
    return { data: JSON.parse(msg.content ?? ''), model };
  } catch {
    throw new MarketResearchError('invalid_output', `${name}: model returned invalid JSON`);
  }
}

/**
 * Plain chat completion on Groq (used as the advisor's fallback provider). No tools.
 * history: [{ role: 'user'|'model', content }]. Returns { reply, model }.
 */
export async function groqChat({ apiKey, system, history = [], message, model = MARKET_CONFIG.model, fetchImpl = fetch }) {
  const msg = await groq(fetchImpl, apiKey, {
    model,
    messages: [
      { role: 'system', content: system },
      ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content ?? '').slice(0, 4000) })),
      { role: 'user', content: message },
    ],
    reasoning_effort: 'low',
    temperature: 0.7,
    max_completion_tokens: 2048,
  }, 60_000);
  const reply = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (!reply) throw new MarketResearchError('upstream', 'Groq returned an empty reply');
  return { reply, model };
}

/**
 * Full research pipeline. `fetchImpl` and `now` are injectable for tests.
 * Returns a validated record or throws MarketResearchError (never fabricated data).
 */
export async function researchMarket(context, { apiKey, model = MARKET_CONFIG.model, fetchImpl = fetch, now = new Date() } = {}) {
  if (!apiKey) throw new MarketResearchError('not_configured', 'GROQ_API_KEY is not set');
  const ctx = sanitiseContext(context);

  const research = await groq(fetchImpl, apiKey, {
    model,
    messages: [{ role: 'system', content: RESEARCH_SYSTEM }, { role: 'user', content: researchPrompt(ctx) }],
    tools: [{ type: 'browser_search' }],
    tool_choice: 'required',
    reasoning_effort: 'low',
    temperature: 0.3,
    max_completion_tokens: 4096,
  }, MARKET_CONFIG.researchTimeoutMs);

  const evidence = extractEvidence(research);
  if (!evidence.length) throw new MarketResearchError('no_evidence', 'search returned no verifiable sources');

  const structured = await groq(fetchImpl, apiKey, {
    model,
    messages: [
      { role: 'system', content: STRUCTURE_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          career: ctx.career.name,
          location: ctx.student.location,
          research_notes: str(research.content, MARKET_CONFIG.maxNotesChars),
          evidence: evidence.map(({ id, title, url, snippet, published_at }) => ({ id, title, url, snippet, published_at })),
        }),
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'market_research', strict: true, schema: STRUCTURE_SCHEMA } },
    temperature: 0.2,
    max_completion_tokens: 4096,
  }, MARKET_CONFIG.structureTimeoutMs);

  return validateMarketResearch(structured.content ?? '', evidence, { now, model });
}
