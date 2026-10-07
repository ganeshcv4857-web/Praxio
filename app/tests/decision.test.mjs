// Praxio Decision Engine: deterministic, tier-based next-action decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
const { decide, actionOrder } = await import('../src/lib/decision/engine.js');
const { THRESHOLDS, DECISION_VERSION, STAGE_ACTIONS } = await import('../src/lib/decision/config.js');
const { routeDependencies } = await import('../src/lib/decision/candidates.js');
const { evaluateAll } = await import('../src/lib/feasibility/scoring.js');
const { alignShortlist } = await import('../src/lib/alignment/engine.js');
const { rankCareers, shortlist } = await import('../src/lib/scoring.js');

const L = 100000;
const base = {
  income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate',
  education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [],
  primary_funder: 'family', scholarship_interest: 'no',
};
const RECS = [{ domainId: 'software-eng', score: 92 }, { domainId: 'data-science', score: 70 }, { domainId: 'cloud-devops', score: 60 }];
const progress = (demonstrated = [], learned = demonstrated) => ({ demonstratedSkills: demonstrated, learnedSkills: learned, points: 0, evaluations: [] });
const market = (core, { level = 'high', fresh = true } = {}) => ({
  career: 'x', researched_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + (fresh ? 1 : -1) * 86_400_000 * 10).toISOString(),
  market: { demand: { level, trend: 'growing', summary: '', sources: ['https://example.org/a'] }, core_skills: core.map((s) => ({ skill: s, text: `${s} is asked for`, sources: ['https://example.org/a'] })), tools: [], emerging_skills: [] },
});
function run({ stage = 'undergraduate', goal, inputs = base, recs = RECS, prog = null, marketById = {}, dev = null, legacy = false } = {}) {
  const profile = legacy ? {} : { current_stage: stage, primary_goal: goal };
  const bundle = buildDecisionInputs({ profile, recs, inputs, marketById, progress: prog, dev });
  return { bundle, d: decide(bundle) };
}

// ------------------------------------------------------------------ config & determinism
test('thresholds are versioned prototype constants and recorded on every decision', () => {
  assert.match(THRESHOLDS.version, /prototype/);
  assert.equal(THRESHOLDS.tieBand, 5);
  assert.equal(THRESHOLDS.jobReadyCoreReadiness, 50);
  assert.equal(THRESHOLDS.jobReadyDemonstratedSkills, 2);
  const { d } = run();
  assert.equal(d.version, DECISION_VERSION);
  assert.equal(d.thresholds.version, THRESHOLDS.version);
  assert.ok(d.trace.length && d.trace.some((x) => x.threshold));
});

test('deterministic: same bundle → identical decision; shortlist order does not matter', () => {
  const a = run({ prog: progress(['Python']) }).d;
  const b = run({ prog: progress(['Python']) }).d;
  assert.deepEqual(a, b);
  const c = run({ prog: progress(['Python']), recs: [...RECS].reverse() }).d;
  assert.deepEqual([c.mode, c.direction.careerId, c.nextAction.type], [a.mode, a.direction.careerId, a.nextAction.type]);
});

test('no aggregate score: the decision carries no invented overall score', () => {
  const { d } = run();
  assert.equal(d.score, undefined);
  assert.equal(d.nextAction.score, undefined);
});

// ------------------------------------------------------------------ invariants (nothing authoritative changes)
test('invariant: decide() never mutates the bundle or any module result', () => {
  const recs = RECS.map((r) => ({ ...r }));
  const inputs = { ...base, loan_willingness: 'yes', education_budget: '5to10' };
  const prog = { demonstratedSkills: ['Python'], learnedSkills: ['Python', 'Functions'], points: 40, evaluations: [{ total_score: 82 }] };
  const bundle = buildDecisionInputs({ profile: { current_stage: 'graduate_unemployed' }, recs, inputs, marketById: { 'software-eng': market(['Python', 'SQL']) }, progress: prog });
  const before = structuredClone(bundle);
  const recsBefore = structuredClone(recs);
  const progBefore = structuredClone(prog);
  const d = decide(bundle);
  assert.deepEqual(bundle, before, 'bundle unchanged');
  assert.deepEqual(recs, recsBefore, 'Career Fit unchanged');
  assert.deepEqual(prog, progBefore, 'demonstrated skills, points and evaluations unchanged');
  // Authoritative values are reported exactly as the modules produced them.
  const fresh = Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r]));
  const align = Object.fromEntries(alignShortlist({ recs, profile: {}, inputs }).map((a) => [a.careerId, a]));
  const id = d.direction.careerId;
  assert.equal(d.direction.careerFit, recs.find((r) => r.domainId === id).score);
  assert.equal(d.evidence.feasibility.score, fresh[id].score);
  assert.equal(d.evidence.feasibility.category, fresh[id].category);
  assert.equal(d.evidence.alignment.score, align[id].score);
  assert.equal(bundle.careers.find((c) => c.careerId === id).feasibility.financing.status, fresh[id].financing.status);
  assert.deepEqual(d.evidence.skills.demonstrated, ['Python']);
});

