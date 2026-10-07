// Review 1 refinements: stage-aware context, financing/action model, action-aware alignment.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { userContext, STAGE_PROFILES, LEGACY_DEFAULT_STAGE } = await import('../src/lib/userContext.js');
const { stageGuidance } = await import('../src/lib/stageGuidance.js');
const { financingPlan, repaymentBurden, financingSummary } = await import('../src/lib/feasibility/financing.js');
const { evaluateCareer } = await import('../src/lib/feasibility/scoring.js');
const E = await import('../src/lib/alignment/engine.js');
const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');

const L = 100000;
const kinds = (g) => g.steps.map((s) => s.kind);
const base = {
  income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate',
  education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [],
  primary_funder: 'family', scholarship_interest: 'no',
};

// ------------------------------------------------------------------ user context (1–6)
test('1. Class 10: stream exploration, no career-preference sliders', () => {
  const ctx = userContext({ current_stage: 'school_10' });
  assert.equal(ctx.headline, 'Explore your direction');
  assert.ok(!ctx.steps.includes('preferences'));
  assert.equal(ctx.goal, 'explore_careers');
  const g = stageGuidance({ careerId: 'software-eng', ctx });
  assert.equal(kinds(g)[0], 'stream');
  assert.match(g.steps[0].text, /Science \(PCM\).*Class 11/);
  assert.match(g.headline, /^This field may suit you/);
});

test('2. Class 11/12: degree and entrance-exam pathway; flags a stream mismatch', () => {
  for (const stage of ['school_11', 'school_12']) {
    const ctx = userContext({ current_stage: stage, school_stream: 'pcm' });
    assert.equal(ctx.headline, 'Plan your next education step');
    assert.ok(ctx.asks.stream);
    const g = stageGuidance({ careerId: 'vlsi', ctx });
    assert.deepEqual(kinds(g), ['degree', 'exam']);
    assert.match(g.steps[1].text, /JEE Main/);
  }
  const commerce = stageGuidance({ careerId: 'vlsi', ctx: userContext({ current_stage: 'school_12', school_stream: 'commerce' }) });
  assert.equal(commerce.steps[0].kind, 'note');
  assert.match(commerce.steps[0].text, /Usually entered via Science \(PCM\)/);
});

test('3. Undergraduate: skills and projects (and the legacy default)', () => {
  const ctx = userContext({ current_stage: 'undergraduate', primary_goal: 'internship' });
  assert.equal(ctx.headline, 'Build toward your career');
  const g = stageGuidance({ careerId: 'data-science', ctx });
  assert.ok(kinds(g).includes('skill') && kinds(g).includes('project'));
  assert.match(g.steps.at(-1).text, /internship\/placement/);
  const legacy = userContext({ full_name: 'Old user' });
  assert.equal(legacy.stage, LEGACY_DEFAULT_STAGE);
  assert.equal(legacy.isLegacy, true);
});

test('4. Graduate (unemployed): employer-relevant skill gaps', () => {
  const ctx = userContext({ current_stage: 'graduate_unemployed' });
  assert.equal(ctx.headline, 'Close your skill gap and become job-ready');
  assert.equal(ctx.activity, 'looking_for_job');
  const marketGap = { items: [{ skill: 'Machine Learning', category: 'core', status: 'missing' }, { skill: 'Python', category: 'core', status: 'demonstrated' }] };
  const g = stageGuidance({ careerId: 'data-science', ctx, marketGap });
  assert.equal(kinds(g)[0], 'gap');
  assert.match(g.steps[0].text, /Machine Learning/);
  assert.doesNotMatch(g.steps[0].text, /Python/, 'demonstrated skills are not listed as gaps');
  assert.equal(g.basis, 'Career Fit + market skill gap');
});

test('5. Working professional: growth, role asked, transferable skills', () => {
  const ctx = userContext({ current_stage: 'employed_professional', current_role: 'QA engineer' });
  assert.equal(ctx.headline, 'Plan your career growth');
  assert.ok(ctx.asks.role && !ctx.asks.year);
  const g = stageGuidance({ careerId: 'software-eng', ctx, demonstrated: ['Python', 'Functions'] });
  assert.equal(g.steps[0].kind, 'transfer');
  assert.match(g.steps[0].text, /Python/);
});

