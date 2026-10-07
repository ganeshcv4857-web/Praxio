// Project evaluation: validation, weighted scoring, demonstrated skills and rewards.
// Whoever proposes criterion scores (Gemini or the automated check), the final total,
// pass/fail, demonstrated skills and points are always computed here.

import {
  EVALUATION_CRITERIA, EVALUATION_WEIGHTS, MIN_CONCEPT_SCORE, PASS_SCORE, REWARD_TIERS,
} from './config.js';

// ------------------------------------------------------------------ submission
const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;

export function parseGithubUrl(url) {
  const m = String(url ?? '').trim().match(GITHUB_REPO);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function validateSubmission({ github_url, demo_url, explanation }) {
  const errors = {};
  if (!parseGithubUrl(github_url)) errors.github_url = 'Enter a GitHub repository URL like https://github.com/you/project';
  if (demo_url && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(demo_url.trim())) errors.demo_url = 'Enter a full URL starting with https://';
  if ((explanation ?? '').length > 4000) errors.explanation = 'Keep the explanation under 4000 characters';
  return errors;
}

// ------------------------------------------------------------------ scores
/** Validate model-proposed scores. Returns null if anything is missing or not a number. */
export function validateScores(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const { id } of EVALUATION_CRITERIA) {
    const v = Number(raw[id]);
    if (raw[id] == null || Number.isNaN(v)) return null;
    out[id] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

/** Final weighted total — computed in app code, never taken from the model. */
export const weightedTotal = (scores) =>
  Math.round(EVALUATION_CRITERIA.reduce((s, { id }) => s + EVALUATION_WEIGHTS[id] * scores[id], 0));

export const passed = (scores, total) => total >= PASS_SCORE && scores.concept_application >= MIN_CONCEPT_SCORE;

/**
 * Skills demonstrated by this evaluation: only the module's own skills, only when passed,
 * narrowed to those the evaluator confirmed (falling back to the module's primary concept).
 */
export function demonstratedFrom(scores, total, moduleSkills, claimed = []) {
  if (!passed(scores, total)) return [];
  const claimedSet = new Set(claimed.map((s) => String(s).toLowerCase()));
  const confirmed = moduleSkills.filter((s) => claimedSet.has(s.toLowerCase()));
  return confirmed.length ? confirmed : moduleSkills.slice(0, 1);
}

// ------------------------------------------------------------------ rewards
export const pointsFor = (total) => REWARD_TIERS.find((t) => total >= t.min).points;

/** Points to add now: only the improvement over what this challenge already earned. */
export const rewardDelta = (total, alreadyAwarded) => Math.max(0, pointsFor(total) - alreadyAwarded);

// ------------------------------------------------------------------ automated check (no AI)
const STOP = new Set('about above after again build built clear could every first their there these those through using which while would should explain output report handle least include public readme other model'.split(' '));

function keyTerms(requirements) {
  const words = requirements.join(' ').toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))];
}

const has = (text, term) => text.includes(term.toLowerCase());

/**
 * Evidence-based fallback used when the AI evaluator is unavailable. It can only see
 * the repository metadata, README and the student's explanation — so it checks that the
 * concept and requirements are visibly addressed, and says so in its feedback.
 */
export function automatedCheck(challenge, evidence) {
  const readme = (evidence.readme ?? '').toLowerCase();
  const explanation = (evidence.explanation ?? '').toLowerCase();
  const all = `${readme} ${explanation} ${(evidence.repo?.description ?? '').toLowerCase()}`;
  const words = explanation.split(/\s+/).filter(Boolean).length;

  const skillHits = challenge.skills.filter((s) => s.toLowerCase().split(/[\s/&-]+/).filter((t) => t.length > 2).some((t) => has(all, t)));
  const terms = keyTerms(challenge.requirements);
  const termHits = terms.filter((t) => has(all, t));
  const skillRatio = challenge.skills.length ? skillHits.length / challenge.skills.length : 0;
  const termRatio = terms.length ? termHits.length / terms.length : 0;

  let concept = 25 + 75 * skillRatio;
  if (!readme && words < 20) concept = Math.min(concept, 40);
  const correctness = 30 + (evidence.repo?.exists ? 25 : 0) + (readme.length > 400 ? 20 : readme ? 10 : 0)
    + (evidence.demo_url ? 15 : 0) + (evidence.repo?.language ? 10 : 0);
  const understanding = (words < 20 ? 30 : words < 60 ? 55 : words < 120 ? 70 : 82)
    + Math.min(15, 5 * challenge.skills.filter((s) => has(explanation, s.split(' ')[0])).length);
  const practical = 30 + 70 * termRatio;

  const scores = validateScores({
    concept_application: concept, correctness, understanding, practical_application: practical,
  });

  const strengths = [];
  const improvements = [];
  if (skillHits.length) strengths.push(`Your write-up clearly covers ${skillHits.join(', ')}`);
  else improvements.push(`Make it explicit where and how you applied ${challenge.skills.join(', ')}`);
  if (readme.length > 400) strengths.push('Detailed README that explains the project');
  else improvements.push('Expand the README: what it does, how to run it, and your results');
  if (evidence.demo_url) strengths.push('Live demo provided');
  if (words >= 60) strengths.push('Thoughtful explanation of what you built');
  else improvements.push('Explain your approach and key decisions in more detail');
  if (termRatio < 0.5) improvements.push('Address each listed requirement and mention it in your README');
  if (evidence.status === 'not_found') improvements.push('Repository not found or private: make sure the URL is right and the repository is public');

  return {
    scores,
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    demonstrated_skills: skillHits,
    feedback: 'Automated evidence check (AI evaluator unavailable): based on your repository metadata, README and explanation. It cannot run your code.',
    evaluator: 'automated-check',
  };
}
