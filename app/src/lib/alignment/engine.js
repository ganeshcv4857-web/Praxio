// Parent–Student Alignment engine. Pure and deterministic: the same saved Praxio data
// always produces the same scores, conflicts and paths. No LLM decides anything here.
//
// Inputs (all existing data, nothing new collected):
//   profile  — Module 1 answers (student risk appetite, study inclination)
//   inputs   — Module 2 answers (family budget/loan/risk/priorities; student education & relocation)
//   rec      — Module 1 recommendation for the career (Career Fit)
//   market   — optional cached Module 4 record (evidence only, never scored)
//
// Alignment is evaluated for a specific career AND a specific pathway into it, because
// the same family can be well aligned with one route and not another.

import { CAREER_BY_ID } from '../careers.js';
import { buildFeatures } from '../features.js';
import { CAREER_COSTS, LEVEL_INDEX } from '../feasibility/careerCosts.js';
import { EDUCATION_OPTIONS, FAMILY_PRIORITIES, RELOCATION_OPTIONS, RISK_LEVELS, byId } from '../feasibility/config.js';
import { studentCapacity } from '../feasibility/scoring.js';
import { financingPlan, financingSummary } from '../feasibility/financing.js';
import { CAREER_TRACKS, formatPrice } from '../development/catalog.js';
import { PATHWAY_TYPES, buildPathways, pathwayChain } from '../development/pathways.js';
import {
  ASPIRATION_FLOOR, BURDEN_PENALTY, CATEGORIES, CONDITIONAL_FINANCING_SCORE, DIMENSIONS, FAMILY_INFERENCE, LEVEL_GAP_SCORES, MIN_COVERAGE, PRIORITY_MATCH,
  RESEARCH_RISK_BUMP, SEVERITY_THRESHOLDS, STATUS_THRESHOLDS, STUDENT_RISK_LEVELS, WEIGHTS,
} from './config.js';

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const gapScore = (gap) => (gap <= 0 ? 100 : LEVEL_GAP_SCORES[Math.min(gap, LEVEL_GAP_SCORES.length - 1)]);
const label = (id) => byId(FAMILY_PRIORITIES, id)?.label.toLowerCase() ?? id;
const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function statusOf(score) {
  if (score == null) return 'unknown';
  return score >= STATUS_THRESHOLDS.aligned ? 'aligned' : score >= STATUS_THRESHOLDS.partial ? 'partial' : 'conflict';
}
export function severityOf(score) {
  if (score == null) return null;
  if (score >= SEVERITY_THRESHOLDS.none) return 'none';
  return score >= SEVERITY_THRESHOLDS.low ? 'low' : score >= SEVERITY_THRESHOLDS.medium ? 'medium' : 'high';
}
export const categoryOf = (score) => CATEGORIES.find((c) => score >= c.min);

// ---------------------------------------------------------------- positions
/** Student's own risk appetite from Module 1 (null if those questions weren't answered). */
export function studentRiskAppetite(profile) {
  const f = buildFeatures(profile ?? {});
  const vals = [f.tr_risk, f.pref_novelty].filter((v) => v != null);
  if (!vals.length) return null;
  const value = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const lvl = STUDENT_RISK_LEVELS.find((l) => value < l.max);
  return { value, level: lvl.level, label: lvl.label };
}

/** Family positions: stated (budget, loan, risk, priorities) or inferred from priorities, else null. */
export function familyStance(inputs) {
  const cap = studentCapacity(inputs);
  const pr = inputs.family_priorities ?? [];
  const has = (ids) => ids.some((id) => pr.includes(id));
  return {
    capacity: cap,
    riskLevel: cap.effectiveRisk,
    riskLabel: RISK_LEVELS[cap.effectiveRisk].label,
    riskAdjusted: cap.lowIncome && cap.statedRisk > cap.effectiveRisk,
    priorities: pr,
    prefersProximity: has(FAMILY_INFERENCE.prefersProximity) ? true : null,
    education: has(FAMILY_INFERENCE.openToHigherStudy) ? 'open'
      : has(FAMILY_INFERENCE.prefersEarlyEmployment) ? 'early_employment' : null,
  };
}

