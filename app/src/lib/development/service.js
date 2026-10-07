// Module 3 flows. All decisions (difficulty, total score, pass/fail, demonstrated
// skills, reward points) are made here in app code; AI only proposes wording/scores.
import * as db from '../db.js';
import { COURSE_BY_ID } from './catalog.js';
import { applyCustomisation, buildChallenge, difficultyFor } from './projects.js';
import { customiseChallenge, assessSubmission, fetchRepoEvidence } from './ai.js';
import { demonstratedFrom, passed, pointsFor, rewardDelta, validateSubmission, weightedTotal } from './evaluation.js';

/**
 * Mark a module complete ("learned") and unlock its practical project.
 * Returns the challenge. Completing a module never creates a demonstrated skill.
 */
export async function completeModuleFlow({ userId, careerId, courseId, moduleId, dev }) {
  await db.startCourse(userId, courseId, careerId, true);
  await db.completeModule(userId, courseId, moduleId);

  const existing = dev.challenges.find((c) => c.course_id === courseId && c.module_id === moduleId);
  let challenge = existing;
  if (!existing) {
    const template = buildChallenge({
      careerId, courseId, moduleId,
      difficulty: difficultyFor(COURSE_BY_ID[courseId].difficulty, dev.evaluations),
    });
    // The template challenge is the authoritative assignment; AI tailoring is stored apart.
    challenge = await db.createChallenge(userId, template);
    const tailored = await customiseChallenge(template);
    if (tailored) {
      await db.saveGeneratedOutput(userId, {
        kind: 'project_customisation', subject_type: 'project_challenge', subject_id: challenge.id,
        subject_key: `${courseId}:${moduleId}`, content: tailored.customisation, generator: 'gemini', model: tailored.model,
      });
      challenge = { ...challenge, customisation: tailored.customisation };
    }
  }
  challenge = applyCustomisation(challenge, challenge.customisation);

  const course = COURSE_BY_ID[courseId];
  const doneIds = new Set([
    ...dev.moduleProgress.filter((r) => r.course_id === courseId).map((r) => r.module_id),
    moduleId,
  ]);
  if (course.modules.every((m) => doneIds.has(m.id))) await db.setCourseCompleted(userId, courseId);
  return challenge;
}

/** Submit a GitHub project and evaluate it. Returns { evaluation, pointsAwarded }. */
export async function submitAndEvaluate({ userId, challenge, form, dev }) {
  const errors = validateSubmission(form);
  if (Object.keys(errors).length) throw Object.assign(new Error('Please fix the highlighted fields'), { fieldErrors: errors });

  // Read the repository first: if GitHub can't be reached, store nothing and ask to retry.
  const githubUrl = form.github_url.trim().replace(/\/$/, '').replace(/\.git$/, '');
  const evidence = await fetchRepoEvidence(githubUrl);
  if (evidence.status === 'unavailable') {
    throw new Error(
      "GitHub couldn't be reached right now (it limits how often repositories can be read). Nothing was submitted; please try again in a few minutes."
    );
  }

  const submission = await db.submitProject(userId, challenge.id, {
    github_url: githubUrl,
    demo_url: form.demo_url?.trim() || null,
    explanation: form.explanation?.trim() || null,
  });

  const assessed = await assessSubmission(challenge, submission, evidence);
  const total = weightedTotal(assessed.scores);
  const ok = passed(assessed.scores, total);
  const skills = demonstratedFrom(assessed.scores, total, challenge.skills, assessed.demonstrated_skills);

  // Points: only the improvement over what this challenge already earned.
  const already = dev.rewards.filter((r) => r.source_id === challenge.id).reduce((s, r) => s + r.points, 0);
  const points = rewardDelta(total, already);
  const reward = points > 0
    ? {
      source_type: 'project',
      source_id: challenge.id,
      points,
      reason: already ? `Improved "${challenge.title}" to ${total}/100` : `"${challenge.title}" scored ${total}/100`,
    }
    : null;

  const evaluation = await db.recordEvaluation(userId, {
    evaluation: {
      submission_id: submission.id,
      challenge_id: challenge.id,
      ...assessed.scores,
      total_score: total,
      passed: ok,
      points_awarded: points,
      demonstrated_skills: skills,
      evaluator: assessed.evaluator,
      model: assessed.model ?? null,
    },
    // Narrative is generated content (AI or deterministic check), stored apart from the decision.
    narrative: {
      feedback: assessed.feedback || null,
      strengths: assessed.strengths,
      improvements: assessed.improvements,
      generator: assessed.evaluator === 'gemini' ? 'gemini' : 'deterministic',
      model: assessed.model ?? null,
    },
    challengeStatus: ok ? 'passed' : 'needs_improvement',
    skills,
    reward,
  });
  return { evaluation, pointsAwarded: points, tierPoints: pointsFor(total) };
}
