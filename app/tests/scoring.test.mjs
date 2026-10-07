import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAREERS } from '../src/lib/careers.js';
import { FEATURE_LABELS, buildFeatures } from '../src/lib/features.js';
import { rankCareers, scoreDomain, shortlist, SHORTLIST_MAX, SHORTLIST_MIN } from '../src/lib/scoring.js';
import { scoreQuiz, APTITUDE_QUIZ } from '../src/lib/quiz.js';

const flat = (keys, v) => Object.fromEntries(keys.map((k) => [k, v]));

// A software-leaning CSE student.
const coder = {
  branch: 'cse',
  interests: { ...flat(['int_software', 'int_data_ai', 'int_electronics', 'int_mechanical', 'int_infrastructure', 'int_design', 'int_business', 'int_people', 'int_research', 'int_security', 'int_bio', 'int_sustainability', 'int_finance'], 2), int_software: 5 },
  aptitude: { apt_logical: 5, apt_quant: 3, apt_verbal: 3, apt_spatial: 3, apt_programming: 5 },
  aptitude_quiz: {},
  preferences: { pref_team: 50, pref_research: 20, pref_stability: 50, pref_hands_on: 10, pref_coding: 100, pref_study: 30 },
  traits: { tr_curiosity: 4, tr_detail: 3, tr_sociability: 2, tr_persistence: 4, tr_creativity: 3, tr_risk: 2 },
};

// A hands-on mechanical student.
const maker = {
  branch: 'mech',
  interests: { ...coder.interests, int_software: 2, int_mechanical: 5 },
  aptitude: { apt_logical: 3, apt_quant: 3, apt_verbal: 3, apt_spatial: 5, apt_programming: 2 },
  aptitude_quiz: {},
  preferences: { ...coder.preferences, pref_hands_on: 100, pref_coding: 10 },
  traits: { ...coder.traits, tr_detail: 5 },
};

test('every weight references a known feature', () => {
  for (const c of CAREERS) {
    for (const f of Object.keys(c.weights)) assert.ok(FEATURE_LABELS[f], `${c.id} uses unknown feature ${f}`);
  }
});

test('catalog ids are unique and roadmaps are complete', () => {
  assert.equal(new Set(CAREERS.map((c) => c.id)).size, CAREERS.length);
  for (const c of CAREERS) {
    assert.ok(c.roadmap.phases.length >= 3 && c.roadmap.nextSteps.length >= 3, c.id);
  }
});

test('scores are within 0..100 and contributions sum to the score', () => {
  for (const r of rankCareers(coder)) {
    assert.ok(r.score >= 0 && r.score <= 100);
    const sum = r.breakdown.reduce((s, b) => s + b.contribution, 0);
    assert.ok(Math.abs(sum - r.score) < 0.6, `${r.domainId}: ${sum} vs ${r.score}`);
  }
});

test('profiles rank the expected domains on top', () => {
  assert.equal(rankCareers(coder)[0].domainId, 'software-eng');
  assert.equal(rankCareers(maker)[0].domainId, 'core-mech');
});

test('no padding: unanswered features lower coverage instead of inventing values', () => {
  const partial = { branch: 'cse', interests: { int_software: 5 }, aptitude: {}, preferences: {}, traits: {} };
  const se = CAREERS.find((c) => c.id === 'software-eng');
  const r = scoreDomain(buildFeatures(partial), se, partial.branch);
  assert.ok(r.coverage < 0.5);
  assert.deepEqual(r.breakdown.map((b) => b.feature).sort(), ['branch_fit', 'int_software']);
  // An empty profile scores 0 rather than a flattering default.
  assert.equal(scoreDomain({}, CAREERS.find((c) => c.id === 'ux-design'), null).score, 0);
});

test('shortlist returns between 5 and 8 ranked domains', () => {
  for (const p of [coder, maker]) {
    const s = shortlist(rankCareers(p));
    assert.ok(s.length >= SHORTLIST_MIN && s.length <= SHORTLIST_MAX, String(s.length));
    s.forEach((r, i) => assert.equal(r.rank, i + 1));
  }
});

test('quiz blends with self-rating 50/50', () => {
  const allRight = APTITUDE_QUIZ.map((q) => q.correct);
  const measured = scoreQuiz(allRight);
  assert.equal(measured.apt_quant, 100);
  const f = buildFeatures({ aptitude: { apt_quant: 1 }, aptitude_quiz: measured });
  assert.equal(f.apt_quant, 50);
  assert.equal(scoreQuiz([null, null]).apt_logical, undefined);
});