// ---------------------------------------------------------------- dimensions
function dim(id, score, fields) {
  const meta = DIMENSIONS.find((d) => d.id === id);
  return { dimension: id, label: meta.label, weight: WEIGHTS[id], score: score == null ? null : clamp(score), status: statusOf(score == null ? null : clamp(score)), severity: severityOf(score == null ? null : clamp(score)), evidence: [], ...fields };
}

const pathRisk = (careerId, pathway) =>
  Math.min(2, LEVEL_INDEX[CAREER_COSTS[careerId].financialRisk] + (pathway.type === 'research' ? RESEARCH_RISK_BUMP : 0));

/** Evaluate all six dimensions for one career + pathway. */
export function evaluateDimensions({ careerId, pathway, profile, inputs, rec, market = null }) {
  const career = CAREER_BY_ID[careerId];
  const costs = CAREER_COSTS[careerId];
  const fam = familyStance(inputs);
  const cap = fam.capacity;
  const student = studentRiskAppetite(profile);
  const m = market?.market ?? null;
  const dims = [];

  // A. Career direction: does this career offer what the family values?
  // Location proximity is scored under Location, so it is excluded here (no double counting).
  const careerPriorities = fam.priorities.filter((p) => !FAMILY_INFERENCE.prefersProximity.includes(p));
  if (!careerPriorities.length) {
    dims.push(dim('aspiration', null, { student: `Interested in ${career.name} (fit ${Math.round(rec.score)}%)`, family: null, reason: 'No family career priorities were provided (beyond location).', basis: 'Module 1 Career Fit; Module 2 family priorities (missing)' }));
  } else {
    const offered = new Set([...costs.alignsWith, 'passion']);
    const met = careerPriorities.filter((p) => offered.has(p));
    const unmet = careerPriorities.filter((p) => !offered.has(p));
    const score = ASPIRATION_FLOOR + ((100 - ASPIRATION_FLOOR) * met.length) / careerPriorities.length;
    const d = dim('aspiration', score, {
      student: `Interested in ${career.name} (fit ${Math.round(rec.score)}%)`,
      family: `Values ${listOf(careerPriorities.map(label))}`,
      reason: !unmet.length ? `${career.name} typically offers what the family values.`
        : met.length ? `${career.name} typically offers ${listOf(met.map(label))}, but is less associated with ${listOf(unmet.map(label))}.`
          : `${career.name} is not typically associated with ${listOf(unmet.map(label))}.`,
      basis: 'Module 2 family priorities × career profile',
    });
    if (m?.demand && m.demand.level !== 'unknown') d.evidence.push({ text: `Market: ${m.demand.level.replace('_', ' ')} demand${m.demand.trend && m.demand.trend !== 'unknown' ? `, ${m.demand.trend}` : ''}. ${m.demand.summary}`.trim(), sources: m.demand.sources });
    dims.push(d);
  }

  // B. Education cost — action-aware (Review 1): not "can the family afford it", but which
  // financing actions the path needs from the family and whether they're willing to take them.
  // Family amounts are never shown.
  {
    const plan = financingPlan(pathway.cost, inputs, { relocationLevel: LEVEL_INDEX[costs.relocationRequirement], educationLevel: pathway.educationLevel });
    const penalty = BURDEN_PENALTY[plan.repayment.burden] ?? 0;
    const selfFunded = plan.primaryFunder === 'self' && plan.loanUsed === 0;
    let score;
    let family;
    if (selfFunded && plan.status === 'funded') {
      score = 100;
      family = 'Not needed for funding (you are paying)';
    } else if (plan.status === 'funded') {
      score = 100;
      family = 'Can fund this path upfront';
    } else if (plan.status === 'financed') {
      score = 100 - penalty;
      family = 'Funds part upfront and is willing to co-apply for an education loan';
    } else if (plan.status === 'conditional') {
      score = CONDITIONAL_FINANCING_SCORE - penalty;
      family = plan.loanState === 'maybe' && plan.remainingGap === 0 ? 'Undecided about co-applying for an education loan' : 'The remaining cost depends on a scholarship';
    } else {
      score = Math.min(50, (100 * (pathway.cost - plan.remainingGap)) / pathway.cost);
      family = `Education budget: ${plan.remainingGap / pathway.cost < 0.33 ? 'somewhat below' : 'well below'} what this path costs`;
    }
    const d = dim('financial', score, {
      student: `${PATHWAY_TYPES[pathway.type].short} · about ${formatPrice(pathway.cost)}`,
      family,
      reason: financingSummary(plan),
      basis: 'Module 2 funding + loan + scholarship × Module 3 pathway cost (financing plan)',
    });
    d.financing = plan;
    dims.push(d);
  }

  // C. Financial risk: pathway risk vs. family comfort; student appetite shown alongside.
  {
    const risk = pathRisk(careerId, pathway);
    const score = gapScore(risk - fam.riskLevel);
    const riskName = ['low', 'moderate', 'high'][risk];
    let reason;
    if (risk <= fam.riskLevel) reason = `The ${riskName} risk of this route is within the family's comfort level.`;
    else if (student && student.level >= risk) reason = `You're comfortable with the ${riskName} risk of this route, but it is above the family's comfort level.`;
    else reason = `This route carries ${riskName} financial risk, above the family's comfort level${student ? ' and your own stated preference' : ''}.`;
    const d = dim('risk', score, {
      student: student ? student.label : null,
      family: `Comfort with risk: ${fam.riskLabel.toLowerCase()}${fam.riskAdjusted ? ' (adjusted for income)' : ''}`,
      reason,
      basis: 'Module 2 family risk × career/pathway risk; Module 1 student risk appetite',
    });
    for (const t of (m?.threats ?? []).slice(0, 2)) d.evidence.push({ text: `Market: ${t.text}`, sources: t.sources });
    dims.push(d);
  }

  // D. Location: only scored if the family's priorities express a location preference.
  {
    const need = LEVEL_INDEX[costs.relocationRequirement];
    const studentRel = byId(RELOCATION_OPTIONS, inputs.relocation)?.label ?? null;
    const remote = (m?.regions ?? []).filter((r) => r.scope === 'remote');
    const d = fam.prefersProximity
      ? dim('location', gapScore(need), {
        student: studentRel ? `Willing to relocate: ${studentRel.toLowerCase()}` : null,
        family: 'Prefers staying close to home',
        reason: need === 0 ? 'Work in this field is available in most regions, including near home.'
          : `Opportunities in this field ${need === 2 ? 'cluster in a few hubs or abroad' : 'often require moving to a city hub'}, which differs from the family's preference to stay close.`,
        basis: 'Module 2 family priority (location proximity) × career relocation profile',
      })
      : dim('location', null, {
        student: studentRel ? `Willing to relocate: ${studentRel.toLowerCase()}` : null,
        family: null,
        reason: 'The family did not express a location preference.',
        basis: 'Module 2 family priorities (no location signal)',
      });
    for (const r of (m?.regions ?? []).slice(0, 3)) d.evidence.push({ text: `Market: opportunities in ${r.region} (${r.scope})`, sources: r.sources });
    if (remote.length) d.evidence.push({ text: 'Market: remote roles exist in this field.', sources: [...new Set(remote.flatMap((r) => r.sources))] });
    dims.push(d);
  }

  // E. Length of education: pathway's postgraduate level vs. family expectation (inferred).
  {
    const studentLevel = byId(EDUCATION_OPTIONS, inputs.education_preference);
    const lvl = pathway.educationLevel;
    const pathLabel = lvl === 0 ? 'starts working after the degree' : `includes ${EDUCATION_OPTIONS.find((o) => o.level === lvl)?.label.replace(/^Open to /, '')}`;
    const d = fam.education
      ? dim('education', fam.education === 'open' ? 100 : gapScore(lvl), {
        student: studentLevel ? `Comfortable with: ${studentLevel.label.replace(/^Open to /, '').toLowerCase()}` : null,
        family: fam.education === 'open' ? 'Open to higher studies' : 'Prefers earlier employment',
        reason: fam.education === 'open' || lvl === 0
          ? `This route ${pathLabel}, which fits the family's expectations.`
          : `This route ${pathLabel}, which delays employment compared with what the family prefers.`,
        basis: 'Module 2 family priorities (inferred education stance) × Module 3 pathway',
      })
      : dim('education', null, {
        student: studentLevel ? `Comfortable with: ${studentLevel.label.replace(/^Open to /, '').toLowerCase()}` : null,
        family: null,
        reason: 'The family priorities give no signal about higher studies or time to employment.',
        basis: 'Module 2 family priorities (no education signal)',
      });
    for (const c of (m?.education_expectations ?? []).slice(0, 2)) d.evidence.push({ text: `Market: ${c.text}`, sources: c.sources });
    dims.push(d);
  }

  // F. Shared values: family priorities vs. the student's own preferences (career-independent).
  {
    const f = buildFeatures(profile ?? {});
    const results = [];
    for (const p of fam.priorities) {
      if (p === 'financial_stability' || p === 'job_security') {
        if (f.pref_stability != null) results.push([p, f.pref_stability >= 50 ? 'match' : f.pref_stability >= 35 ? 'partial' : 'mismatch']);
      } else if (p === 'entrepreneurship') {
        if (f.tr_risk != null) results.push([p, f.tr_risk >= 60 ? 'match' : f.tr_risk >= 35 ? 'partial' : 'mismatch']);
      } else if (p === 'location_proximity') {
        if (inputs.relocation) results.push([p, inputs.relocation === 'no' ? 'match' : inputs.relocation === 'india' ? 'partial' : 'mismatch']);
      }
    }
    if (!results.length) {
      dims.push(dim('priorities', null, { student: null, family: fam.priorities.length ? `Values ${listOf(fam.priorities.map(label))}` : null, reason: 'No family priority can be compared with your own stated preferences.', basis: 'Module 1 preferences × Module 2 family priorities' }));
    } else {
      const score = results.reduce((s, [, r]) => s + PRIORITY_MATCH[r], 0) / results.length;
      const differ = results.filter(([, r]) => r === 'mismatch').map(([p]) => label(p));
      const share = results.filter(([, r]) => r === 'match').map(([p]) => label(p));
      dims.push(dim('priorities', score, {
        student: share.length ? `You also value ${listOf(share)}` : 'Your own preferences lean differently',
        family: `Values ${listOf(results.map(([p]) => label(p)))}`,
        reason: differ.length ? `You and your family weigh ${listOf(differ)} differently.` : 'Your own preferences broadly match what your family values.',
        basis: 'Module 1 preferences × Module 2 family priorities',
      }));
    }
  }
  return dims;
}

