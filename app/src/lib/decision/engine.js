// Praxio Decision Engine. Pure and deterministic: the same bundle always gives the same
// decision. It turns existing evidence, constraints and demonstrated capability into the
// most useful NEXT ACTION. It is tier-based (no aggregate weights) and never mutates or
// re-scores any module output. Groq may only explain the result (see narrative.js).
//
//   1. assess evidence     → which modules are present / fresh
//   2. classify directions → fit tier, career support, route status, skill readiness
//   3. decision mode       → commit | keep_open | no_viable_path
//   4. candidates          → evidence / dependency / stage / later actions
//   5. gates               → readiness gates remove premature actions (recorded)
//   6. rank                → tier, then stage order (goal-promoted), then tie-breaks
//   7. output              → action, evidence, constraints, alternatives, what would change

import { CAREER_BY_ID } from '../careers.js';
import {
  ACTION_LABELS, COST_RELEVANT_STAGES, DECISION_VERSION, GOAL_PROMOTES, SCHOOL_STAGES, STAGE_ACTIONS, THRESHOLDS, TIERS,
} from './config.js';
import { careerSupport, dependencyCandidates, fitTier, keepOpenCandidates, routeState, skillState, stageCandidates } from './candidates.js';

const DEMAND_RANK = { very_high: 5, high: 4, moderate: 3, mixed: 2, low: 1, unknown: 0 };
const nameOf = (id) => CAREER_BY_ID[id]?.name ?? id;

/** Stage action order with the goal's promoted types moved first. */
export function actionOrder(stage, goal) {
  const base = STAGE_ACTIONS[stage] ?? [];
  const promoted = (GOAL_PROMOTES[goal] ?? []).filter((t) => base.includes(t));
  return [...promoted, ...base.filter((t) => !promoted.includes(t))];
}

function classify(bundle, t) {
  const school = SCHOOL_STAGES.includes(bundle.context.stage);
  return bundle.careers.map((c) => {
    const skills = skillState(c, bundle.skills, t);
    // Module 3 pathways assume a post-B.Tech route: not applied to school stages.
    const route = school ? { status: 'not_applicable', route: null, dependencies: [], alternative: null, bridge: null } : routeState(c, bundle.development.plan);
    const support = careerSupport(c);
    const status = support === 'conflict' ? 'career_conflict'
      : route.status.startsWith('blocked') ? 'route_conflict'
        : route.status === 'dependent' ? 'dependent'
          : route.status === 'clear' ? 'clear' : 'unknown';
    return { ...c, fitTier: fitTier(c.careerFit, t), support, route, skills, directionStatus: status };
  });
}

function chooseMode(bundle, careers, t, trace) {
  const { stage, goal } = bundle.context;
  const plan = bundle.development.plan;
  if (!careers.length) return { mode: 'keep_open', reason: 'no_assessment', open: [] };
  const byFit = [...careers].sort((a, b) => b.careerFit - a.careerFit || a.careerId.localeCompare(b.careerId));
  const eligible = byFit.filter((c) => c.fitTier !== 'moderate');
  trace.push({ rule: 'fit_tiers', detail: `${eligible.length} of ${careers.length} careers at or above the "good" tier`, threshold: { name: 'fitTiers.good', value: t.fitTiers.good } });
  if (stage === 'school_10') return { mode: 'keep_open', reason: 'stage_exploration', open: byFit.slice(0, 3) };
  if (!eligible.length) return { mode: 'keep_open', reason: 'no_strong_fit', open: byFit.slice(0, 3) };
  if (goal === 'explore_careers' && !plan) return { mode: 'keep_open', reason: 'goal_exploration', open: eligible.slice(0, 3) };
  const viable = eligible.filter((c) => c.route.status !== 'blocked');
  if (!viable.length) {
    trace.push({ rule: 'no_viable_route', detail: 'Every well-fitting career has a blocked route with no alternative' });
    return { mode: 'no_viable_path', reason: 'all_routes_blocked', direction: eligible[0] };
  }
  const planned = plan && viable.find((c) => c.careerId === plan.careerId);
  if (planned) {
    trace.push({ rule: 'committed_plan', detail: `Keeps the career you chose in Career Development (${nameOf(planned.careerId)})` });
    return { mode: 'commit', reason: 'committed_plan', direction: planned };
  }
  const [top, second] = viable;
  const tied = viable.filter((c) => top.careerFit - c.careerFit <= t.tieBand);
  if (second && tied.length > 1) {
    trace.push({ rule: 'tie_band', detail: `${tied.map((c) => nameOf(c.careerId)).join(', ')} are within ${t.tieBand} Career Fit points`, threshold: { name: 'tieBand', value: t.tieBand } });
    return { mode: 'keep_open', reason: 'tie', open: tied.slice(0, 3) };
  }
  trace.push({ rule: 'clear_lead', detail: `${nameOf(top.careerId)} leads by more than ${t.tieBand} points`, threshold: { name: 'tieBand', value: t.tieBand } });
  return { mode: 'commit', reason: 'clear_lead', direction: top };
}

