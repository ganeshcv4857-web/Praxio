// Decision explanation: Groq wording through the career-ai gateway, cached in
// generated_outputs (kind 'reasoning', subject user/'decision') and keyed to a hash of the
// exact decision it explains. Falls back to a deterministic explanation, so the decision
// is always shown; the AI never changes it.
import * as db from '../db.js';
import { invoke } from '../ai.js';
import { hashContext } from '../alignment/narrative.js';
import { DECISION_NARRATIVE_VERSION, checkStoredDecisionNarrative, decisionContext, validateDecisionNarrative } from '../../../supabase/functions/career-ai/decision.js';

const SUBJECT = 'decision';

/** Deterministic explanation built only from the engine's output. */
export function fallbackNarrative(d) {
  const a = d.nextAction;
  const dir = d.direction;
  const summary = d.mode === 'keep_open'
    ? (d.openDirections.length ? `It's too early to settle on one career. Your best next step is to gather evidence: ${a.title.toLowerCase()}.` : `Your best next step: ${a.title.toLowerCase()}.`)
    : d.mode === 'no_viable_path'
      ? `${dir.name} suits you, but every route into it currently depends on a step that isn't supported. Start by resolving that.`
      : `${dir.name} is a direction worth developing toward. Your most useful next step: ${a.title.toLowerCase()}.`;
  return {
    summary,
    why_this_action: a.reasons.map((r) => r.text).join('. ') + '.',
    tradeoffs: d.constraints.map((c) => c.text).slice(0, 4),
    alternatives: Object.fromEntries(d.alternatives.map((x) => [x.action.type, x.whyNotFirst])),
    what_would_change: d.wouldChange.map((w) => `${w.condition}: ${w.change.toLowerCase()}`).join('. '),
  };
}

/**
 * { status: 'ai' | 'cached' | 'fallback', narrative, reason? }
 * Only calls the gateway when asked (`request: true`); never throws.
 */
export async function getDecisionNarrative({ userId, decision, request = false, invokeFn = invoke }) {
  const ctx = decisionContext(decision);
  const hash = hashContext(ctx);
  try {
    const row = await db.getLatestGeneratedOutput(userId, 'user', SUBJECT, 'reasoning');
    const c = row?.content;
    if (c?.type === 'decision_narrative' && c.version === DECISION_NARRATIVE_VERSION && c.input_hash === hash) {
      return { status: 'cached', narrative: checkStoredDecisionNarrative(c.narrative, ctx) };
    }
  } catch (e) {
    console.warn('Decision narrative cache read failed', e);
  }
  if (!request) return { status: 'fallback', narrative: fallbackNarrative(decision) };
  try {
    const data = await invokeFn({ mode: 'decision', context: ctx });
    const narrative = validateDecisionNarrative(data?.narrative, ctx);
    await db.saveGeneratedOutput(userId, {
      kind: 'reasoning', subject_type: 'user', subject_key: SUBJECT, generator: 'groq', model: data.model ?? null,
      content: { type: 'decision_narrative', version: DECISION_NARRATIVE_VERSION, input_hash: hash, narrative },
      context_version: DECISION_NARRATIVE_VERSION,
    });
    return { status: 'ai', narrative };
  } catch (e) {
    return { status: 'fallback', narrative: fallbackNarrative(decision), reason: e.message };
  }
}
