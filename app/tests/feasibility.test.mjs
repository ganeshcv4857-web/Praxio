import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAREERS } from '../src/lib/careers.js';
import { CAREER_COSTS } from '../src/lib/feasibility/careerCosts.js';
import { CATEGORIES, FAMILY_PRIORITIES, WEIGHTS } from '../src/lib/feasibility/config.js';
import { evaluateAll, evaluateCareer, isComplete } from '../src/lib/feasibility/scoring.js';

const comfortable = {
  income_band: '10to20', education_budget: 'gt20', loan_willingness: 'yes', risk_tolerance: 'high',
  education_preference: 'phd', location_preference: 'international', relocation: 'international',
  family_priorities: ['high_salary', 'passion'],
};
const constrained = {
  income_band: 'lt3', education_budget: 'lt2', loan_willingness: 'no', risk_tolerance: 'low',
  education_preference: 'ug', location_preference: 'near_home', relocation: 'no',
  family_priorities: ['location_proximity', 'job_security'],
};

test('weights sum to 1 and categories are ordered', () => {
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(CATEGORIES.map((c) => c.min), [75, 50, 0]);
});

test('every Module 1 career has complete prototype cost data', () => {
  const priorities = new Set(FAMILY_PRIORITIES.map((p) => p.id));
  for (const c of CAREERS) {
    const d = CAREER_COSTS[c.id];
    assert.ok(d, `missing cost data for ${c.id}`);
    assert.ok(d.educationCost.low < d.educationCost.high, c.id);
    for (const p of d.alignsWith) assert.ok(priorities.has(p), `${c.id}: unknown priority ${p}`);
  }
});

test('deterministic: same inputs give the same result', () => {
  assert.deepEqual(evaluateCareer('ai-ml', comfortable), evaluateCareer('ai-ml', comfortable));
});

test('score is the weighted sum of factor scores, within 0..100', () => {
  for (const c of CAREERS) {
    for (const inputs of [comfortable, constrained]) {
      const r = evaluateCareer(c.id, inputs);
      const expected = Math.round(Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * r.factors[k].score, 0));
      assert.equal(r.score, expected, c.id);
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.equal(r.category, CATEGORIES.find((x) => r.score >= x.min).id);
    }
  }
});

test('an unconstrained family finds everything highly feasible', () => {
  for (const c of CAREERS) assert.equal(evaluateCareer(c.id, { ...comfortable, family_priorities: [] }).category, 'high', c.id);
});

test('constraints pull costly, mobile, high-study careers down more than local ones', () => {
  const civil = evaluateCareer('civil-infra', constrained);
  const research = evaluateCareer('research-academia', constrained);
  assert.ok(civil.score > research.score);
  assert.equal(research.category, 'barrier');
  assert.equal(research.factors.financial.status, 'bad');
  assert.match(research.consideration, /main consideration/i);
});

test('low income lowers the effective risk tolerance one level', () => {
  const rich = evaluateCareer('robotics', { ...comfortable, risk_tolerance: 'high' });
  const poor = evaluateCareer('robotics', { ...comfortable, risk_tolerance: 'high', income_band: 'lt3' });
  assert.equal(rich.factors.risk.score, 100);
  assert.ok(poor.factors.risk.score < 100);
  assert.match(poor.factors.risk.message, /adjusted down for family income/);
});

test('incomplete inputs produce no results; Module 1 order is kept', () => {
  assert.equal(isComplete({ income_band: 'lt3' }), false);
  assert.deepEqual(evaluateAll({ income_band: 'lt3' }, [{ domainId: 'vlsi' }]), []);
  const recs = [{ domainId: 'vlsi' }, { domainId: 'software-eng' }, { domainId: 'unknown' }];
  assert.deepEqual(evaluateAll(comfortable, recs).map((r) => r.domainId), ['vlsi', 'software-eng']);
});
