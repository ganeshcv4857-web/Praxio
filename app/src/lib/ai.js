// Client for the `career-ai` edge function, plus the grounding context it needs.
import { supabase } from './supabase.js';
import { CAREER_BY_ID } from './careers.js';
import { BRANCHES, FEATURE_LABELS, buildFeatures } from './features.js';
import { drivers } from './scoring.js';

const toDriver = (r) => ({
  feature: r.feature,
  label: FEATURE_LABELS[r.feature] ?? r.feature,
  value: r.value,
  weight: r.weight,
});

/** Normalise a stored recommendation row into the scorer's shape. */
export function fromRow(row) {
  return {
    domainId: row.domain_id,
    rank: row.rank,
    score: Number(row.score),
    coverage: row.breakdown.coverage,
    breakdown: row.breakdown.rows,
    id: row.id,
    explanation: row.explanation,
  };
}

/** Everything the model is allowed to know about the student. */
export function buildContext(profile, shortlist) {
  const features = buildFeatures(profile);
  return {
    student: {
      name: profile.full_name || undefined,
      branch: BRANCHES.find((b) => b.id === profile.branch)?.label,
      year: profile.year_of_study ?? undefined,
    },
    answers: Object.entries(features).map(([k, v]) => ({ label: FEATURE_LABELS[k] ?? k, value: v })),
    shortlist: shortlist.map((r) => {
      const c = CAREER_BY_ID[r.domainId];
      const { strengths, gaps } = drivers(r);
      return {
        id: r.domainId,
        name: c.name,
        summary: c.summary,
        score: r.score,
        coverage: r.coverage,
        strengths: strengths.map(toDriver),
        gaps: gaps.map(toDriver),
      };
    }),
  };
}

export async function invoke(body) {
  if (!supabase) throw new Error('Demo mode: AI service not configured');
  const { data, error } = await supabase.functions.invoke('career-ai', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.detail || data.error);
  return data;
}

export const explainShortlist = (context) => invoke({ mode: 'explain', context });

export const askAdvisor = (context, history, message) =>
  supabase ? invoke({ mode: 'chat', context, history, message }) : Promise.resolve(demoReply(context, message));

// Demo mode only: a canned reply assembled from the real context (no model call).
function demoReply(context, message) {
  const q = message.toLowerCase();
  const rec = context.shortlist.find((r) => q.includes(r.name.toLowerCase().split(' ')[0])) ?? context.shortlist[0];
  const list = (ds) =>
    ds.map((d) => `- **${d.label.replace(/^\w+: /, '')}**: ${d.value}/100`).join('\n') || '- none';
  return {
    model: 'demo',
    reply: [
      "**Demo mode:** the AI advisor isn't connected, so this answer is built straight from your scores.",
      `### ${rec.name}: ${rec.score}/100`,
      rec.summary,
      '**What pushes this match up**',
      list(rec.strengths),
      '**What holds it back**',
      list(rec.gaps),
      'Connect Supabase and a Gemini key (see README) for real, conversational answers.',
    ].join('\n\n'),
  };
}

/**
 * Deterministic fallback when the AI is unavailable: still grounded in the
 * breakdown, and flagged so the UI can label it as such.
 */
export function fallbackExplanation(scored) {
  const { strengths, gaps } = drivers(scored);
  const label = (d) => `“${(FEATURE_LABELS[d.feature] ?? d.feature).replace(/^\w+: /, '')}” (${d.value}/100)`;
  const s = strengths.map(label);
  const g = gaps[0] && label(gaps[0]);
  return {
    why: s.length
      ? `Your strongest signals for this match: ${s.join(', ')}.`
      : 'None of your answers strongly drive this match yet.',
    watch_out: g ? `Your lowest relevant signal here is ${g}, worth exploring before committing.` : 'No major gaps in what you answered.',
    grounded_on: [...strengths, ...gaps.slice(0, 1)].map((d) => d.feature),
    fallback: true,
  };
}
