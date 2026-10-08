// Module 2 feasibility engine. Pure, deterministic functions: the same inputs + dataset
// + config always give the same result, so stored inputs fully reproduce stored scores.
//
//   feasibility = Σ weight_f × score_f        f ∈ financial, education, risk, location, family
//   …then gated by academic eligibility when supplied (closed → capped below moderate)
//
// Each factor is scored 0–100 and carries a status (good / warn / bad) and a message
// built only from the inputs and dataset values. No LLM is involved.

import {
  BUDGET_BANDS, CATEGORIES, EDUCATION_OPTIONS, FACTOR_STATUS, FAMILY_FLOOR, FAMILY_NEUTRAL_SCORE,
  FAMILY_PRIORITIES, LEVEL_GAP_SCORES, LOAN_OPTIONS, LOW_INCOME_BANDS, PRIORITIES_ALWAYS_MET,
  RELOCATION_OPTIONS, RISK_LEVELS, WEIGHTS, byId,
} from './config.js';
import { CAREER_COSTS, LEVEL_INDEX, LEVEL_LABEL, formatCostRange, formatLakh } from './careerCosts.js';
import { financingPlan } from './financing.js';

export const FACTORS = [
  { id: 'financial', label: 'Financial' },
  { id: 'education', label: 'Education' },
  { id: 'risk', label: 'Risk' },
  { id: 'location', label: 'Location' },
  { id: 'family', label: 'Family priorities' },
];

// Academic eligibility is a gate, not a weighted factor: it's added only when the caller
// supplies an eligibility result (lib/academic/eligibility.js) for the career. A closed
// result caps the score below "moderate"; unclear never lowers the score (unknown ≠ closed).
export const ELIGIBILITY_FACTOR = { id: 'eligibility', label: 'Academic eligibility' };
/** The factors to show for a result: eligibility first when it was evaluated. */
export const factorsFor = (result) => (result?.factors?.eligibility ? [ELIGIBILITY_FACTOR, ...FACTORS] : FACTORS);

const QUAL_NAME = { class_10: 'Class 10', class_12: 'Class 12' };
const join = (xs) => [...new Set(xs)].join(', ');

export function eligibilityFactor(e) {
  const routes = e.routes ?? [];
  const remedies = routes.flatMap((r) => r.remedies ?? []);
  const viable = routes.filter((r) => r.status === 'eligible' || r.status === 'open').map((r) => r.label);
  switch (e.status) {
    case 'eligible':
      return { score: 100, status: 'good', word: 'Open', message: `You meet the entry requirements for ${join(viable)}.` };
    case 'open':
      return { score: 100, status: 'good', word: 'Open', message: `Your planned stream keeps ${join(viable)} open.` };
    case 'not_eligible':
      return { score: 0, status: 'bad', word: 'Closed', message: `Your academic record doesn’t meet the entry requirements for ${join(routes.map((r) => r.label))}.` };
    case 'needs_subject': {
      const subj = remedies.filter((m) => m.type === 'take_subject').map((m) => m.label ?? m.subject);
      return { score: null, status: 'warn', word: 'Needs a subject', message: subj.length ? `Needs ${join(subj)} in Class 11–12 to keep a route open.` : 'Needs a specific subject in Class 11–12.' };
    }
    case 'no_catalogued_route':
      return { score: null, status: 'warn', word: 'Unclear', message: 'Entry routes for this career aren’t catalogued yet, so eligibility is unknown.' };
    default: {
      const add = remedies.filter((m) => m.type === 'add_record').map((m) => QUAL_NAME[m.qualification] ?? 'academic');
      const fix = remedies.filter((m) => ['complete_record', 'fix_record', 'confirm_subject_list', 'clarify_subject'].includes(m.type)).map((m) => QUAL_NAME[m.qualification] ?? 'academic');
      const message = add.length ? `Unclear until you add your ${join(add)} marks.`
        : fix.length ? `Unclear until your ${join(fix)} record is complete.`
          : 'Unclear: entry rules are set by each institution, so check theirs.';
      return { score: null, status: 'warn', word: 'Unclear', message };
    }
  }
}

// Per extra level of study the student isn't planning, by how much the field expects it.
const EDUCATION_GAP_PENALTY = { low: 15, medium: 25, high: 40 };

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const statusOf = (score) => (score >= FACTOR_STATUS.good ? 'good' : score >= FACTOR_STATUS.warn ? 'warn' : 'bad');
const gapScore = (gap) => (gap <= 0 ? 100 : LEVEL_GAP_SCORES[Math.min(gap, LEVEL_GAP_SCORES.length - 1)]);
const listLabels = (ids) => ids.map((id) => byId(FAMILY_PRIORITIES, id)?.label.toLowerCase() ?? id).join(', ');

export function isComplete(inputs) {
  return Boolean(
    // location_preference is no longer required: no factor uses it (retired in assessment-v2).
    inputs && inputs.income_band && inputs.education_budget && inputs.loan_willingness && inputs.risk_tolerance &&
    inputs.education_preference && inputs.relocation
  );
}

