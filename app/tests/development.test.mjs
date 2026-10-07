import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- browser shims: localStorage (demo DB) and fetch (GitHub API) -------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let fakeRepo = null; // { readme, language }, null for "repo not found", or 'down' for a rate limit
globalThis.fetch = async (url) => {
  if (fakeRepo === 'down') return { ok: false, status: 403 };
  if (!fakeRepo) return { ok: false, status: 404 };
  if (String(url).endsWith('/readme')) return { ok: true, text: async () => fakeRepo.readme };
  return { ok: true, json: async () => ({ full_name: 'student/project', description: fakeRepo.description ?? '', language: fakeRepo.language ?? 'Python', size: 120 }) };
};
console.info = () => {};

const { CAREERS } = await import('../src/lib/careers.js');
const { COURSES, COURSE_BY_ID, CAREER_TRACKS, findModule } = await import('../src/lib/development/catalog.js');
const { buildPathways, rankPathways, scorePathway } = await import('../src/lib/development/pathways.js');
const { deriveProgress, rankCourses } = await import('../src/lib/development/learning.js');
const { buildChallenge, difficultyFor, applyCustomisation } = await import('../src/lib/development/projects.js');
const ev = await import('../src/lib/development/evaluation.js');
const { EVALUATION_WEIGHTS, PATH_WEIGHTS, REWARD_TIERS } = await import('../src/lib/development/config.js');
const { completeModuleFlow, submitAndEvaluate } = await import('../src/lib/development/service.js');
const db = await import('../src/lib/db.js');
const { DEMO_USER_ID, resetDemo } = await import('../src/lib/demoDb.js');
const { evaluateCareer } = await import('../src/lib/feasibility/scoring.js');

const base = {
  income_band: '6to10', loan_willingness: 'no', risk_tolerance: 'moderate', location_preference: 'india',
  relocation: 'india', family_priorities: [],
};
const poorUg = { ...base, education_budget: 'lt2', education_preference: 'ug' };
const richMasters = { ...base, income_band: '10to20', education_budget: 'gt20', loan_willingness: 'yes', education_preference: 'masters_spec', risk_tolerance: 'high' };
const rec = (domainId, score = 85) => ({ domainId, score, rank: 1 });

// ---------------------------------------------------------------- catalog
test('catalog: every career has a track whose courses exist and are tagged for it', () => {
  for (const c of CAREERS) {
    const t = CAREER_TRACKS[c.id];
    assert.ok(t, `no track for ${c.id}`);
    for (const st of [...t.stages, t.specialisation]) {
      for (const id of st.options) assert.ok(COURSE_BY_ID[id], `${c.id}: unknown course ${id}`);
    }
  }
  const ids = new Set();
  for (const course of COURSES) {
    for (const m of course.modules) {
      assert.ok(!ids.has(`${course.id}:${m.id}`));
      ids.add(`${course.id}:${m.id}`);
      assert.ok(m.project.requirements.length >= 3, `${m.id} needs a real project`);
      assert.ok(m.skills.length > 0);
    }
    for (const p of course.prerequisites) assert.ok(COURSE_BY_ID[p], `${course.id}: bad prereq ${p}`);
  }
});

// ---------------------------------------------------------------- recommendation
test('course recommendations only include courses relevant to the career', () => {
  const progress = deriveProgress(null);
  for (const careerId of ['ai-ml', 'cybersecurity', 'vlsi', 'ux-design']) {
    const ranked = rankCourses(careerId, null, poorUg, progress);
    assert.ok(ranked.length > 0);
    for (const r of ranked) assert.ok(r.course.careers.includes(careerId), `${r.course.id} not relevant to ${careerId}`);
  }
  // A cheap web course must not be recommended for VLSI.
  assert.ok(!rankCourses('vlsi', null, poorUg, progress).some((r) => r.course.id === 'web-fullstack'));
});