/**
 * Actions the direct path needs from the family, and whether the family's stated
 * answers support them: supported | conditional | not_supported | unknown.
 */
export function familyActions(plan, fam) {
  const out = [];
  for (const a of plan.actions.filter((x) => x.party.includes('family'))) {
    let support = 'unknown';
    let note = a.note ?? null;
    if (a.id === 'upfront_funding') support = 'supported';
    else if (a.id === 'loan_application') support = plan.loanState === 'yes' ? 'supported' : 'conditional';
    else if (a.id === 'loan_repayment') {
      support = plan.repayment.burden === 'high' || plan.loanState !== 'yes' ? 'conditional' : 'supported';
      note = `Repayment burden: ${plan.repayment.burden}`;
    } else if (a.id === 'relocation') support = fam.prefersProximity ? 'not_supported' : 'unknown';
    else if (a.id === 'higher_studies') support = fam.education === 'open' ? 'supported' : fam.education === 'early_employment' ? 'not_supported' : 'unknown';
    out.push({ ...a, support, note });
  }
  if (plan.remainingGap > 0) {
    out.push({
      id: 'fund_remaining', label: 'Fund the remaining cost', party: plan.primaryFunder === 'self' ? 'student' : 'family',
      requirement: 'required', timing: 'before_start', support: plan.status === 'conditional' ? 'conditional' : 'not_supported',
      note: 'No loan or confirmed scholarship covers this part yet',
    });
  }
  return out;
}