test('invariant: decision inputs bundle reproduces module outputs exactly', () => {
  const { bundle } = run({ inputs: { ...base, loan_willingness: 'yes' } });
  const fresh = evaluateAll({ ...base, loan_willingness: 'yes' }, RECS);
  for (const f of fresh) assert.deepEqual(bundle.careers.find((c) => c.careerId === f.domainId).feasibility, f);
  // Direct-route financing in the bundle equals alignment's own financing plan.
  for (const c of bundle.careers) {
    const direct = c.routes.find((r) => r.id === 'direct');
    assert.deepEqual(direct.financing, c.alignment.dimensions.find((x) => x.dimension === 'financial').financing);
  }
});

// ------------------------------------------------------------------ stage-specific decisions
test('Class 10: keep_open + explore streams; no career commitment, no pathway/financing', () => {
  const { d } = run({ stage: 'school_10' });
  assert.equal(d.mode, 'keep_open');
  assert.equal(d.direction, null);
  assert.equal(d.nextAction.type, 'explore_stream');
  assert.match(d.nextAction.steps[0], /Science \(PCM\)/);
  assert.ok(!d.alternatives.some((a) => ['complete_feasibility', 'resolve_financing', 'compare_pathways'].includes(a.action.type)));
});

test('Class 11/12: degree and entrance actions; Module 3 B.Tech pathways are not applied', () => {
  for (const stage of ['school_11', 'school_12']) {
    const { d } = run({ stage });
    assert.equal(d.mode, 'commit');
    assert.equal(d.nextAction.type, 'compare_degrees');
    assert.equal(d.direction.routeStatus, 'not_applicable');
    assert.deepEqual(d.dependencies, []);
    assert.ok(d.alternatives.some((a) => a.action.type === 'prepare_entrance'));
  }
});

test('Class 12 without feasibility asks for it first; Class 11 does not', () => {
  assert.equal(run({ stage: 'school_12', inputs: null }).d.nextAction.type, 'complete_feasibility');
  assert.equal(run({ stage: 'school_11', inputs: null }).d.nextAction.type, 'compare_degrees');
});

test('undergraduate: builds skills; proves learned-but-unproven skills first', () => {
  assert.equal(run().d.nextAction.type, 'build_skill');
  const d = run({ prog: progress([], ['Python']) }).d;
  assert.equal(d.nextAction.type, 'complete_project');
  assert.match(d.nextAction.title, /Prove Python/);
});

test('working professional: transferable skills / upskilling', () => {
  const { d } = run({ stage: 'employed_professional', goal: 'career_switch' });
  assert.equal(d.nextAction.type, 'map_transferable_skills');
  assert.equal(run({ stage: 'employed_professional', goal: 'upskill' }).d.nextAction.type, 'pursue_certification');
  assert.deepEqual(actionOrder('employed_professional', 'upskill').slice(0, 2), ['pursue_certification', 'map_transferable_skills']);
});

test('career switcher: proven transferable skills are surfaced', () => {
  const { d } = run({ stage: 'career_switcher', prog: progress(['Python', 'SQL']) });
  assert.equal(d.nextAction.type, 'map_transferable_skills');
  assert.match(d.nextAction.steps[0], /Python/);
});

test('goal only reorders within the stage set, never adds foreign action types', () => {
  for (const [stage, types] of Object.entries(STAGE_ACTIONS)) {
    for (const goal of ['internship', 'find_job', 'higher_studies', 'career_switch', 'choose_stream']) {
      assert.deepEqual([...actionOrder(stage, goal)].sort(), [...types].sort());
    }
  }
});