test('budget filters courses: low budget avoids paid programmes that a high budget can use', () => {
  const low = buildPathways('ai-ml', poorUg);
  const high = buildPathways('ai-ml', richMasters);
  const courseIds = (ps) => ps.flatMap((p) => p.stages.filter((s) => s.kind === 'course').map((s) => s.courseId));
  assert.ok(!courseIds(low).includes('ml-pg-certificate'), 'low budget should not pick the ₹1.5L certificate');
  assert.ok(courseIds(high).includes('ml-pg-certificate'), 'high budget structured path can use it');
  assert.ok(courseIds(low).every((id) => COURSE_BY_ID[id].price <= 5000));
});

test('higher-study preference changes the recommended pathway', () => {
  const recs = [rec('ai-ml')];
  assert.equal(rankPathways(recs, poorUg)[0].type, 'self_paced');
  const top = rankPathways(recs, richMasters)[0];
  assert.equal(top.type, 'higher_study');
  assert.ok(top.stages.some((s) => s.kind === 'programme'));
});

test('feasibility feeds the pathway score and changes the ranking', () => {
  const p = buildPathways('vlsi', poorUg)[0];
  const scored = scorePathway(p, rec('vlsi'), poorUg);
  assert.equal(scored.components.feasibility, evaluateCareer('vlsi', poorUg).score);
  const expected = Math.round(Object.entries(PATH_WEIGHTS).reduce((s, [k, w]) => s + w * scored.components[k], 0));
  assert.equal(scored.score, expected);
  // Equal career fit, but the more feasible career ranks first for a constrained family.
  const ranked = rankPathways([rec('vlsi', 80), rec('civil-infra', 80)], poorUg);
  assert.equal(ranked[0].careerId, 'civil-infra');
});

// ---------------------------------------------------------------- projects & evaluation (pure)
test('project difficulty follows the simple rules', () => {
  const pass = (n, s = 80) => Array.from({ length: n }, () => ({ total_score: s }));
  assert.equal(difficultyFor('beginner', []), 'beginner');
  assert.equal(difficultyFor('beginner', pass(2)), 'intermediate');
  assert.equal(difficultyFor('beginner', pass(3, 90)), 'advanced');
  assert.equal(difficultyFor('intermediate', []), 'intermediate');
});

