// The stage a visitor picks at the end of the opening ("Where are you right now?").
// Kept for this browser session only, and used solely to pre-answer the assessment's
// stage question; the assessment still asks and the person can change it.
import { STAGE_PROFILES } from './userContext.js';

const KEY = 'praxio-entry-stage';

const store = () => {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
};

export function saveEntryStage(stageId) {
  if (!STAGE_PROFILES[stageId]) return;
  try { store()?.setItem(KEY, stageId); } catch { /* storage unavailable */ }
}

export function readEntryStage() {
  try {
    const id = store()?.getItem(KEY);
    return STAGE_PROFILES[id] ? id : null;
  } catch {
    return null;
  }
}

export function clearEntryStage() {
  try { store()?.removeItem(KEY); } catch { /* storage unavailable */ }
}

/** Pre-fill a profile's stage (and that stage's default goal) when it has none yet. */
export function withEntryStage(profile, stageId = readEntryStage()) {
  if (!stageId || profile?.current_stage) return profile;
  return { ...profile, current_stage: stageId, primary_goal: profile?.primary_goal ?? STAGE_PROFILES[stageId].goals[0] };
}