/** The student's effective capacities, derived once from their inputs. */
export function studentCapacity(inputs) {
  const budget = byId(BUDGET_BANDS, inputs.education_budget)?.value ?? 0;
  const loan = byId(LOAN_OPTIONS, inputs.loan_willingness)?.value ?? 0;
  const statedRisk = byId(RISK_LEVELS, inputs.risk_tolerance)?.level ?? 0;
  const lowIncome = LOW_INCOME_BANDS.includes(inputs.income_band);
  return {
    budget,
    loan,
    fundingCap: budget + loan,
    statedRisk,
    lowIncome,
    effectiveRisk: Math.max(0, statedRisk - (lowIncome ? 1 : 0)),
    educationLevel: byId(EDUCATION_OPTIONS, inputs.education_preference)?.level ?? 0,
    mobility: byId(RELOCATION_OPTIONS, inputs.relocation)?.level ?? 0,
    priorities: inputs.family_priorities ?? [],
  };
}

/** e.g. '₹6L' or '₹6L incl. a ₹4L loan' */
const available = (cap) => (cap.loan ? `${formatLakh(cap.fundingCap)} incl. a ${formatLakh(cap.loan)} loan` : formatLakh(cap.fundingCap));

function financialFactor(cost, cap) {
  const { low, high } = cost.educationCost;
  const range = formatCostRange(cost.educationCost);
  let score;
  let message;
  if (cap.fundingCap >= high) {
    score = 100;
    message = `Fits within your stated education budget (${available(cap)} vs typical ${range})`;
  } else if (cap.fundingCap >= low) {
    score = 50 + (50 * (cap.fundingCap - low)) / (high - low);
    message = `${available(cap)} covers the lower end of the typical ${range}; pricier colleges or programmes would stretch it`;
  } else {
    score = (50 * cap.fundingCap) / low;
    message = `Typical cost (${range}) is above the ${available(cap)} your family can fund`;
  }
  return { score: clamp(score), message };
}

function educationFactor(cost, cap) {
  const needed = byId(EDUCATION_OPTIONS, cost.typicalEducation);
  const gap = needed.level - cap.educationLevel;
  if (gap <= 0) return { score: 100, message: 'Your preferred education path supports this career' };
  const qualifier = { high: 'usually expected', medium: 'common, though not always required', low: 'sometimes useful' }[
    cost.higherStudyImportance
  ];
  return {
    score: clamp(100 - gap * EDUCATION_GAP_PENALTY[cost.higherStudyImportance]),
    message: `This path typically involves "${needed.label.replace(/^Open to /, '')}" (${qualifier}), beyond what you currently plan`,
  };
}

// Pathway risk = the career's financial risk, raised one level when financing it leaves a
// HIGH long-term repayment burden (existing risk model + financing burden).
function riskFactor(cost, cap, plan) {
  const burdenBump = plan?.repayment.burden === 'high' ? 1 : 0;
  const careerRisk = Math.min(2, LEVEL_INDEX[cost.financialRisk] + burdenBump);
  const riskName = ['Low', 'Medium', 'High'][careerRisk];
  const tolerance = RISK_LEVELS[cap.effectiveRisk].label.toLowerCase();
  const note = (cap.lowIncome && cap.statedRisk > cap.effectiveRisk ? ' (adjusted down for family income)' : '')
    + (burdenBump ? ' (includes a high loan-repayment burden)' : '');
  if (careerRisk <= cap.effectiveRisk) {
    return { score: 100, message: `${riskName} pathway risk matches your family's ${tolerance} risk tolerance${note}` };
  }
  return {
    score: gapScore(careerRisk - cap.effectiveRisk),
    message: `${riskName} pathway risk is above your family's ${tolerance} risk tolerance${note}`,
  };
}

function locationFactor(cost, cap) {
  const need = LEVEL_INDEX[cost.relocationRequirement];
  const gap = need - cap.mobility;
  if (need === 0) return { score: 100, message: 'Opportunities exist in most regions, including near home' };
  if (gap <= 0) {
    return {
      score: 100,
      message: need === 2
        ? 'Opportunities cluster in a few hubs or abroad, and you are open to moving'
        : 'Some opportunities may require relocation, which you are open to',
    };
  }
  return {
    score: gapScore(gap),
    message: need === 2
      ? 'Opportunities cluster in a few hubs or abroad; this needs more relocation than you prefer'
      : 'Some opportunities may require relocation beyond what you prefer',
  };
}

function familyFactor(cost, cap) {
  const selected = cap.priorities;
  if (!selected.length) return { score: FAMILY_NEUTRAL_SCORE, message: 'No family priorities selected', met: [], unmet: [] };
  const offered = new Set([...cost.alignsWith, ...PRIORITIES_ALWAYS_MET]);
  const met = selected.filter((p) => offered.has(p));
  const unmet = selected.filter((p) => !offered.has(p));
  const score = FAMILY_FLOOR + ((100 - FAMILY_FLOOR) * met.length) / selected.length;
  let message = met.length ? `Aligns with ${listLabels(met)}` : 'Does not typically match the priorities you selected';
  if (met.length && unmet.length) message += `; less typical for ${listLabels(unmet)}`;
  return { score: clamp(score), message, met, unmet };
}