test('6. Career switcher: transition plan; role used when nothing demonstrated', () => {
  const ctx = userContext({ current_stage: 'career_switcher', current_role: 'Sales executive' });
  assert.equal(ctx.headline, 'Plan your career transition');
  assert.equal(ctx.goal, 'career_switch');
  const g = stageGuidance({ careerId: 'data-science', ctx });
  assert.match(g.steps[0].text, /Sales executive/);
  assert.ok(kinds(g).includes('transition'));
  for (const s of Object.keys(STAGE_PROFILES)) assert.ok(userContext({ current_stage: s }).headline, s);
});

// ------------------------------------------------------------------ financing / actions (7–15)
test('7. Fully family funded', () => {
  const p = financingPlan(3 * L, base);
  assert.equal(p.status, 'funded');
  assert.equal(p.mechanism, 'family');
  assert.equal(p.immediateGap, 0);
  assert.equal(p.loanUsed, 0);
  assert.equal(p.actions.find((a) => a.id === 'upfront_funding').party, 'family');
  assert.ok(!p.actions.some((a) => a.id === 'loan_application'));
});

test('8. Loan funded: achievable with a financing dependency, not "infeasible"', () => {
  const p = financingPlan(12 * L, { ...base, loan_willingness: 'yes' });
  assert.equal(p.status, 'financed');
  assert.equal(p.loanUsed, 7 * L);
  assert.equal(p.remainingGap, 0);
  assert.equal(p.actions.find((a) => a.id === 'loan_application').requirement, 'required');
  assert.match(financingSummary(p), /education loan covers the rest/);
});

test('9. Mixed funding: ₹5L = ₹2L upfront + ₹3L education loan', () => {
  const p = financingPlan(5 * L, { ...base, education_budget: 'lt2', loan_willingness: 'yes' });
  assert.equal(p.immediateGap, 3 * L);
  assert.equal(p.loanUsed, 3 * L);
  assert.equal(p.mechanism, 'mixed');
  assert.equal(p.status, 'financed');
});

test('10. Scholarship-supported: scholarship closes the rest only conditionally', () => {
  const p = financingPlan(20 * L, { ...base, loan_willingness: 'maybe', scholarship_interest: 'yes' });
  assert.equal(p.status, 'conditional');
  assert.ok(p.remainingGap > 0);
  assert.equal(p.mechanism, 'mixed');
  const s = p.actions.find((a) => a.id === 'scholarship');
  assert.equal(s.party, 'student');
  assert.equal(s.requirement, 'conditional');
});

test('11. Immediate gap with viable financing; an undecided loan is conditional', () => {
  const yes = financingPlan(9 * L, { ...base, loan_willingness: 'yes' });
  assert.ok(yes.immediateGap > 0 && yes.status === 'financed');
  const maybe = financingPlan(8 * L, { ...base, loan_willingness: 'maybe' });
  assert.equal(maybe.remainingGap, 0);
  assert.equal(maybe.status, 'conditional');
  assert.equal(maybe.actions.find((a) => a.id === 'loan_application').requirement, 'conditional');
});

test('12. Immediate gap with no financing option is a real gap', () => {
  const p = financingPlan(9 * L, base);
  assert.equal(p.status, 'gap');
  assert.equal(p.remainingGap, p.immediateGap);
  assert.equal(p.actions.find((a) => a.id === 'scholarship').requirement, 'conditional');
  assert.match(financingSummary(p), /no funding source yet/);
});

test('13. Family action required: loan co-applicant, relocation, higher studies', () => {
  const p = financingPlan(9 * L, { ...base, loan_willingness: 'yes' }, { relocationLevel: 2, educationLevel: 1 });
  assert.equal(p.familyActionRequired, true);
  assert.equal(p.actions.find((a) => a.id === 'loan_application').party, 'student+family');
  assert.equal(p.actions.find((a) => a.id === 'relocation').party, 'student+family');
  assert.equal(p.actions.find((a) => a.id === 'higher_studies').timing, 'after_degree');
  assert.equal(p.studentOnly, false);
});

test('14. Student-only: self-funded within budget, no family action', () => {
  const p = financingPlan(2 * L, { ...base, primary_funder: 'self' });
  assert.equal(p.studentOnly, true);
  assert.equal(p.familyActionRequired, false);
  assert.equal(p.actions.find((a) => a.id === 'upfront_funding').party, 'student');
});

