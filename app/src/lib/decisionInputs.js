// Data boundary for the future Praxio Decision Engine (NOT the engine itself).
// Assembles everything Praxio knows, already computed by the deterministic modules, into
// one structure the engine will consume to answer: "Given what this person is currently
// doing, what is the best next career / education / skill action?"
// No new scores are calculated here.

import { userContext } from './userContext.js';
import { evaluateAll, isComplete } from './feasibility/scoring.js';
import { alignShortlist } from './alignment/engine.js';
import { marketSkillGap } from './marketInsights.js';
import { stageGuidance } from './stageGuidance.js';

/**
 * @param profile      Module 1 profile (incl. user context fields)
 * @param recs         Module 1 shortlist (fromRow objects)
 * @param inputs       Module 2 answers (pickInputs)
 * @param marketById   Module 4 cached records by career id (optional)
 * @param progress     Module 3 deriveProgress() (learned / demonstrated skills, points)
 */
export function buildDecisionInputs({ profile, recs, inputs, marketById = {}, progress = null }) {
  const context = userContext(profile);
  const feasibility = isComplete(inputs) ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {};
  const alignment = isComplete(inputs) ? Object.fromEntries(alignShortlist({ recs, profile, inputs, marketById }).map((a) => [a.careerId, a])) : {};
  const demonstrated = progress?.demonstratedSkills ?? [];
  const learned = progress?.learnedSkills ?? [];

  return {
    context: { stage: context.stage, activity: context.activity, goal: context.goal, stream: context.stream, role: context.role, isLegacy: context.isLegacy },
    skills: { demonstrated, learned, points: progress?.points ?? 0 },
    careers: recs.map((r) => {
      const market = marketById[r.domainId] ?? null;
      const gap = market ? marketSkillGap(market, { demonstrated, learned }, r.domainId) : null;
      return {
        careerId: r.domainId,
        careerFit: r.score,                                 // Module 1 (authoritative)
        feasibility: feasibility[r.domainId] ?? null,       // Module 2 (authoritative), incl. .financing plan
        alignment: alignment[r.domainId] ?? null,           // Module 5 (authoritative), incl. .familyActions
        market: market ? { demand: market.market.demand, researchedAt: market.researched_at, fresh: new Date(market.expires_at) > new Date() } : null,
        skillGap: gap,                                      // Module 4 × Module 3
        stageNextSteps: stageGuidance({ careerId: r.domainId, ctx: context, demonstrated, marketGap: gap }),
      };
    }),
  };
}
