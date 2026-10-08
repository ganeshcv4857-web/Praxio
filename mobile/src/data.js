// Loads everything the mobile dashboard needs, using Praxio's shared logic so the phone shows
// exactly what the website shows. Each part fails independently: one broken module never
// blanks the whole app.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../../app/src/lib/db.js';
import { fromRow } from '../../app/src/lib/ai.js';
import { isComplete, evaluateAll } from '../../app/src/lib/feasibility/scoring.js';
import { deriveProgress, pathwayStages } from '../../app/src/lib/development/learning.js';
import { rankPathways } from '../../app/src/lib/development/pathways.js';
import { applyCustomisation } from '../../app/src/lib/development/projects.js';
import { loadDecisionBundle } from '../../app/src/lib/decision/load.js';
import { decide } from '../../app/src/lib/decision/engine.js';

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

async function loadAll(userId) {
  const errors = [];
  const profile = await safe('Profile', () => db.getProfile(userId), null, errors);
  const recs = await safe('Career matches', async () => (await db.getRecommendations(userId)).map(fromRow), [], errors);
  const feasibilityRow = await safe('Feasibility', () => db.getFeasibility(userId), null, errors);
  const inputs = pickInputs(feasibilityRow);
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  const m2Done = m1Done && isComplete(inputs);

  let dev = null;
  if (m1Done) {
    dev = await safe('Development', async () => {
      const raw = await db.getDevelopment(userId);
      return { ...raw, challenges: (raw.challenges ?? []).map((c) => applyCustomisation(c, c.customisation)) };
    }, null, errors);
  }

  let decision = null;
  if (m1Done) {
    decision = await safe('Next move', async () => decide(await loadDecisionBundle({ userId, profile, recs, inputs })), null, errors);
  }

  const progress = deriveProgress(dev);
  let chosen = null;
  let stages = [];
  if (m2Done) {
    await safe('Learning path', async () => {
      const pathways = rankPathways(recs, inputs);
      chosen = (dev?.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || pathways[0] || null;
      stages = chosen ? pathwayStages(chosen, progress) : [];
    }, null, errors);
  }
  const feasibility = m2Done
    ? await safe('Feasibility results', async () => Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])), {}, errors)
    : {};

  return { profile, recs, inputs, feasibility, dev, decision, progress, chosen, stages, m1Done, m2Done, errors };
}

/** Data for the signed-in user, with reload(). */
export function usePraxioData(userId) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loadAll(userId);
      if (live.current) setState({ loading: false, data, error: null });
    } catch (e) {
      if (live.current) setState((s) => ({ loading: false, data: s.data, error: e?.message ?? 'Could not load your data' }));
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