function evidenceOf(c) {
  const routeFin = c.route?.route?.financing ?? null;
  const fin = routeFin ?? c.feasibility?.financing ?? null;
  return {
    careerFit: c.careerFit,
    fitTier: c.fitTier,
    feasibility: c.feasibility ? { score: c.feasibility.score, category: c.feasibility.category, weakest: c.feasibility.weakest } : null,
    financing: fin ? { status: fin.status, label: fin.statusLabel, mechanism: fin.mechanism, loanState: fin.loanState, repaymentBurden: fin.repayment.burden, basis: routeFin ? 'route cost' : 'typical career cost' } : null,
    alignment: c.alignment ? { score: c.alignment.score, category: c.alignment.category?.id ?? null, coverage: c.alignment.coverage, tentative: c.alignment.tentative } : null,
    careerSupport: c.support,
    route: c.route.route ? { id: c.route.route.id, title: c.route.route.title, chain: c.route.route.chain, status: c.route.status, committed: c.route.committed } : { status: c.route.status },
    market: c.market ? { demand: c.market.demand.level, trend: c.market.demand.trend, fresh: c.market.fresh, researchedAt: c.market.researchedAt, sources: c.market.demand.sources ?? [] } : null,
    skills: { demonstrated: c.skills.demonstrated, learnedNotProven: c.skills.learnedNotProven, missingCore: c.skills.missingCore, readiness: c.skills.readiness },
  };
}

function constraintsOf(c, school) {
  const out = [];
  for (const d of c.route.dependencies) if (d.hard) out.push({ kind: 'hard', text: `${d.label}: not supported`, module: d.kind === 'financing' ? 'feasibility' : 'alignment' });
  const fin = c.route?.route?.financing ?? (school ? null : c.feasibility?.financing);
  if (fin?.repayment.burden === 'high') out.push({ kind: 'soft', text: 'High loan-repayment burden relative to household income', module: 'feasibility' });
  if (c.feasibility?.category === 'barrier') out.push({ kind: 'soft', text: c.feasibility.consideration, module: 'feasibility' });
  if (c.support === 'conflict') out.push({ kind: 'soft', text: 'This career is less typically associated with what your family values', module: 'alignment' });
  if (c.market && !c.market.fresh) out.push({ kind: 'soft', text: 'Market research is out of date', module: 'market' });
  return out;
}

function confidenceOf(bundle, c, school) {
  const missing = [];
  if (!bundle.modules.assessment) missing.push('assessment');
  if (!school || bundle.context.stage === 'school_12') if (!bundle.modules.feasibility) missing.push('feasibility');
  if (!school && !bundle.modules.alignment) missing.push('alignment');
  if (!school && c && !c.market) missing.push('market');
  if (!school && !bundle.skills.demonstrated.length) missing.push('demonstrated_skills');
  const stale = !school && c?.market && !c.market.fresh ? ['market'] : [];
  return { level: missing.length === 0 && !stale.length ? 'high' : missing.length <= 1 ? 'medium' : 'low', missing, stale, meaning: 'How complete the evidence is, not a prediction of success' };
}

function rank(cands, order) {
  const key = (a) => [
    TIERS.indexOf(a.tier),
    a.tier === 'stage' ? (order.includes(a.type) ? order.indexOf(a.type) : order.length) : 0,
    -(a.gapSize ?? 0),
    -(DEMAND_RANK[a._demand] ?? 0),
    -(a._fit ?? 0),
    a.careerId ?? '',
    a.type,
  ];
  return [...cands].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  });
}

const clean = ({ _demand, _fit, ...a }) => a;

/**
 * Decide the next action. `bundle` = buildDecisionInputs(...). Never mutates it.
 * `thresholds` is injectable for tests; defaults to the versioned prototype constants.
 */
