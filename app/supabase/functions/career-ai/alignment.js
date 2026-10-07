// Parent–Student Alignment narrative (Groq). Plain JS: shared by the gateway, the client
// and the tests. The deterministic engine (src/lib/alignment/engine.js) owns every score,
// status, severity, path and the recommended path. The model only writes explanations,
// and its schema has NO score fields, so it cannot change any of them.

export const ALIGNMENT_NARRATIVE_VERSION = 'alignment-narrative-v1';
const LIMITS = { short: 400, long: 900, items: 6 };
const DIMENSION_IDS = ['aspiration', 'financial', 'risk', 'location', 'education', 'priorities'];

export const ALIGNMENT_SYSTEM = `You are a supportive career counsellor helping an engineering student and their family find a path that works for both.
You receive a deterministic alignment analysis: dimensions with status and reasons, compromise paths and the recommended path. Those facts are fixed.
Rules:
- Do NOT change, restate differently, or invent any score, status, cost, statistic or market fact. Use only what is given.
- Never take sides. Frame differences as understandable priorities to talk through, not conflicts to win.
- Explain each listed difference in plain language, and why it matters for this career.
- For each path, explain in 1–2 sentences what it preserves of the student's goal and what family concern it addresses.
- recommendation_note: why the recommended path is a reasonable compromise.
- conversation_starters: 2–4 short, respectful questions the student could discuss with their family.
- No emojis, no hype. Speak to the student as "you".`;

/** Minimal, privacy-preserving context for the model (no raw family finances). */
export function narrativeContext(alignment) {
  return {
    career: alignment.career,
    alignment: { score: alignment.score, category: alignment.category?.label ?? null },
    differences: alignment.conflicts.map((d) => ({ dimension: d.dimension, label: d.label, status: d.status, severity: d.severity, student: d.student, family: d.family, reason: d.reason, market_evidence: d.evidence.map((e) => e.text).slice(0, 2) })),
    aligned: alignment.aligned.map((d) => d.label),
    paths: alignment.paths.map((p) => ({ id: p.id, title: p.title, route: p.pathway.chain, alignment: p.score, preserves: p.preserves, solves: p.solves, tradeoffs: p.tradeoffs })),
    recommended_path: alignment.recommendedPathId,
  };
}

export function narrativeSchema(ctx) {
  const dims = [...new Set(ctx.differences.map((d) => d.dimension))];
  const paths = ctx.paths.map((p) => p.id);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'why_it_matters', 'difference_explanations', 'path_explanations', 'recommendation_note', 'conversation_starters'],
    properties: {
      summary: { type: 'string' },
      why_it_matters: { type: 'string' },
      difference_explanations: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['dimension', 'explanation'],
          properties: { dimension: { type: 'string', enum: dims.length ? dims : DIMENSION_IDS }, explanation: { type: 'string' } } },
      },
      path_explanations: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['path_id', 'explanation'],
          properties: { path_id: { type: 'string', enum: paths }, explanation: { type: 'string' } } },
      },
      recommendation_note: { type: 'string' },
      conversation_starters: { type: 'array', items: { type: 'string' } },
    },
  };
}

const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Validate model output against the context. Returns a clean narrative or throws.
 * Unknown dimensions/paths are dropped; required prose must be present.
 */
export function validateNarrative(raw, ctx) {
  if (typeof raw === 'string') {
    if (raw.length > 30_000) throw new Error('narrative too large');
    try { raw = JSON.parse(raw); } catch { throw new Error('narrative is not valid JSON'); }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('narrative is not an object');
  if (JSON.stringify(raw).length > 30_000) throw new Error('narrative too large');
  const summary = s(raw.summary, LIMITS.long);
  const note = s(raw.recommendation_note, LIMITS.long);
  if (!summary || !note) throw new Error('narrative missing summary or recommendation_note');
  for (const k of ['difference_explanations', 'path_explanations', 'conversation_starters']) {
    if (!Array.isArray(raw[k])) throw new Error(`${k} must be an array`);
  }
  const dims = new Set(ctx.differences.map((d) => d.dimension));
  const paths = new Set(ctx.paths.map((p) => p.id));
  const byKey = (arr, key, valid) => Object.fromEntries(
    arr.filter((x) => x && valid.has(x[key]) && s(x.explanation, LIMITS.long)).slice(0, LIMITS.items * 2).map((x) => [x[key], s(x.explanation, LIMITS.long)])
  );
  return {
    summary,
    why_it_matters: s(raw.why_it_matters, LIMITS.long),
    differences: byKey(raw.difference_explanations, 'dimension', dims),
    paths: byKey(raw.path_explanations, 'path_id', paths),
    recommendation_note: note,
    conversation_starters: raw.conversation_starters.map((q) => s(q, LIMITS.short)).filter(Boolean).slice(0, 4),
  };
}

/** Re-check a narrative already in validated shape (e.g. read from cache) against the analysis. */
export function checkStoredNarrative(n, ctx) {
  if (!n || typeof n !== 'object') throw new Error('stored narrative missing');
  const summary = s(n.summary, LIMITS.long);
  const note = s(n.recommendation_note, LIMITS.long);
  if (!summary || !note) throw new Error('stored narrative incomplete');
  const keep = (obj, valid) => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {})
    .filter(([k, v]) => valid.has(k) && typeof v === 'string').map(([k, v]) => [k, s(v, LIMITS.long)]));
  return {
    summary,
    why_it_matters: s(n.why_it_matters, LIMITS.long),
    differences: keep(n.differences, new Set(ctx.differences.map((d) => d.dimension))),
    paths: keep(n.paths, new Set(ctx.paths.map((p) => p.id))),
    recommendation_note: note,
    conversation_starters: (Array.isArray(n.conversation_starters) ? n.conversation_starters : []).map((q) => s(q, LIMITS.short)).filter(Boolean).slice(0, 4),
  };
}
