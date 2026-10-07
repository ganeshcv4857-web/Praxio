// Decision Engine I/O: gathers stored data (no AI calls, no market research) and builds
// the decision bundle. Everything after this is pure (buildDecisionInputs → decide).
import * as db from '../db.js';
import { getCachedMarketForCareers } from '../marketIntelligence.js';
import { buildDecisionInputs } from '../decisionInputs.js';

export async function loadDecisionBundle({ userId, profile, recs, inputs }) {
  const [dev, marketById, academicRecords] = await Promise.all([
    db.getDevelopment(userId).catch((e) => { console.warn('Development load failed', e); return null; }),
    getCachedMarketForCareers(userId, recs.map((r) => r.domainId)),
    // Structured records only (never documents). A failed read leaves academic 'not_supplied'.
    db.getAcademicEvidence(userId).then((ev) => ev.records).catch(() => { console.warn('Academic records load failed'); return null; }),
  ]);
  return buildDecisionInputs({ profile, recs, inputs, marketById, dev, academicRecords });
}
