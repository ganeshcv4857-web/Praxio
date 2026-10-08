// Loads everything the mobile dashboard needs, using Praxio's shared logic so the phone shows
// exactly what the website shows. Each part fails independently: one broken module never
// blanks the whole app.
//
// Offline-first: the last successful load is cached on the device (AsyncStorage) and shown
// immediately on launch, then refreshed from the network. Only raw records are cached; the
// derived views (progress, learning path, feasibility) are recomputed from them.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../app/src/lib/db.js';
import { fromRow } from '../../app/src/lib/ai.js';
import { isComplete, evaluateAll } from '../../app/src/lib/feasibility/scoring.js';
import { deriveProgress, pathwayStages } from '../../app/src/lib/development/learning.js';
import { rankPathways } from '../../app/src/lib/development/pathways.js';
import { applyCustomisation } from '../../app/src/lib/development/projects.js';
import { loadDecisionBundle } from '../../app/src/lib/decision/load.js';
import { decide } from '../../app/src/lib/decision/engine.js';

const CACHE_PREFIX = 'praxio-cache-v1:';

// Same keys as the website's feasibility wizard (pickInputs).
const FEASIBILITY_KEYS = [
  'income_band', 'education_budget', 'loan_willingness', 'risk_tolerance', 'education_preference',
  'location_preference', 'relocation', 'family_priorities', 'primary_funder', 'scholarship_interest',
];
export function pickInputs(row) {
  if (!row) return {};
  return Object.fromEntries(FEASIBILITY_KEYS.filter((k) => row[k] != null).map((k) => [k, row[k]]));
}

const safe = async (label, fn, fallback, errors) => {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${label}: ${e?.message ?? 'failed'}`);
    return fallback;
  }
};

/** Network: raw records only (serialisable, so they can be cached). */
async function loadRaw(userId) {
  const errors = [];
  const profile = await safe('Profile', () => db.getProfile(userId), null, errors);
  const recs = await safe('Career matches', async () => (await db.getRecommendations(userId)).map(fromRow), [], errors);
  const feasibilityRow = await safe('Feasibility', () => db.getFeasibility(userId), null, errors);
  const inputs = pickInputs(feasibilityRow);
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  const dev = m1Done
    ? await safe('Development', async () => {
      const raw = await db.getDevelopment(userId);
      return { ...raw, challenges: (raw.challenges ?? []).map((c) => applyCustomisation(c, c.customisation)) };
    }, null, errors)
    : null;
  const decision = m1Done
    ? await safe('Next move', async () => decide(await loadDecisionBundle({ userId, profile, recs, inputs })), null, errors)
    : null;
  return { profile, recs, feasibilityRow, dev, decision, errors };
}

/** Pure: everything the screens need, derived from raw records. */
export function derive(raw) {
  const errors = [...(raw.errors ?? [])];
  const { profile = null, recs = [], dev = null, decision = null } = raw;
  const inputs = pickInputs(raw.feasibilityRow);
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  const m2Done = m1Done && isComplete(inputs);
  const progress = deriveProgress(dev);
  let chosen = null;
  let stages = [];
  let feasibility = {};
  if (m2Done) {
    try {
      const pathways = rankPathways(recs, inputs);
      chosen = (dev?.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || pathways[0] || null;
      stages = chosen ? pathwayStages(chosen, progress) : [];
    } catch (e) {
      errors.push(`Learning path: ${e?.message ?? 'failed'}`);
    }
    try {
      feasibility = Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r]));
    } catch (e) {
      errors.push(`Feasibility results: ${e?.message ?? 'failed'}`);
    }
  }
  return { profile, recs, inputs, feasibility, dev, decision, progress, chosen, stages, m1Done, m2Done, errors };
}

async function readCache(userId) {
  try {
    const text = await AsyncStorage.getItem(CACHE_PREFIX + userId);
    const parsed = text ? JSON.parse(text) : null;
    return parsed?.raw ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(userId, raw) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + userId, JSON.stringify({ savedAt: Date.now(), raw: { ...raw, errors: [] } }));
  } catch {
    // storage full or unavailable: the app still works without the cache
  }
}

/** Remove every cached account (on sign-out). */
export async function clearCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // nothing cached
  }
}

/** Data for the signed-in user: cached first, then fresh. { data, loading, error, offline, updatedAt, reload } */
export function usePraxioData(userId) {
  const [state, setState] = useState({ loading: true, data: null, error: null, offline: false, updatedAt: null });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const raw = await loadRaw(userId);
      // Nothing came back at all (no profile, no matches): treat as offline, keep what we have.
      const reachable = raw.profile || raw.recs.length;
      if (!live.current) return;
      if (!reachable) {
        setState((s) => ({ ...s, loading: false, offline: Boolean(s.data), error: s.data ? null : (raw.errors[0] ?? 'Could not load your data') }));
        return;
      }
      setState({ loading: false, data: derive(raw), error: null, offline: false, updatedAt: Date.now() });
      writeCache(userId, raw);
    } catch (e) {
      if (live.current) setState((s) => ({ ...s, loading: false, offline: Boolean(s.data), error: s.data ? null : (e?.message ?? 'Could not load your data') }));
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache(userId);
      if (cached && !cancelled && live.current) {
        let data = null;
        try {
          data = derive(cached.raw);
        } catch {
          data = null; // a cache from an older app version that no longer fits: ignore it
        }
        if (data) setState((s) => (s.data ? s : { ...s, data, updatedAt: cached.savedAt }));
      }
      if (!cancelled) reload();
    })();
    return () => { cancelled = true; };
  }, [userId, reload]);

  return { ...state, reload };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
