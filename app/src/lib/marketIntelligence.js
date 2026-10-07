// Market intelligence (Groq, via the career-ai gateway). Client-side abstraction only:
// no provider logic or keys here — just context building, re-validation and caching.
//
// Results are generated content: stored in generated_outputs (kind 'market_insight'),
// never written into Career Fit, Feasibility or any other authoritative record.
import * as db from './db.js';
import { invoke } from './ai.js';
import { CAREER_BY_ID } from './careers.js';
import { BRANCHES } from './features.js';
import { isValidMarketRecord, MARKET_CONFIG, UNAVAILABLE_MESSAGE } from '../../supabase/functions/career-ai/market.js';

export { UNAVAILABLE_MESSAGE };
export const MARKET_CONTEXT_VERSION = MARKET_CONFIG.schemaVersion;

/**
 * Minimum context for research: career + branch/year/location + demonstrated skill names.
 * No name, assessment answers or family finances are sent.
 */
export function buildMarketContext(careerId, profile, { location = 'India', skills = [] } = {}) {
  const c = CAREER_BY_ID[careerId];
  if (!c) throw new Error(`Unknown career ${careerId}`);
  return {
    career: { id: c.id, name: c.name, summary: c.summary },
    student: {
      branch: BRANCHES.find((b) => b.id === profile?.branch)?.label ?? null,
      year: profile?.year_of_study ?? null,
      location,
    },
    skills: skills.slice(0, 30),
  };
}

/**
 * Cache-only read (no Groq call): the latest valid record for a career, fresh or not.
 * Returns { record, fresh } or null. Used to render pages and comparisons cheaply.
 */
export async function getCachedMarketIntelligence(userId, careerId, now = new Date()) {
  try {
    const row = await db.getLatestGeneratedOutput(userId, 'career', careerId, 'market_insight');
    if (!row || !isValidMarketRecord(row.content)) return null;
    return { record: row.content, fresh: new Date(row.content.expires_at) > now };
  } catch (e) {
    console.warn('Market cache read failed', e);
    return null;
  }
}

const fresh = (row, now) => row && row.expires_at && new Date(row.expires_at) > now && isValidMarketRecord(row.content);

/**
 * Market intelligence for a career: a fresh cached record if one exists, otherwise new
 * research through the gateway. Never throws and never fabricates:
 *   { status: 'ok', record, cached }  |  { status: 'unavailable', message, reason, stale? }
 * `invokeFn` / `now` are injectable for tests.
 */
export async function getMarketIntelligence({ userId, careerId, context, force = false, invokeFn = invoke, now = new Date() }) {
  let cached = null;
  try {
    cached = await db.getLatestGeneratedOutput(userId, 'career', careerId, 'market_insight');
  } catch (e) {
    console.warn('Market cache read failed', e);
  }
  if (!force && fresh(cached, now)) return { status: 'ok', record: cached.content, cached: true };

  try {
    const data = await invokeFn({ mode: 'market_research', context });
    const record = data?.research;
    if (!isValidMarketRecord(record)) throw new Error('Gateway returned an invalid market record');
    await db.saveGeneratedOutput(userId, {
      kind: 'market_insight',
      subject_type: 'career',
      subject_key: careerId,
      content: record,
      generator: 'groq',
      model: record.model ?? null,
      sources: record.sources,
      confidence: Math.round(record.confidence) / 100, // column is 0–1
      context_version: MARKET_CONTEXT_VERSION,
      expires_at: record.expires_at,
    });
    return { status: 'ok', record, cached: false };
  } catch (e) {
    // Offer the last valid (stale) record only if it's clearly labelled as such.
    const stale = cached && isValidMarketRecord(cached.content) ? cached.content : null;
    return { status: 'unavailable', message: UNAVAILABLE_MESSAGE, reason: e.message, ...(stale ? { stale } : {}) };
  }
}