/** Weighted alignment over known dimensions. */
export function scoreAlignment(dims) {
  const known = dims.filter((d) => d.score != null);
  const totalW = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const knownW = known.reduce((s, d) => s + d.weight, 0);
  if (!knownW) return { score: null, coverage: 0, category: null, tentative: true };
  const score = clamp(known.reduce((s, d) => s + d.weight * d.score, 0) / knownW);
  const coverage = Math.round((knownW / totalW) * 100) / 100;
  return { score, coverage, category: categoryOf(score), tentative: coverage < MIN_COVERAGE };
}

// ---------------------------------------------------------------- pathways
/** The route a student would take to pursue the career fully: meets its education norm, cheapest first. */
export function directPathway(careerId, inputs) {
  const all = buildPathways(careerId, inputs);
  if (!all.length) return null;
  const needed = byId(EDUCATION_OPTIONS, CAREER_COSTS[careerId].typicalEducation).level;
  const meets = all.filter((p) => p.educationLevel >= needed).sort((a, b) => a.educationLevel - b.educationLevel || a.cost - b.cost);
  return meets[0] ?? [...all].sort((a, b) => b.educationLevel - a.educationLevel)[0];
}

function evaluatePath(args) {
  const dims = evaluateDimensions(args);
  return { dims, ...scoreAlignment(dims) };
}