// ------------------------------------------------------------------ demonstrated-skill evidence & readiness gates
test('course completion ≠ skill: learned-only skills never pass the job gate', () => {
  const learnedOnly = progress([], ['Python', 'Functions', 'Arrays', 'Hash maps']);
  const { d } = run({ stage: 'graduate_unemployed', goal: 'find_job', prog: learnedOnly });
  assert.notEqual(d.nextAction.type, 'apply_jobs');
  const g = d.gated.find((x) => x.type === 'apply_jobs');
  assert.equal(g.gate.threshold.name, 'jobReadyDemonstratedSkills');
  assert.ok(d.wouldChange.some((w) => w.threshold?.name === 'jobReadyDemonstratedSkills'));
});

test('demonstrated skills pass the fallback gate (no market data): apply for jobs', () => {
  const { d } = run({ stage: 'graduate_unemployed', goal: 'find_job', prog: progress(['Python', 'Arrays']) });
  assert.equal(d.nextAction.type, 'apply_jobs');
  assert.equal(d.nextAction.gate.rule, 'demonstrated_track_skills');
});

test('high fit + high demand + weak demonstrated skills → close the gap, not apply', () => {
  const mk = { 'software-eng': market(['REST APIs', 'PostgreSQL', 'Python']) };
  const { d } = run({ stage: 'graduate_unemployed', goal: 'find_job', marketById: mk, prog: progress(['Python']) });
  assert.equal(d.evidence.market.demand, 'high');
  assert.ok(d.gated.some((g) => g.type === 'apply_jobs' && g.gate.threshold.name === 'jobReadyCoreReadiness'));
  assert.ok(['close_market_gap', 'build_skill'].includes(d.nextAction.type));
  assert.deepEqual(d.evidence.skills.missingCore, ['REST APIs', 'PostgreSQL']);
});

test('market readiness at the threshold passes the gate', () => {
  const mk = { 'software-eng': market(['Python', 'SQL']) };
  const { d } = run({ stage: 'graduate_unemployed', goal: 'find_job', marketById: mk, prog: progress(['Python']) });
  assert.equal(d.readiness.value, 50);
  assert.equal(d.nextAction.type, 'apply_jobs');
});

// ------------------------------------------------------------------ fit vs market, ties, modes
test('keep_open is a successful mode: tied careers → evidence-generating trial project', () => {
  const { d } = run({ recs: [{ domainId: 'software-eng', score: 82 }, { domainId: 'data-science', score: 79 }] });
  assert.equal(d.mode, 'keep_open');
  assert.equal(d.modeReason, 'tie');
  assert.equal(d.nextAction.type, 'trial_project');
  assert.equal(d.openDirections.length, 2);
  assert.ok(d.trace.some((x) => x.threshold?.name === 'tieBand'));
  assert.ok(d.wouldChange.some((w) => w.threshold?.name === 'tieBand'));
});

test('tie band is the configured threshold (6 points apart → commit)', () => {
  const { d } = run({ recs: [{ domainId: 'software-eng', score: 85 }, { domainId: 'data-science', score: 79 }] });
  assert.equal(d.mode, 'commit');
  assert.equal(d.direction.careerId, 'software-eng');
});

test('committed Career Development plan wins a tie', () => {
  const dev = { plan: { career_id: 'data-science', pathway_type: 'self_paced' }, evaluations: [] };
  const { d } = run({ recs: [{ domainId: 'software-eng', score: 82 }, { domainId: 'data-science', score: 79 }], dev });
  assert.equal(d.mode, 'commit');
  assert.equal(d.direction.careerId, 'data-science');
});

test('strong market demand never promotes a weak-fit career', () => {
  const recs = [{ domainId: 'software-eng', score: 80 }, { domainId: 'data-science', score: 45 }];
  const mk = { 'data-science': market(['Python'], { level: 'very_high' }) };
  const { d } = run({ recs, marketById: mk });
  assert.equal(d.direction.careerId, 'software-eng');
});

test('no career at the good tier → keep_open: explore', () => {
  const { d } = run({ recs: [{ domainId: 'software-eng', score: 50 }, { domainId: 'data-science', score: 40 }] });
  assert.deepEqual([d.mode, d.modeReason, d.nextAction.type], ['keep_open', 'no_strong_fit', 'explore_careers']);
});

