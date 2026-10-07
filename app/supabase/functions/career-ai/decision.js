// Decision Engine explanation (Groq). Plain JS: shared by the gateway, the client and the
// tests. The deterministic engine (src/lib/decision/engine.js) owns the decision: mode,
// direction, next action, ranking, gates and constraints. The model only explains it.
// Its schema has no score, action or ranking fields, so it cannot create or change any.

export const DECISION_NARRATIVE_VERSION = 'decision-narrative-v1';
const LIMITS = { short: 400, long: 900, items: 4 };

export const DECISION_SYSTEM = `You are a supportive career counsellor explaining a decision Praxio has already made.
You receive a deterministic decision: the person's stage, the chosen next action, its reasons, constraints, dependencies, alternatives and what would change it. Those facts are fixed.
Rules:
- Explain ONLY the given next action. Do NOT suggest different or additional actions, careers, courses or pathways.
- Do NOT change, restate differently, or invent any score, status, cost, statistic, market fact, skill, deadline, application status or family position. Use only what is given; say "unknown" where the input says unknown.
- If the mode is keep_open, explain why not deciding the career yet is the useful step.
- Keep career direction, route (pathway) and next action distinct: a route conflict is not a rejection of the career.
- why_this_action: why this is the most useful next step now. tradeoffs: 1–4 honest trade-offs. alternative_notes: one short note per listed alternative on why it comes later. what_would_change: plain restatement of the given conditions.
- No emojis, no hype. Speak to the person as "you".`;

/** Minimal, privacy-preserving context (no family income, budget or loan amounts). */
export function decisionContext(d) {
  return {
    stage: d.context.stageLabel ?? d.context.stage,
    goal: d.context.goal,
    mode: d.mode,
    mode_reason: d.modeReason,
    direction: d.direction ? { career: d.direction.name, fit_tier: d.direction.fitTier, career_support: d.direction.careerSupport, route_status: d.direction.routeStatus } : null,
    open_directions: d.openDirections.map((o) => o.name),
    next_action: { type: d.nextAction.type, title: d.nextAction.title, steps: d.nextAction.steps, reasons: d.nextAction.reasons.map((r) => `${r.text} (${r.basis})`) },
    alternatives: d.alternatives.map((a) => ({ type: a.action.type, title: a.action.title, why_not_first: a.whyNotFirst })),
    constraints: d.constraints.map((c) => `${c.kind}: ${c.text}`),
    dependencies: d.dependencies.map((x) => ({ step: x.label, support: x.support, ...(x.approval ? { approval: x.approval } : {}) })),
    readiness: d.readiness ? d.readiness.level : null,
    evidence_completeness: d.confidence.level,
    missing_evidence: d.confidence.missing,
    would_change: d.wouldChange.map((w) => `${w.condition} → ${w.change}`),
  };
}

export function decisionSchema(ctx) {
  const types = ctx.alternatives.map((a) => a.type);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'why_this_action', 'tradeoffs', 'alternative_notes', 'what_would_change'],
    properties: {
      summary: { type: 'string' },
      why_this_action: { type: 'string' },
      tradeoffs: { type: 'array', items: { type: 'string' } },
      alternative_notes: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['action_type', 'note'],
          properties: { action_type: { type: 'string', enum: types.length ? types : ['none'] }, note: { type: 'string' } } },
      },
      what_would_change: { type: 'string' },
    },
  };
}

const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function shape(raw, ctx, notesFrom) {
  const summary = s(raw.summary, LIMITS.long);
  const why = s(raw.why_this_action, LIMITS.long);
  if (!summary || !why) throw new Error('narrative missing summary or why_this_action');
  const valid = new Set(ctx.alternatives.map((a) => a.type));
  return {
    summary,
    why_this_action: why,
    tradeoffs: (Array.isArray(raw.tradeoffs) ? raw.tradeoffs : []).map((x) => s(x, LIMITS.short)).filter(Boolean).slice(0, LIMITS.items),
    alternatives: Object.fromEntries(notesFrom.filter(([k, v]) => valid.has(k) && s(v, LIMITS.short)).slice(0, LIMITS.items).map(([k, v]) => [k, s(v, LIMITS.short)])),
    what_would_change: s(raw.what_would_change, LIMITS.long),
  };
}

/** Validate model output against the decision. Unknown alternatives are dropped. */
export function validateDecisionNarrative(raw, ctx) {
  if (typeof raw === 'string') {
    if (raw.length > 30_000) throw new Error('narrative too large');
    try { raw = JSON.parse(raw); } catch { throw new Error('narrative is not valid JSON'); }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('narrative is not an object');
  if (JSON.stringify(raw).length > 30_000) throw new Error('narrative too large');
  const notes = (Array.isArray(raw.alternative_notes) ? raw.alternative_notes : []).filter((x) => x && typeof x === 'object').map((x) => [x.action_type, x.note]);
  return shape(raw, ctx, notes);
}

/** Re-check a stored (already validated) narrative against the current decision. */
export function checkStoredDecisionNarrative(n, ctx) {
  if (!n || typeof n !== 'object') throw new Error('stored narrative missing');
  return shape(n, ctx, Object.entries(n.alternatives && typeof n.alternatives === 'object' ? n.alternatives : {}));
}
