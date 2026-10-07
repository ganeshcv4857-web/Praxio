// Module 3 AI assistance + GitHub evidence. Every call has a deterministic fallback,
// so the full learn → build → evaluate loop works without the AI layer (e.g. demo mode).
import { invoke } from '../ai.js';
import { findModule } from './catalog.js';
import { customisationContext } from './projects.js';
import { automatedCheck, parseGithubUrl, validateScores } from './evaluation.js';

/**
 * Ask the AI to tailor a template challenge. Returns { customisation, model } or null.
 * The result is stored as a generated output; the template challenge stays authoritative.
 */
export async function customiseChallenge(template) {
  try {
    const { customisation, model } = await invoke({ mode: 'project', context: customisationContext(template) });
    return customisation ? { customisation, model } : null;
  } catch (e) {
    console.info('Project customisation unavailable; using template.', e.message);
    return null;
  }
}

/**
 * Public repository metadata + README from the GitHub API (unauthenticated).
 * status: 'ok' | 'not_found' (missing or private — real evidence) | 'unavailable'
 * (rate limit / network — not the student's fault, so callers must not score it).
 */
export async function fetchRepoEvidence(githubUrl) {
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) return { status: 'not_found', repo: { exists: false }, readme: '' };
  const base = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const repo = { exists: false };
  let readme = '';
  try {
    const res = await fetch(base, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 404) return { status: 'not_found', repo, readme };
    if (!res.ok) return { status: 'unavailable', repo, readme };
    const d = await res.json();
    Object.assign(repo, {
      exists: true, name: d.full_name, description: d.description ?? '', language: d.language ?? '',
      fork: d.fork, size_kb: d.size, pushed_at: d.pushed_at, topics: d.topics ?? [],
    });
  } catch {
    return { status: 'unavailable', repo, readme };
  }
  if (repo.exists) {
    try {
      const res = await fetch(`${base}/readme`, { headers: { Accept: 'application/vnd.github.raw' } });
      if (res.ok) readme = (await res.text()).slice(0, 20000);
    } catch { /* no README */ }
  }
  return { status: 'ok', repo, readme };
}

/**
 * Propose criterion scores for a submission. Groq if available (validated here),
 * otherwise the automated evidence check. Never returns a total — the caller computes it.
 */
export async function assessSubmission(challenge, submission, evidence) {
  const module = findModule(challenge.course_id, challenge.module_id);
  try {
    const { evaluation, model } = await invoke({
      mode: 'evaluate',
      context: {
        challenge: { ...challenge, module: module?.title },
        submission,
        evidence,
      },
    });
    const scores = validateScores(evaluation);
    if (!scores) throw new Error('AI evaluation returned invalid scores');
    const list = (v) => (Array.isArray(v) ? v.map(String).slice(0, 5) : []);
    return {
      scores,
      strengths: list(evaluation.strengths),
      improvements: list(evaluation.improvements),
      demonstrated_skills: list(evaluation.demonstrated_skills),
      feedback: typeof evaluation.feedback === 'string' ? evaluation.feedback.slice(0, 1000) : '',
      evaluator: 'groq',
      model,
      evidence,
    };
  } catch (e) {
    console.info('AI evaluation unavailable; using automated evidence check.', e.message);
    return { ...automatedCheck(challenge, { ...evidence, ...submission }), evidence };
  }
}