const pathSummary = (p) => ({ id: p.id, careerId: p.careerId, type: p.type, chain: pathwayChain(p), cost: p.cost, costLabel: formatPrice(p.cost), educationLevel: p.educationLevel });

function compare(baseDims, dims) {
  const solves = [];
  const worsens = [];
  for (const d of dims) {
    const b = baseDims.find((x) => x.dimension === d.dimension);
    if (b?.score == null || d.score == null) continue;
    if (d.score - b.score >= 15 && b.status !== 'aligned') solves.push(d.label);
    if (b.score - d.score >= 15) worsens.push(d.label);
  }
  return { solves, worsens };
}

const MIN_SHARED_COURSES = 2;
const sharedCourses = (a, b) => {
  const ids = (c) => new Set(CAREER_TRACKS[c]?.stages.flatMap((s) => s.options) ?? []);
  const B = ids(b);
  return [...ids(a)].filter((x) => B.has(x));
};

/**
 * Full alignment for one career: direct-path score + dimensions, plus compromise paths
 * (each re-scored deterministically) and a recommended resolution.
 */
export function alignCareer({ careerId, rec, recs = [rec], profile, inputs, market = null, marketById = {} }) {
  const career = CAREER_BY_ID[careerId];
  const direct = directPathway(careerId, inputs);
  if (!career || !direct) return null;
  const base = evaluatePath({ careerId, pathway: direct, profile, inputs, rec, market });
  const complexity = CAREER_COSTS[careerId].pathwayComplexity;

  const paths = [{
    id: 'direct', kind: 'direct', title: 'Direct path', pathway: pathSummary(direct), score: base.score, category: base.category,
    preserves: [`Your goal of ${career.name}, by its standard route`],
    solves: [],
    tradeoffs: base.dims.filter((d) => d.status === 'conflict').map((d) => `${d.label}: ${d.reason}`),
    complexity,
  }];

  // Balanced: same career, the alternative route that aligns best with the family.
  const alternatives = buildPathways(careerId, inputs).filter((p) => p.id !== direct.id)
    .map((p) => ({ p, r: evaluatePath({ careerId, pathway: p, profile, inputs, rec, market }) }))
    .sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0));
  const bal = alternatives[0];
  if (bal && (bal.r.score ?? 0) > (base.score ?? 0)) {
    const { solves, worsens } = compare(base.dims, bal.r.dims);
    const lessStudy = bal.p.educationLevel < direct.educationLevel;
    paths.push({
      id: 'balanced', kind: 'balanced', title: 'Balanced path', pathway: pathSummary(bal.p), score: bal.r.score, category: bal.r.category,
      preserves: [`Keeps ${career.name} as the goal`],
      solves,
      tradeoffs: [
        ...(lessStudy ? ['Fewer formal postgraduate credentials; projects and certificates must carry more weight'] : []),
        ...worsens.map((w) => `${w} becomes harder`),
      ],
      complexity,
    });
  }

  // Lower-risk / bridge: start in a better-aligned shortlisted career that shares skills, then transition.
  const bridges = recs.filter((r) => r.domainId !== careerId)
    .map((r) => {
      const p = directPathway(r.domainId, inputs);
      if (!p) return null;
      const shared = sharedCourses(careerId, r.domainId);
      if (shared.length < MIN_SHARED_COURSES) return null; // needs a real skill bridge
      const res = evaluatePath({ careerId: r.domainId, pathway: p, profile, inputs, rec: r, market: marketById[r.domainId] ?? null });
      return { r, p, res, shared };
    })
    .filter(Boolean)
    .sort((a, b) => (b.res.score ?? 0) - (a.res.score ?? 0));
  const br = bridges[0];
  if (br && (br.res.score ?? 0) > Math.max(base.score ?? 0, bal?.r.score ?? 0)) {
    const via = CAREER_BY_ID[br.r.domainId].name;
    const { solves } = compare(base.dims, br.res.dims);
    paths.push({
      id: 'bridge', kind: 'bridge', title: 'Lower-risk path', viaCareerId: br.r.domainId,
      pathway: { ...pathSummary(br.p), chain: `${pathwayChain(br.p)} → transition to ${career.name}` },
      score: br.res.score, category: br.res.category,
      preserves: [`A route into ${career.name} through shared foundations (${br.shared.length} shared course${br.shared.length > 1 ? 's' : ''})`, `Earns as ${via} first`],
      solves,
      tradeoffs: [`Longer route to ${career.name}; needs a deliberate transition later`, `Starts in ${via} (your fit ${Math.round(br.r.score)}%)`],
      complexity: 'medium',
    });
  }

  // Recommended resolution: preserve the student's goal whenever a well-aligned route exists.
  const goalPaths = paths.filter((p) => p.kind !== 'bridge');
  const bestGoal = [...goalPaths].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const bridge = paths.find((p) => p.kind === 'bridge');
  const recommended = (bestGoal.score ?? 0) >= 60 || !bridge ? bestGoal : bridge;

  return {
    careerId,
    career: career.name,
    fit: Math.round(rec.score),
    score: base.score,
    category: base.category,
    coverage: base.coverage,
    tentative: base.tentative,
    dimensions: base.dims,
    aligned: base.dims.filter((d) => d.status === 'aligned'),
    conflicts: base.dims.filter((d) => d.status === 'conflict' || d.status === 'partial'),
    unknown: base.dims.filter((d) => d.status === 'unknown'),
    familyActions: familyActions(base.dims.find((d) => d.dimension === 'financial').financing, familyStance(inputs)),
    paths,
    recommendedPathId: recommended.id,
  };
}

/** Alignment for every shortlisted career (the structure the future Decision Engine consumes). */
export function alignShortlist({ recs, profile, inputs, marketById = {} }) {
  return recs
    .map((rec) => alignCareer({ careerId: rec.domainId, rec, recs, profile, inputs, market: marketById[rec.domainId] ?? null, marketById }))
    .filter(Boolean);
}