// ------------------------------------------------------------------ pathway vs career, financing, family
test('pathway conflict is not a career conflict: blocked route with a viable alternative → compare pathways', () => {
  const dev = { plan: { career_id: 'research-academia', pathway_type: 'research' }, evaluations: [] };
  const inputs = { ...base, education_budget: 'gt20', education_preference: 'phd', family_priorities: ['job_security'] };
  const { d } = run({ recs: [{ domainId: 'research-academia', score: 90 }], inputs, dev });
  assert.equal(d.direction.careerId, 'research-academia', 'career kept');
  assert.equal(d.direction.routeStatus, 'blocked_with_alternative');
  assert.equal(d.direction.status, 'route_conflict');
  assert.notEqual(d.direction.status, 'career_conflict');
  assert.equal(d.nextAction.type, 'compare_pathways');
  assert.ok(d.dependencies.some((x) => x.id === 'higher_studies' && x.hard));
});

test('family-action conflict on every route → no_viable_path with a resolving action (career not rejected)', () => {
  const inputs = { ...base, family_priorities: ['location_proximity'] };
  const { d } = run({ recs: [{ domainId: 'quant-finance', score: 90 }, { domainId: 'software-eng', score: 50 }], inputs });
  assert.equal(d.mode, 'no_viable_path');
  assert.equal(d.direction.careerId, 'quant-finance');
  assert.equal(d.nextAction.type, 'resolve_family_action');
  assert.ok(d.constraints.some((c) => c.kind === 'hard'));
});

test('high fit + poor feasibility keeps the direction', () => {
  const inputs = { ...base, education_budget: 'lt2', income_band: 'lt3', risk_tolerance: 'low' };
  const { d } = run({ recs: [{ domainId: 'software-eng', score: 95 }], inputs });
  assert.equal(d.direction.careerId, 'software-eng');
  assert.ok(['commit', 'no_viable_path'].includes(d.mode));
});

test('loan is an application/approval dependency; no family co-signer is invented', () => {
  const route = { financing: { loanUsed: 3 * L, loanState: 'maybe', remainingGap: 0, status: 'conditional' }, familyActions: [] };
  const deps = routeDependencies(route);
  const loan = deps.find((x) => x.id === 'loan_approval');
  assert.equal(loan.party, 'borrower');
  assert.equal(loan.approval, 'unknown');
  assert.equal(loan.blocking, true);
  assert.ok(!deps.some((x) => /co-?sign/i.test(x.label)), 'no co-sign dependency');
  const willing = routeDependencies({ ...route, financing: { ...route.financing, loanState: 'yes', status: 'financed' } });
  assert.equal(willing.find((x) => x.id === 'loan_approval').blocking, false);
  assert.equal(willing.find((x) => x.id === 'loan_approval').approval, 'unknown', 'approval never inferred');
});

test('fully loan-dependent route → resolve financing first when the loan is undecided', () => {
  const dev = { plan: { career_id: 'product-management', pathway_type: 'higher_study' }, evaluations: [] };
  // ₹15L route: ₹10L upfront + an undecided ₹4L loan + scholarship for the rest.
  const inputs = { ...base, education_budget: '5to10', loan_willingness: 'maybe', scholarship_interest: 'yes', education_preference: 'masters_spec' };
  const { d } = run({ recs: [{ domainId: 'product-management', score: 88 }], inputs, dev });
  assert.equal(d.direction.routeStatus, 'dependent');
  assert.equal(d.evidence.financing.status, 'conditional');
  const loan = d.dependencies.find((x) => x.id === 'loan_approval');
  assert.deepEqual([loan.support, loan.approval, loan.blocking], ['undecided', 'unknown', true]);
  assert.equal(d.nextAction.type, 'resolve_financing');
  assert.ok(d.wouldChange.some((w) => /loan is approved/.test(w.condition)));
});

test('unaffordable committed route with a cheaper viable route → compare pathways, career kept', () => {
  const dev = { plan: { career_id: 'product-management', pathway_type: 'higher_study' }, evaluations: [] };
  const { d } = run({ recs: [{ domainId: 'product-management', score: 88 }], inputs: { ...base, education_budget: 'lt2', loan_willingness: 'maybe', education_preference: 'masters_spec' }, dev });
  assert.equal(d.direction.careerId, 'product-management');
  assert.equal(d.direction.routeStatus, 'blocked_with_alternative');
  assert.equal(d.nextAction.type, 'compare_pathways');
});

