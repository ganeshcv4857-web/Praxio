// Financing & action-dependency model (deterministic).
//
//   FINANCIAL REQUIREMENT → FUNDING MECHANISM → RESPONSIBLE PARTY → TIMING → REQUIRED ACTION → BURDEN
//
// Separates what can be paid upfront, how any gap is financed (loan / scholarship), who has
// to act, and the long-term repayment burden. "Cost above the upfront budget" is NOT the
// same as "infeasible": a gap a willing loan can cover is "financed", and one that only a
// scholarship or an undecided loan could close is "conditional". Only an unfinanced
// remainder is a real "gap".

import {
  BURDEN_THRESHOLDS, FINANCING_DEFAULTS, INCOME_REFERENCE, LOAN_OPTIONS, byId,
} from './config.js';
import { studentCapacity } from './scoring.js';

const PAYER_PARTY = { family: 'family', self: 'student', shared: 'student+family' };

export const FINANCING_STATUS = {
  funded: { label: 'Can be paid upfront', tone: 'good' },
  financed: { label: 'Financed with an education loan', tone: 'good' },
  conditional: { label: 'Depends on a loan or scholarship being secured', tone: 'warn' },
  gap: { label: 'Part of the cost has no funding source yet', tone: 'bad' },
};

/** Burden of repaying `loan` relative to household income: low | medium | high. */
export function repaymentBurden(loan, incomeBand) {
  if (!loan) return null;
  const ratio = loan / (INCOME_REFERENCE[incomeBand] ?? INCOME_REFERENCE['3to6']);
  return ratio < BURDEN_THRESHOLDS.low ? 'low' : ratio < BURDEN_THRESHOLDS.medium ? 'medium' : 'high';
}

/**
 * Financing plan for a cost.
 *   cost            total pathway / education cost (₹)
 *   inputs          Module 2 answers (+ primary_funder, scholarship_interest; defaults apply)
 *   relocationLevel 0 none, 1 within India, 2 abroad / few hubs (pathway or career)
 *   educationLevel  postgraduate level the pathway commits to (0 = none)
 */
export function financingPlan(cost, inputs, { relocationLevel = 0, educationLevel = 0 } = {}) {
  const cap = studentCapacity(inputs);
  const funder = inputs.primary_funder ?? FINANCING_DEFAULTS.primary_funder;
  const scholarship = inputs.scholarship_interest ?? FINANCING_DEFAULTS.scholarship_interest;
  const loanState = inputs.loan_willingness ?? 'no'; // yes | maybe | no
  const loanLimit = byId(LOAN_OPTIONS, loanState)?.value ?? 0;

  const upfront = Math.min(cost, cap.budget);
  const immediateGap = Math.max(0, cost - cap.budget);
  const loanUsed = loanState === 'no' ? 0 : Math.min(immediateGap, loanLimit);
  const remainingGap = immediateGap - loanUsed;

  let status;
  if (immediateGap === 0) status = 'funded';
  else if (remainingGap === 0) status = loanState === 'yes' ? 'financed' : 'conditional';
  else status = scholarship !== 'no' ? 'conditional' : 'gap';

  const mechanisms = [];
  if (upfront > 0) mechanisms.push(funder);
  if (loanUsed > 0) mechanisms.push('education_loan');
  if (remainingGap > 0 && scholarship !== 'no') mechanisms.push('scholarship');
  const mechanism = mechanisms.length > 1 ? 'mixed' : mechanisms[0] ?? funder;

  const burden = repaymentBurden(loanUsed, inputs.income_band);
  const payer = PAYER_PARTY[funder];

  // Generic action-dependency list: what must happen, who does it, when.
  const actions = [
    { id: 'admission', label: 'Secure admission / enrol', party: 'student', requirement: 'required', timing: 'before_start' },
  ];
  if (upfront > 0) actions.push({ id: 'upfront_funding', label: 'Pay the upfront cost', party: payer, requirement: 'required', timing: 'before_start' });
  if (loanUsed > 0) {
    actions.push({ id: 'loan_application', label: 'Apply for an education loan', party: 'student+family', note: 'Indian education loans usually need a parent/guardian co-applicant', requirement: loanState === 'yes' ? 'required' : 'conditional', timing: 'before_start' });
    actions.push({ id: 'loan_repayment', label: 'Repay the loan', party: 'student+family', requirement: 'required', timing: 'after_study' });
  }
  if (scholarship !== 'no' || remainingGap > 0) {
    actions.push({ id: 'scholarship', label: 'Apply for scholarships', party: 'student', requirement: remainingGap > 0 ? 'conditional' : 'optional', timing: 'before_start' });
  }
  if (relocationLevel > 0) actions.push({ id: 'relocation', label: relocationLevel === 2 ? 'Move to another city or abroad' : 'Move to a city hub', party: 'student+family', requirement: 'conditional', timing: 'during_study' });
  if (educationLevel > 0) actions.push({ id: 'higher_studies', label: 'Commit to postgraduate study', party: 'student+family', requirement: 'conditional', timing: 'after_degree' });

  const involvesFamily = (a) => a.party.includes('family');
  return {
    cost,
    status,
    statusLabel: FINANCING_STATUS[status].label,
    mechanism,
    primaryFunder: funder,
    immediateGap,       // internal — UI shows qualitative wording only
    loanUsed,
    remainingGap,
    loanState,
    scholarship,
    repayment: { required: loanUsed > 0, burden, by: loanUsed > 0 ? 'student+family' : null },
    actions,
    familyActionRequired: actions.some((a) => involvesFamily(a) && a.requirement !== 'optional'),
    studentOnly: actions.every((a) => !involvesFamily(a)),
  };
}

/** Plain-language one-liner (no family amounts). */
export function financingSummary(plan) {
  const who = { family: 'your family', self: 'you', shared: 'you and your family' }[plan.primaryFunder];
  if (plan.status === 'funded') return `Upfront cost can be covered by ${who}.`;
  const loan = plan.loanUsed > 0 ? `an education loan covers ${plan.status === 'conditional' && plan.loanState === 'maybe' ? 'the rest, if you decide to take one' : 'the rest'}` : '';
  const rep = plan.repayment.burden ? ` Repayment burden: ${plan.repayment.burden}.` : '';
  if (plan.status === 'financed' || (plan.status === 'conditional' && plan.remainingGap === 0)) return `${who[0].toUpperCase()}${who.slice(1)} cover${plan.primaryFunder === 'family' ? 's' : ''} part upfront; ${loan}.${rep}`;
  if (plan.status === 'conditional') return `Part of the cost would need a scholarship${plan.loanUsed ? ` on top of ${loan.replace('covers the rest', 'a loan')}` : ''}; not yet secured.${rep}`;
  return `Part of the cost has no funding source yet${plan.loanState === 'no' ? '; an education loan or scholarship could close it' : ''}.${rep}`;
}
