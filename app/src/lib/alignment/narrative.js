// Alignment narrative: AI explanations through the career-ai gateway, cached in
// generated_outputs and keyed to a hash of the exact analysis they explain.
// Falls back to a deterministic narrative, so the module always works.
import * as db from '../db.js';
import { invoke } from '../ai.js';
import { ALIGNMENT_NARRATIVE_VERSION, checkStoredNarrative, narrativeContext, validateNarrative } from '../../../supabase/functions/career-ai/alignment.js';

/** Small stable string hash (djb2) to detect when the analysis changed. */
export function hashContext(ctx) {
  const str = JSON.stringify(ctx);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STARTERS = {
  aspiration: 'What matters most to you both in a first job: security, salary, or interest in the work?',
  financial: 'Would a lower-cost route first, with further study later, work for everyone?',
  risk: 'What level of financial uncertainty would feel acceptable, and for how long?',
  location: 'Would a move to a city for work be acceptable if it led to a stable role?',
  education: 'How long can we plan for study before starting to earn?',
  priorities: 'Which of our priorities are must-haves, and which are nice-to-haves?',
};

/** Deterministic narrative built only from the engine's output. */
export function fallbackNarrative(a) {
  const rec = a.paths.find((p) => p.id === a.recommendedPathId);
  const agree = a.aligned.map((d) => d.label.toLowerCase());
  const talk = a.conflicts.map((d) => d.label.toLowerCase());
  return {
    summary: `For ${a.career}, your goals and your family's priorities show ${a.category.label.toLowerCase()} (${a.score}/100).`
      + (agree.length ? ` You agree on ${agree.join(', ')}.` : '')
      + (talk.length ? ` Worth talking through together: ${talk.join(', ')}.` : ''),
    why_it_matters: talk.length
      ? 'Agreeing on these early makes it easier to commit to a path and plan its cost and timeline together.'
      : 'Your plans and your family\'s priorities already point in the same direction.',
    differences: Object.fromEntries(a.conflicts.map((d) => [d.dimension, d.reason])),
    paths: {}, // path cards already list what each path preserves, eases and trades off
    recommendation_note: rec.id === 'direct'
      ? `The ${rec.title.toLowerCase()} already works well for your family's priorities, so you can pursue ${a.career} directly.`
      : `The ${rec.title.toLowerCase()} keeps as much of your goal as possible${rec.solves.length ? ` while easing ${rec.solves.join(', ').toLowerCase()}` : ''}.`,
    conversation_starters: a.conflicts.map((d) => STARTERS[d.dimension]).filter(Boolean).slice(0, 4),
  };
}

/**
 * { status: 'ai' | 'cached' | 'fallback', narrative, reason? }
 * Only calls the gateway when asked (`request: true`); never throws.
 */
export async function getAlignmentNarrative({ userId, alignment, request = false, invokeFn = invoke }) {
  const ctx = narrativeContext(alignment);
  const hash = hashContext(ctx);
  try {
    const row = await db.getLatestGeneratedOutput(userId, 'career', alignment.careerId, 'reasoning');
    const c = row?.content;
    if (c?.type === 'alignment_narrative' && c.version === ALIGNMENT_NARRATIVE_VERSION && c.input_hash === hash) {
      return { status: 'cached', narrative: checkStoredNarrative(c.narrative, ctx) };
    }
  } catch (e) {
    console.warn('Alignment narrative cache read failed', e);
  }
  if (!request) return { status: 'fallback', narrative: fallbackNarrative(alignment) };
  try {
    const data = await invokeFn({ mode: 'alignment', context: ctx });
    const narrative = validateNarrative(data?.narrative, ctx);
    await db.saveGeneratedOutput(userId, {
      kind: 'reasoning', subject_type: 'career', subject_key: alignment.careerId, generator: 'groq', model: data.model ?? null,
      content: { type: 'alignment_narrative', version: ALIGNMENT_NARRATIVE_VERSION, input_hash: hash, narrative },
      context_version: ALIGNMENT_NARRATIVE_VERSION,
    });
    return { status: 'ai', narrative };
  } catch (e) {
    return { status: 'fallback', narrative: fallbackNarrative(alignment), reason: e.message };
  }
}