const CONSIDERATION = {
  financial: (cost, cap) => {
    const range = formatCostRange(cost.educationCost);
    const gap = cap.fundingCap < cost.educationCost.low
      ? `the typical ${range} is above the ${available(cap)} currently available`
      : `the ${available(cap)} currently available covers only the lower end of the typical ${range}`;
    const help = cap.loan === 0 ? 'Government colleges, scholarships or an education loan' : 'Government colleges or scholarships';
    return `the cost of the pathway: ${gap}. ${help} would make this easier.`;
  },
  education: (cost) =>
    `the length of study: this field ${cost.higherStudyImportance === 'high' ? 'usually expects' : 'often rewards'} postgraduate study, beyond your current plan.`,
  risk: (cost) =>
    `risk: the ${cost.financialRisk} financial risk of this pathway is above your family's comfort level.`,
  location: () => 'location: opportunities are concentrated in specific hubs, so it needs more relocation than you prefer.',
  family: (_cost, _cap, f) => `family priorities: this career is less typically associated with ${listLabels(f.unmet)}.`,
};

/**
 * Evaluate one career. Returns null for careers without dataset entries.
 * `eligibility` (optional): this career's academic eligibility result; adds the gate factor.
 */
export function evaluateCareer(domainId, inputs, eligibility = null) {
  const cost = CAREER_COSTS[domainId];
  if (!cost) return null;
  const cap = studentCapacity(inputs);
  // Financing plan for the typical (midpoint) cost of this career's pathway.
  const typicalCost = Math.round((cost.educationCost.low + cost.educationCost.high) / 2);
  const typicalLevel = byId(EDUCATION_OPTIONS, cost.typicalEducation)?.level ?? 0;
  const financing = financingPlan(typicalCost, inputs, { relocationLevel: LEVEL_INDEX[cost.relocationRequirement], educationLevel: typicalLevel });

  const raw = {
    financial: financialFactor(cost, cap),
    education: educationFactor(cost, cap),
    risk: riskFactor(cost, cap, financing),
    location: locationFactor(cost, cap),
    family: familyFactor(cost, cap),
  };
  const factors = Object.fromEntries(
    FACTORS.map(({ id }) => [id, { ...raw[id], status: statusOf(raw[id].score), weight: WEIGHTS[id] }])
  );
  const weighted = clamp(FACTORS.reduce((s, { id }) => s + WEIGHTS[id] * factors[id].score, 0));
  const elig = eligibility ? { ...eligibilityFactor(eligibility), weight: 0, gate: true } : null;
  if (elig) factors.eligibility = elig;
  const closed = elig?.status === 'bad';
  const moderateMin = CATEGORIES.find((c) => c.id === 'moderate').min;
  const score = closed ? Math.min(weighted, moderateMin - 1) : weighted;
  const category = CATEGORIES.find((c) => score >= c.min);

  // Key consideration: a closed eligibility gate first, else the factor costing the most
  // weighted points, else an unclear eligibility.
  const byCost = [...FACTORS].sort(
    (a, b) => WEIGHTS[b.id] * (100 - factors[b.id].score) - WEIGHTS[a.id] * (100 - factors[a.id].score)
  )[0].id;
  const weakest = closed || (elig && factors[byCost].status === 'good' && elig.status !== 'good') ? 'eligibility' : byCost;
  const hasIssue = factors[weakest].status !== 'good';
  const lead = category.id === 'high'
    ? 'Your career interest and family constraints are largely aligned.'
    : category.id === 'moderate'
      ? 'This path is achievable, with some practical trade-offs.'
      : 'This path faces significant practical barriers right now.';
  const consideration = closed
    ? `This path is closed academically right now. ${elig.message} Other careers on your list may still be open.`
    : weakest === 'eligibility' && hasIssue
      ? `${lead} The open question is academic eligibility: ${elig.message.charAt(0).toLowerCase()}${elig.message.slice(1)}`
      : hasIssue
        ? `${lead} The main consideration is ${CONSIDERATION[weakest](cost, cap, factors[weakest])}`
        : `${lead} Nothing you told us stands in the way.`;

  return {
    domainId,
    score,
    ...(closed ? { scoreBeforeEligibility: weighted } : {}),
    category: category.id,
    factors,
    weakest: hasIssue ? weakest : null,
    consideration,
    financing,
  };
}

/** Evaluate every recommended career (Module 1 shortlist), keeping Module 1's order. */
export function evaluateAll(inputs, recs, eligibilityById = null) {
  if (!isComplete(inputs)) return [];
  return recs.map((r) => evaluateCareer(r.domainId, inputs, eligibilityById?.[r.domainId] ?? null)).filter(Boolean);
}

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
