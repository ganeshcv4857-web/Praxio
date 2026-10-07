// Data boundary for the Praxio Decision Engine (src/lib/decision/engine.js).
// Assembles everything Praxio knows, already computed by the deterministic modules, into
// one structure the engine consumes to answer: "Given what this person is currently
// doing, what is the best next career / education / skill action?"
// No new scores are calculated here. Missing modules stay null (never invented).

import { userContext } from './userContext.js';
import { evaluateAll, isComplete } from './feasibility/scoring.js';
import { financingPlan } from './feasibility/financing.js';
import { CAREER_COSTS, LEVEL_INDEX } from './feasibility/careerCosts.js';
import { alignShortlist, familyActions, familyStance } from './alignment/engine.js';
import { marketSkillGap } from './marketInsights.js';
import { stageGuidance } from './stageGuidance.js';
import { deriveProgress } from './development/learning.js';
import { PASS_SCORE } from './development/config.js';
import { evaluateCareerEligibility, eligibilityMode, pendingQualifications, summariseForDecision } from './academic/eligibility.js';
import { ACADEMIC_RELEVANT_GOALS, ACADEMIC_RELEVANT_STAGES } from './decision/config.js';

/**
 * Every route Module 5 offers for a career (direct / balanced / bridge), each with the
 * financing plan and family actions for ITS cost and career, using the same Module 2/5
 * functions with the same arguments alignment itself uses.
 */
function routesOf(alignment, inputs) {
  const fam = familyStance(inputs);
  return alignment.paths.map((p) => {
    const careerId = p.viaCareerId ?? p.pathway.careerId;
    const plan = financingPlan(p.pathway.cost, inputs, {
      relocationLevel: LEVEL_INDEX[CAREER_COSTS[careerId].relocationRequirement],
      educationLevel: p.pathway.educationLevel,
    });
    return {
      id: p.id, kind: p.kind, type: p.pathway.type, title: p.title, careerId, viaCareerId: p.viaCareerId ?? null,
      chain: p.pathway.chain, cost: p.pathway.cost, costLabel: p.pathway.costLabel, educationLevel: p.pathway.educationLevel,
      alignmentScore: p.score, alignmentCategory: p.category?.id ?? null,
      financing: plan,
      familyActions: familyActions(plan, fam),
      recommended: p.id === alignment.recommendedPathId,
    };
  });
}

/**
 * Academic entry-route eligibility, computed by the eligibility engine (the source of truth)
 * and reduced to what decisions need. Explicit states instead of invented data:
 *   not_supplied    records were not loaded (decisions behave exactly as before)
 *   not_applicable  entry routes are not the person's current decision (e.g. undergraduates)
 *   evaluated       one summarised result per shortlisted career
 */
function academicModule({ context, profile, recs, academicRecords }) {
  if (academicRecords == null) return { status: 'not_supplied', mode: null, pendingRecords: [], careers: [] };
  if (!ACADEMIC_RELEVANT_STAGES.includes(context.stage) && !ACADEMIC_RELEVANT_GOALS.includes(context.goal)) {
    return { status: 'not_applicable', mode: null, pendingRecords: [], careers: [] };
  }
  return {
    status: 'evaluated',
    mode: eligibilityMode(profile, academicRecords),
    pendingRecords: pendingQualifications(profile, academicRecords),
    careers: recs.map((r) => summariseForDecision(evaluateCareerEligibility({ careerId: r.domainId, academicRecords, profile }))),
  };
}

/**
 * @param profile      Module 1 profile (incl. user context fields)
 * @param recs         Module 1 shortlist (fromRow objects)
 * @param inputs       Module 2 answers (pickInputs)
 * @param marketById   Module 4 cached records by career id (optional; cache only)
 * @param progress     Module 3 deriveProgress() (learned / demonstrated skills, points)
 * @param dev          Module 3 raw rows (getDevelopment); used for the committed plan and evaluations
 * @param academicRecords  academic_records rows (optional; omitted → academic 'not_supplied')
 */
export function buildDecisionInputs({ profile, recs, inputs, marketById = {}, progress = null, dev = null, academicRecords = null }) {
  const context = userContext(profile);
  const prog = progress ?? (dev ? deriveProgress(dev) : null);
  const m2 = isComplete(inputs);
  const feasibility = m2 ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {};
  const alignment = m2 ? Object.fromEntries(alignShortlist({ recs, profile, inputs, marketById }).map((a) => [a.careerId, a])) : {};
  const demonstrated = prog?.demonstratedSkills ?? [];
  const learned = prog?.learnedSkills ?? [];
  const evaluations = prog?.evaluations ?? dev?.evaluations ?? [];
  const academic = academicModule({ context, profile, recs, academicRecords });

  return {
    context: { stage: context.stage, stageLabel: context.stageLabel, group: context.group, activity: context.activity, goal: context.goal, stream: context.stream, role: context.role, isLegacy: context.isLegacy },
    modules: {
      assessment: recs.length > 0,
      feasibility: m2,
      alignment: Object.keys(alignment).length > 0,
      market: recs.filter((r) => marketById[r.domainId]).length,
      development: Boolean(prog),
      academic: academic.status === 'evaluated',
    },
    academic,
    skills: { demonstrated, learned, points: prog?.points ?? 0 },
    development: {
      plan: dev?.plan ? { careerId: dev.plan.career_id, pathwayType: dev.plan.pathway_type } : null,
      projectsEvaluated: evaluations.length,
      projectsPassed: evaluations.filter((e) => e.total_score >= PASS_SCORE).length,
    },
    careers: recs.map((r) => {
      const market = marketById[r.domainId] ?? null;
      const gap = market ? marketSkillGap(market, { demonstrated, learned }, r.domainId) : null;
      const align = alignment[r.domainId] ?? null;
      return {
        careerId: r.domainId,
        careerFit: r.score,                                 // Module 1 (authoritative)
        feasibility: feasibility[r.domainId] ?? null,       // Module 2 (authoritative), incl. .financing plan
        alignment: align,                                   // Module 5 (authoritative), incl. .familyActions
        routes: align ? routesOf(align, inputs) : [],       // Module 5 paths + Module 2 financing per path
        market: market ? {
          demand: market.market.demand,
          researchedAt: market.researched_at,
          fresh: new Date(market.expires_at) > new Date(),
        } : null,
        skillGap: gap,                                      // Module 4 × Module 3
        stageNextSteps: stageGuidance({ careerId: r.domainId, ctx: context, demonstrated, marketGap: gap }),
      };
    }),
  };
}