test('no financing requirement → no financing dependency', () => {
  const { d } = run({ inputs: { ...base, education_budget: 'gt20' } });
  assert.ok(!d.dependencies.some((x) => x.kind === 'financing'));
  assert.equal(d.evidence.financing.status, 'funded');
});

test('high repayment burden is a soft constraint, not a block', () => {
  const dev = { plan: { career_id: 'product-management', pathway_type: 'higher_study' }, evaluations: [] };
  // ₹15L route: ₹10L upfront + ~₹5L loan against ~₹2L household income → high burden.
  const inputs = { ...base, income_band: 'lt3', education_budget: '5to10', loan_willingness: 'yes', education_preference: 'masters_spec' };
  const { d } = run({ recs: [{ domainId: 'product-management', score: 88 }], inputs, dev });
  assert.equal(d.evidence.financing.status, 'financed');
  assert.equal(d.evidence.financing.repaymentBurden, 'high');
  assert.ok(d.constraints.some((c) => c.kind === 'soft' && /repayment/.test(c.text)));
  assert.ok(!d.constraints.some((c) => c.kind === 'hard' && /repayment/i.test(c.text)));
  assert.notEqual(d.direction.routeStatus, 'blocked');
});

// ------------------------------------------------------------------ missing data
test('missing feasibility/alignment/market/skills stay unknown and are listed', () => {
  const { d } = run({ inputs: null });
  assert.equal(d.evidence.feasibility, null);
  assert.equal(d.evidence.alignment, null);
  assert.equal(d.evidence.market, null);
  assert.equal(d.evidence.careerSupport, 'unknown');
  assert.equal(d.direction.routeStatus, 'unknown');
  for (const m of ['feasibility', 'alignment', 'market', 'demonstrated_skills']) assert.ok(d.confidence.missing.includes(m), m);
  assert.equal(d.confidence.level, 'low');
  assert.equal(d.nextAction.type, 'complete_feasibility');
});

test('unknown family support stays unknown (never inferred as supported)', () => {
  const { d } = run({ recs: [{ domainId: 'quant-finance', score: 90 }] });
  const rel = d.dependencies.find((x) => x.id === 'relocation');
  assert.equal(rel.support, 'unknown');
  assert.equal(rel.hard, false);
});

test('stale market data is used but flagged, and the refresh is only suggested (never triggered)', () => {
  const mk = { 'software-eng': market(['Python'], { fresh: false }) };
  const { d } = run({ marketById: mk });
  assert.equal(d.evidence.market.fresh, false);
  assert.deepEqual(d.confidence.stale, ['market']);
  assert.ok([d.nextAction, ...d.alternatives.map((a) => a.action)].some((a) => a.type === 'refresh_market') || d.constraints.some((c) => c.module === 'market'));
});

test('no assessment → complete it; nothing invented', () => {
  const { d } = run({ recs: [] });
  assert.deepEqual([d.mode, d.nextAction.type, d.direction], ['keep_open', 'complete_assessment', null]);
});

test('legacy profile: defaults to undergraduate and asks to confirm the stage first', () => {
  const { d } = run({ legacy: true });
  assert.equal(d.context.stage, 'undergraduate');
  assert.equal(d.context.isLegacy, true);
  assert.equal(d.nextAction.type, 'confirm_stage');
  assert.ok(d.alternatives.length > 0, 'still gives real actions');
});

test('works on a real Module 1 shortlist for every stage', () => {
  const profile = { branch: 'cse', interests: { int_software: 5 }, aptitude: { apt_programming: 5 }, preferences: {}, traits: {} };
  const recs = shortlist(rankCareers(profile));
  for (const stage of Object.keys(STAGE_ACTIONS)) {
    const d = decide(buildDecisionInputs({ profile: { ...profile, current_stage: stage }, recs, inputs: base }));
    assert.ok(d.nextAction?.type, stage);
    assert.ok(['commit', 'keep_open', 'no_viable_path'].includes(d.mode));
  }
});

// ------------------------------------------------------------------ Groq explanation (explanation-only)
const DN = await import('../supabase/functions/career-ai/decision.js');
const { MODE_PROVIDERS } = await import('../supabase/functions/career-ai/gateway.js');
const { fallbackNarrative, getDecisionNarrative } = await import('../src/lib/decision/narrative.js');
const { getCachedMarketForCareers } = await import('../src/lib/marketIntelligence.js');