export function decide(bundle, { thresholds = THRESHOLDS } = {}) {
  const t = thresholds;
  const trace = [];
  const ctx = bundle.context;
  const school = SCHOOL_STAGES.includes(ctx.stage);
  const careers = classify(bundle, t);
  const m = chooseMode(bundle, careers, t, trace);
  const order = actionOrder(ctx.stage, ctx.goal);
  const c = m.direction ?? null;

  let cands = [];
  let gated = [];
  // Evidence actions
  if (m.reason === 'no_assessment') cands.push({ type: 'complete_assessment', title: ACTION_LABELS.complete_assessment, tier: 'evidence', careerId: null, steps: [], reasons: [{ text: 'Praxio needs your Career Fit before anything else', basis: 'missing Module 1' }] });
  if (ctx.isLegacy) cands.push({ type: 'confirm_stage', title: ACTION_LABELS.confirm_stage, tier: 'evidence', careerId: null, steps: ['Your account predates stages, so Praxio assumed "Undergraduate"'], reasons: [{ text: 'Advice depends on your current stage', basis: 'legacy profile' }] });
  if (bundle.modules.assessment && !bundle.modules.feasibility && ctx.stage !== 'school_10') {
    cands.push({ type: 'complete_feasibility', title: ACTION_LABELS.complete_feasibility, tier: COST_RELEVANT_STAGES.includes(ctx.stage) ? 'evidence' : 'later', careerId: null, steps: ['Answer the family & financial check (Module 2)'], reasons: [{ text: 'Cost, financing and family steps are unknown until then', basis: 'missing Module 2' }] });
  }

  if (m.mode === 'keep_open' && m.reason !== 'no_assessment') {
    cands.push(...keepOpenCandidates(m.reason, m.open, ctx));
  } else if (c) {
    if (!school) cands.push(...dependencyCandidates(c));
    const st = stageCandidates(order, c, ctx, t);
    cands.push(...st.candidates.map((a) => ({ ...a, tier: 'stage' })));
    gated = st.gated;
    gated.forEach((g) => trace.push({ rule: 'readiness_gate', detail: `${g.title} held back: ${g.gate.rule} = ${g.gate.value}`, threshold: g.gate.threshold }));
    if (!school && (!c.market || !c.market.fresh)) {
      cands.push({ type: 'refresh_market', title: ACTION_LABELS.refresh_market, tier: 'later', careerId: c.careerId, steps: [`Open Market Intelligence for ${nameOf(c.careerId)}`], reasons: [{ text: c.market ? 'Cached research is out of date' : 'No market research cached for this career', basis: 'Module 4 cache' }] });
    }
  }
  if (!cands.length && c) {
    cands.push({ type: 'explore_careers', title: ACTION_LABELS.explore_careers, tier: 'later', careerId: c.careerId, steps: ['Review your learning path or explore a specialisation'], reasons: [{ text: 'No open stage action remains for this direction', basis: 'Module 3 progress' }] });
  }

  const byId = Object.fromEntries(careers.map((x) => [x.careerId, x]));
  const ranked = rank(cands.map((a) => ({ ...a, _fit: byId[a.careerId]?.careerFit, _demand: byId[a.careerId]?.market?.demand.level })), order).map(clean);
  const [nextAction, ...rest] = ranked;
  trace.push({ rule: 'rank', detail: `Tier "${nextAction.tier}" chosen first (order: ${TIERS.join(' → ')})` });

  const whyNot = (a) => (a.tier !== nextAction.tier
    ? `Ranks after: ${nextAction.tier === 'evidence' ? 'missing evidence comes first' : nextAction.tier === 'dependency' ? 'a blocking dependency must be resolved first' : 'lower-priority for your stage'}`
    : 'Comes later in your stage\'s order');

  const wouldChange = [];
  gated.forEach((g) => wouldChange.push({ condition: g.gate.rule === 'market_core_readiness' ? `Demonstrating at least ${g.gate.threshold.value}% of the core skills employers ask for` : `Demonstrating at least ${g.gate.threshold.value} relevant skill(s) in evaluated projects`, change: `${g.title} becomes available`, threshold: g.gate.threshold }));
  if (m.reason === 'tie') wouldChange.push({ condition: `One career pulling ahead by more than ${t.tieBand} Career Fit points, or committing to one in Career Development`, change: 'Praxio commits to that direction', threshold: { name: 'tieBand', value: t.tieBand } });
  if (c) {
    for (const d of c.route.dependencies) {
      if (d.id === 'loan_approval') wouldChange.push({ condition: 'The education loan is approved (approval status is unknown to Praxio)', change: 'The financing dependency is resolved' });
      else if (d.support === 'unknown') wouldChange.push({ condition: `Your family confirming: ${d.label.toLowerCase()}`, change: 'This route\'s dependency becomes known' });
    }
    if (c.route.status === 'blocked_with_alternative') wouldChange.push({ condition: 'Your family supporting the step the current route needs', change: 'The current route becomes viable again' });
  }
  if (!bundle.modules.feasibility && ctx.stage !== 'school_10') wouldChange.push({ condition: 'Completing the feasibility check', change: 'Cost, financing and family steps are taken into account' });

  const evidence = c ? evidenceOf(c) : null;
  return {
    version: DECISION_VERSION,
    thresholds: { ...t, fitTiers: { ...t.fitTiers } },
    context: { stage: ctx.stage, stageLabel: ctx.stageLabel, goal: ctx.goal, isLegacy: ctx.isLegacy },
    mode: m.mode,
    modeReason: m.reason,
    direction: c ? { careerId: c.careerId, name: nameOf(c.careerId), fitTier: c.fitTier, careerFit: c.careerFit, careerSupport: c.support, status: c.directionStatus, routeId: c.route.route?.id ?? null, routeStatus: c.route.status } : null,
    openDirections: (m.open ?? []).map((x) => ({ careerId: x.careerId, name: nameOf(x.careerId), careerFit: x.careerFit, fitTier: x.fitTier })),
    nextAction,
    evidence,
    constraints: c ? constraintsOf(c, school) : [],
    dependencies: c ? c.route.dependencies.map((d) => ({ ...d })) : [],
    alternatives: rest.slice(0, 3).map((a) => ({ action: a, whyNotFirst: whyNot(a) })),
    gated,
    readiness: c ? { level: c.skills.readiness.level, basis: c.skills.readiness.basis, value: c.skills.readiness.value, threshold: c.skills.readiness.threshold } : null,
    confidence: confidenceOf(bundle, c, school),
    wouldChange,
    trace,
  };
}
