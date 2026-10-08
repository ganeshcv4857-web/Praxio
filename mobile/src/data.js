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
import { applyCustomisation } from '../../app/src/lib/development/projects.js';
import { loadDecisionBundle } from '../../app/src/lib/decision/load.js';
import { decide } from '../../app/src/lib/decision/engine.js';
import { derive, pickInputs, timeAgo } from './model.js';

export { derive, pickInputs, timeAgo };

const CACHE_PREFIX = 'praxio-cache-v1:';

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