test('decision gateway mode runs on Groq', () => {
  assert.equal(MODE_PROVIDERS.decision, 'groq');
});

test('narrative context carries no family money amounts', () => {
  const { d } = run({ inputs: { ...base, loan_willingness: 'yes', education_budget: '5to10' } });
  const ctx = JSON.stringify(DN.decisionContext(d));
  for (const k of ['income', 'budget', 'loanUsed', 'remainingGap', 'immediateGap', 'fundingCap']) assert.ok(!ctx.includes(k), k);
});

test('narrative schema cannot carry scores, actions or ranking', () => {
  const { d } = run();
  const schema = DN.decisionSchema(DN.decisionContext(d));
  assert.deepEqual(Object.keys(schema.properties).sort(), ['alternative_notes', 'summary', 'tradeoffs', 'what_would_change', 'why_this_action']);
  assert.ok(!JSON.stringify(schema).match(/score|rank|next_action|career_fit/));
});

test('validator drops invented alternatives and extra fields; decision is untouched', () => {
  const { d } = run();
  const before = structuredClone(d);
  const ctx = DN.decisionContext(d);
  const n = DN.validateDecisionNarrative({
    summary: 'S', why_this_action: 'W', tradeoffs: ['t'], what_would_change: 'x', score: 99, next_action: 'apply_jobs',
    alternative_notes: [{ action_type: 'apply_for_phd', note: 'invented' }, { action_type: ctx.alternatives[0].type, note: 'ok' }],
  }, ctx);
  assert.deepEqual(Object.keys(n.alternatives), [ctx.alternatives[0].type]);
  assert.equal(n.score, undefined);
  assert.equal(n.next_action, undefined);
  assert.deepEqual(d, before);
  assert.throws(() => DN.validateDecisionNarrative({ summary: '' }, ctx));
});

test('deterministic fallback explanation always exists, including keep_open', () => {
  for (const opts of [{}, { stage: 'school_10' }, { recs: [] }, { recs: [{ domainId: 'software-eng', score: 82 }, { domainId: 'data-science', score: 79 }] }]) {
    const n = fallbackNarrative(run(opts).d);
    assert.ok(n.summary && n.why_this_action);
  }
});

test('narrative: no AI call unless requested; AI failure falls back; AI result never alters the decision', async () => {
  const { d } = run();
  const before = structuredClone(d);
  let calls = 0;
  const off = await getDecisionNarrative({ userId: 'u-dec', decision: d, invokeFn: async () => { calls += 1; } });
  assert.deepEqual([off.status, calls], ['fallback', 0]);
  const fail = await getDecisionNarrative({ userId: 'u-dec', decision: d, request: true, invokeFn: async () => { throw new Error('down'); } });
  assert.equal(fail.status, 'fallback');
  const ok = await getDecisionNarrative({ userId: 'u-dec', decision: d, request: true, invokeFn: async ({ mode }) => {
    assert.equal(mode, 'decision');
    return { narrative: { summary: 'S', why_this_action: 'W', tradeoffs: [], alternative_notes: [], what_would_change: '' }, model: 'm' };
  } });
  assert.equal(ok.status, 'ai');
  const cached = await getDecisionNarrative({ userId: 'u-dec', decision: d });
  assert.equal(cached.status, 'cached');
  assert.deepEqual(d, before);
});

test('market batch loader is cache-only: no research is triggered, missing stays absent', async () => {
  const db = await import('../src/lib/db.js');
  const { LIST_FIELDS, MARKET_CONFIG } = await import('../supabase/functions/career-ai/market.js');
  const rec = market(['Python']);
  for (const f of LIST_FIELDS) rec.market[f] ??= [];
  Object.assign(rec, { schema_version: MARKET_CONFIG.schemaVersion, confidence: 70, sources: [{ url: 'https://example.org/a', title: 'A' }] });
  await db.saveGeneratedOutput('u-mkt', { kind: 'market_insight', subject_type: 'career', subject_key: 'software-eng', content: rec, generator: 'groq' });
  const byId = await getCachedMarketForCareers('u-mkt', ['software-eng', 'data-science']);
  assert.deepEqual(Object.keys(byId), ['software-eng']);
  assert.equal(byId['software-eng'].market.demand.level, 'high');
  assert.ok(!('data-science' in byId), 'no record → unknown, not invented');
});
