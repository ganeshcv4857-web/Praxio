import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.fetch = async () => ({ ok: false, status: 404 });
console.info = () => {};

const db = await import('../src/lib/db.js');
const { DEMO_USER_ID, resetDemo, readDemoSnapshot } = await import('../src/lib/demoDb.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
const { fromRow } = await import('../src/lib/ai.js');
const { completeModuleFlow, submitAndEvaluate } = await import('../src/lib/development/service.js');

const uid = DEMO_USER_ID;
beforeEach(() => resetDemo());

test('assessment progress is saved as a resumable draft and closed on completion', async () => {
  assert.equal(await db.getAssessmentSession(uid), null);
  const s1 = await db.saveAssessmentDraft(uid, null, { current_step: 2, draft: { full_name: 'Asha', interests: { int_software: 4 } }, quiz_answers: [1, null] });
  const s2 = await db.saveAssessmentDraft(uid, s1.id, { current_step: 3, draft: { ...s1.draft, aptitude: { apt_logical: 4 } }, quiz_answers: [1, 0] });
  assert.equal(s2.id, s1.id);
  const open = await db.getAssessmentSession(uid); // after "refresh"
  assert.equal(open.current_step, 3);
  assert.deepEqual(open.quiz_answers, [1, 0]);
  assert.equal(open.draft.aptitude.apt_logical, 4);
  // Draft answers are not committed to the profile until completion.
  assert.equal((await db.getProfile(uid)).interests.int_software, undefined);
  await db.completeAssessmentSession(uid, open.id, { draft: open.draft, quiz_answers: open.quiz_answers });
  assert.equal(await db.getAssessmentSession(uid), null);
  assert.equal(readDemoSnapshot().assessmentSessions[0].status, 'completed');
});

test('explanations are stored as generated outputs and never written onto recommendation rows', async () => {
  const profile = await db.saveProfile(uid, {
    branch: 'cse', interests: { int_software: 5 }, aptitude: { apt_programming: 5 }, preferences: {}, traits: {}, onboarded_at: 'x',
  });
  const recs = (await db.replaceRecommendations(uid, shortlist(rankCareers(profile)))).map(fromRow);
  const ex = { [recs[0].domainId]: { why: 'Because you love building software.', watch_out: 'n/a', grounded_on: ['int_software'] } };
  await db.saveExplanations(uid, recs, ex, 'gemini-test');

  const snap = readDemoSnapshot();
  assert.ok(snap.recommendations.every((r) => !('explanation' in r)), 'recommendation rows stay score-only');
  assert.equal(snap.generated.length, 1);
  assert.equal(snap.generated[0].kind, 'career_explanation');
  assert.equal(snap.generated[0].subject_id, recs[0].id);
  // Read path attaches the explanation without changing the score.
  const reread = (await db.getRecommendations(uid)).map(fromRow);
  assert.equal(reread[0].explanation.why, 'Because you love building software.');
  assert.equal(reread[0].score, recs[0].score);
  // Rescoring creates new rows; old explanations remain history and don't attach.
  const fresh = (await db.replaceRecommendations(uid, shortlist(rankCareers(profile)))).map(fromRow);
  assert.equal((await db.getRecommendations(uid)).find((r) => r.id === fresh[0].id).explanation, null);
});

test('evaluation narrative is a generated output; the evaluation row holds only the decision', async () => {
  const dev0 = await db.getDevelopment(uid);
  const ch = await completeModuleFlow({ userId: uid, careerId: 'ai-ml', courseId: 'ml-foundations', moduleId: 'ml-linreg', dev: dev0 });
  const { evaluation } = await submitAndEvaluate({ userId: uid, challenge: ch, form: { github_url: 'https://github.com/a/b' }, dev: await db.getDevelopment(uid) });
  const raw = readDemoSnapshot();
  const row = raw.dev.evaluations[0];
  assert.ok(!('strengths' in row) && !('improvements' in row) && !('feedback' in row));
  assert.equal(typeof row.total_score, 'number');
  const g = raw.generated.find((o) => o.kind === 'evaluation_feedback');
  assert.equal(g.subject_id, row.id);
  assert.equal(g.generator, 'deterministic');
  // Read path re-attaches it for the UI.
  const dev = await db.getDevelopment(uid);
  assert.deepEqual(dev.evaluations[0].improvements, evaluation.improvements);
});