test('challenge comes from the completed module; AI cannot replace its requirements', () => {
  const ch = buildChallenge({ careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', difficulty: 'beginner' });
  assert.equal(ch.title, 'Student Performance Predictor');
  assert.deepEqual(ch.skills, findModule('ml-foundations', 'ml-linreg').skills);
  const custom = applyCustomisation(ch, { title: 'Hostel Mess Demand Predictor', scenario: 'Predict meals needed per day with linear regression.', extension_challenge: 'Try ridge regression' });
  assert.equal(custom.source, 'ai');
  for (const r of ch.requirements) assert.ok(custom.requirements.includes(r));
  assert.equal(applyCustomisation(ch, { title: '', scenario: 'x' }), ch);
});

test('GitHub URL validation', () => {
  assert.ok(ev.parseGithubUrl('https://github.com/student/ml-project'));
  assert.ok(ev.parseGithubUrl('https://github.com/student/ml-project.git'));
  assert.equal(ev.parseGithubUrl('https://gitlab.com/student/x'), null);
  assert.equal(ev.parseGithubUrl('https://github.com/student'), null);
  assert.equal(ev.parseGithubUrl('github.com/student/x'), null);
  assert.ok(ev.validateSubmission({ github_url: 'nope' }).github_url);
  assert.ok(ev.validateSubmission({ github_url: 'https://github.com/a/b', demo_url: 'not a url' }).demo_url);
});

test('scores are validated to 0–100 and the total is computed by the app', () => {
  assert.deepEqual(ev.validateScores({ concept_application: 140, correctness: -5, understanding: 70.4, practical_application: '80' }),
    { concept_application: 100, correctness: 0, understanding: 70, practical_application: 80 });
  assert.equal(ev.validateScores({ concept_application: 80, correctness: 'abc', understanding: 1, practical_application: 1 }), null);
  assert.equal(ev.validateScores({ concept_application: 80 }), null);
  const s = { concept_application: 85, correctness: 78, understanding: 90, practical_application: 82 };
  assert.equal(ev.weightedTotal(s), Math.round(Object.entries(EVALUATION_WEIGHTS).reduce((a, [k, w]) => a + w * s[k], 0)));
});

test('rewards follow the tiers and only the improvement is added', () => {
  assert.deepEqual([0, 49, 50, 69, 70, 84, 85, 94, 95, 100].map(ev.pointsFor), [0, 0, 50, 50, 100, 100, 150, 150, 200, 200]);
  assert.equal(REWARD_TIERS[0].points, 200);
  assert.equal(ev.rewardDelta(88, 0), 150);
  assert.equal(ev.rewardDelta(88, 150), 0);
  assert.equal(ev.rewardDelta(96, 150), 50);
});

test('demonstrated skills require a passing, concept-applying evaluation', () => {
  const skills = ['Linear Regression', 'Model Evaluation'];
  const good = { concept_application: 90, correctness: 80, understanding: 80, practical_application: 80 };
  assert.deepEqual(ev.demonstratedFrom(good, 85, skills, ['Linear Regression']), ['Linear Regression']);
  assert.deepEqual(ev.demonstratedFrom(good, 65, skills, skills), []);
  assert.deepEqual(ev.demonstratedFrom({ ...good, concept_application: 40 }, 75, skills, skills), []);
  assert.deepEqual(ev.demonstratedFrom(good, 85, skills, ['Unrelated skill']), ['Linear Regression']);
});

// ---------------------------------------------------------------- end-to-end via demo DB
const userId = DEMO_USER_ID;
beforeEach(() => { resetDemo(); fakeRepo = null; });

const README = `# Student Performance Predictor
Linear regression model that predicts student performance from study hours, attendance and past marks.
## Steps
- Load and clean the dataset, handle missing values
- Exploratory analysis with plots of each feature vs final marks
- Train a linear regression model (scikit-learn) on a train/test split
- Evaluate predictions with RMSE and R², plus residual plots (model evaluation)
- Explain the model coefficients: attendance has the largest effect
## Results
R² of 0.81 on held-out data. ${'More details on features, results and limitations. '.repeat(8)}`;
const EXPLANATION = Array.from({ length: 13 }, () => 'I used linear regression and careful model evaluation to predict marks, explaining coefficients and errors.').join(' ');

test('flow: completing a module unlocks its project but demonstrates nothing; progress persists', async () => {
  const dev0 = await db.getDevelopment(userId);
  const ch = await completeModuleFlow({ userId, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev: dev0 });
  assert.equal(ch.title, 'Student Performance Predictor');
  assert.equal(ch.status, 'open');
  assert.equal(ch.customisation, null); // demo mode: no AI, template wording only
  assert.equal(ch.source, undefined); // provenance lives in generated_outputs, not on the challenge

  const dev = await db.getDevelopment(userId); // reload == page refresh
  const progress = deriveProgress(dev);
  assert.ok(progress.isDone('ml-foundations', 'ml-linreg'));
  assert.ok(progress.isStarted('ml-foundations'));
  assert.ok(progress.learnedSkills.includes('Linear Regression'));
  assert.deepEqual(progress.demonstratedSkills, []);
  assert.equal(progress.points, 0);

  // Completing the same module again does not duplicate the challenge.
  const again = await completeModuleFlow({ userId, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev });
  assert.equal(again.id, ch.id);
  assert.equal((await db.getDevelopment(userId)).challenges.length, 1);
});

test('flow: invalid GitHub URL is rejected before anything is stored', async () => {
  const dev = await db.getDevelopment(userId);
  const ch = await completeModuleFlow({ userId, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev });
  await assert.rejects(
    submitAndEvaluate({ userId, challenge: ch, form: { github_url: 'https://example.com/x' }, dev: await db.getDevelopment(userId) }),
    (e) => Boolean(e.fieldErrors?.github_url)
  );
  assert.equal((await db.getDevelopment(userId)).submissions.length, 0);
});

test('flow: weak submission → needs improvement, no demonstrated skill; strong resubmission → demonstrated, points not duplicated', async () => {
  let dev = await db.getDevelopment(userId);
  const ch = await completeModuleFlow({ userId, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev });

  // Weak: repository not readable, no explanation.
  dev = await db.getDevelopment(userId);
  const weak = await submitAndEvaluate({ userId, challenge: ch, form: { github_url: 'https://github.com/student/empty' }, dev });
  assert.ok(weak.evaluation.total_score < 70);
  assert.equal(weak.evaluation.passed, false);
  assert.equal(weak.evaluation.evaluator, 'automated-check');
  dev = await db.getDevelopment(userId);
  assert.equal(dev.challenges[0].status, 'needs_improvement');
  assert.deepEqual(deriveProgress(dev).demonstratedSkills, []);
  const weakPoints = deriveProgress(dev).points;
  assert.equal(weakPoints, ev.pointsFor(weak.evaluation.total_score));

  // Strong: README + explanation evidence the concept and requirements.
  fakeRepo = { readme: README, language: 'Jupyter Notebook' };
  const strong = await submitAndEvaluate({
    userId, challenge: dev.challenges[0],
    form: { github_url: 'https://github.com/student/predictor', demo_url: 'https://predictor.vercel.app', explanation: EXPLANATION },
    dev,
  });
  const e = strong.evaluation;
  for (const k of Object.keys(EVALUATION_WEIGHTS)) assert.ok(e[k] >= 0 && e[k] <= 100);
  assert.equal(e.total_score, ev.weightedTotal(e));
  assert.equal(e.passed, true);
  assert.ok(e.demonstrated_skills.includes('Linear Regression'));
  assert.ok(e.strengths.length > 0 && e.improvements !== undefined);

  dev = await db.getDevelopment(userId);
  const progress = deriveProgress(dev);
  assert.ok(progress.demonstratedSkills.includes('Linear Regression'));
  assert.equal(dev.challenges[0].status, 'passed');
  // Total points = the tier for the best score, not tier(weak) + tier(strong).
  assert.equal(progress.points, ev.pointsFor(e.total_score));
  assert.equal(e.points_awarded, ev.pointsFor(e.total_score) - weakPoints);

  // Re-recording the same submission is refused (no duplicate award).
  await assert.rejects(db.recordEvaluation(userId, {
    evaluation: { submission_id: e.submission_id, challenge_id: e.challenge_id, total_score: 100 }, challengeStatus: 'passed', skills: [], reward: { points: 200 },
  }));
  assert.equal(deriveProgress(await db.getDevelopment(userId)).points, progress.points);
});

test('flow: GitHub unreachable (rate limit) stores nothing and asks to retry', async () => {
  const dev = await db.getDevelopment(userId);
  const ch = await completeModuleFlow({ userId, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev });
  fakeRepo = 'down';
  await assert.rejects(
    submitAndEvaluate({ userId, challenge: ch, form: { github_url: 'https://github.com/student/predictor' }, dev: await db.getDevelopment(userId) }),
    /try again/
  );
  const after = await db.getDevelopment(userId);
  assert.equal(after.submissions.length, 0);
  assert.equal(after.evaluations.length, 0);
  assert.equal(after.challenges[0].status, 'open');
});

test('flow: development plan choice persists', async () => {
  await db.saveDevelopmentPlan(userId, 'vlsi', 'higher_study');
  const dev = await db.getDevelopment(userId);
  assert.equal(dev.plan.career_id, 'vlsi');
  assert.equal(dev.plan.pathway_type, 'higher_study');
});