test('15. Long-term repayment burden is assessed separately and raises pathway risk', () => {
  assert.equal(repaymentBurden(0, 'lt3'), null);
  assert.equal(repaymentBurden(1 * L, 'gt20'), 'low');
  assert.equal(repaymentBurden(10 * L, 'lt3'), 'high');
  const inputs = { ...base, income_band: 'lt3', education_budget: 'lt2', loan_willingness: 'yes', risk_tolerance: 'high' };
  const r = evaluateCareer('quant-finance', inputs);
  assert.equal(r.financing.repayment.burden, 'high');
  assert.match(r.factors.risk.message, /high loan-repayment burden/);
  const p = r.financing.actions.find((a) => a.id === 'loan_repayment');
  assert.equal(p.timing, 'after_study');
});

// ------------------------------------------------------------------ alignment (16–19)
const rec = (domainId, score) => ({ domainId, score, rank: 1 });
const align = (careerId, inputs, score = 90, profile = {}) => E.alignCareer({ careerId, rec: rec(careerId, score), profile, inputs });

test('16. Family supports the required action (loan co-applicant)', () => {
  const a = align('product-management', { ...base, education_budget: '5to10', loan_willingness: 'yes' }); // MBA route needs a loan
  const loan = a.familyActions.find((x) => x.id === 'loan_application');
  assert.equal(loan.support, 'supported');
  assert.equal(E.statusOf(a.dimensions.find((d) => d.dimension === 'financial').score), 'aligned');
  assert.ok(!a.familyActions.some((x) => x.id === 'admission'), 'student-only actions are not family actions');
});

test('17. Family does not support the required action (relocation, unfunded remainder)', () => {
  const a = align('quant-finance', { ...base, education_budget: 'lt2', family_priorities: ['location_proximity'] });
  assert.equal(a.familyActions.find((x) => x.id === 'relocation').support, 'not_supported');
  const rest = a.familyActions.find((x) => x.id === 'fund_remaining');
  assert.ok(!rest || rest.support === 'not_supported');
  const higher = align('research-academia', { ...base, family_priorities: ['job_security'] }).familyActions.find((x) => x.id === 'higher_studies');
  assert.equal(higher.support, 'not_supported');
});

test('18. Strong Career Fit + pathway/family conflict: fit untouched, alignment low', () => {
  const inputs = { ...base, risk_tolerance: 'low', education_budget: 'lt2', family_priorities: ['job_security', 'financial_stability', 'location_proximity'] };
  const a = align('quant-finance', inputs, 95);
  assert.equal(a.fit, 95, 'Career Fit is reported as-is, never adjusted');
  assert.ok(a.score < 60, `alignment ${a.score}`);
  assert.ok(a.conflicts.length >= 2);
});

test('19. Strong Career Fit + aligned pathway', () => {
  const a = align('software-eng', { ...base, education_budget: 'gt20', family_priorities: ['job_security', 'financial_stability'] }, 92, { preferences: { pref_stability: 70 } });
  assert.ok(a.score >= 80, `alignment ${a.score}`);
  assert.equal(a.category.id, 'strong');
  assert.ok(a.familyActions.every((x) => x.support !== 'not_supported'));
});

// ------------------------------------------------------------------ decision inputs boundary
test('decision inputs bundle carries context, fit, feasibility+financing, alignment+actions, guidance', () => {
  const profile = { current_stage: 'graduate_unemployed', primary_goal: 'find_job', branch: 'cse', interests: { int_data_ai: 5 }, aptitude: { apt_quant: 5 }, preferences: {}, traits: {} };
  const recs = shortlist(rankCareers(profile)).map((r) => ({ ...r }));
  const b = buildDecisionInputs({ profile, recs, inputs: { ...base, loan_willingness: 'yes' } });
  assert.deepEqual([b.context.stage, b.context.goal], ['graduate_unemployed', 'find_job']);
  const c = b.careers[0];
  assert.equal(c.careerFit, recs[0].score);
  assert.ok(c.feasibility.financing && c.alignment.familyActions && c.stageNextSteps.steps.length);
  assert.equal(c.market, null, 'no market data → null, not invented');
});
