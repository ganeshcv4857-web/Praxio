// Decision Engine: per-career evidence assessment and candidate next actions.
// Everything here READS authoritative module outputs; nothing is recomputed, adjusted
// or written back. Missing evidence stays 'unknown'.

import { CAREER_BY_ID } from '../careers.js';
import { CAREER_ENTRY } from '../careerEntry.js';
import { CAREER_TRACKS, COURSE_BY_ID, courseSkills } from '../development/catalog.js';
import { skillMatches } from '../marketInsights.js';
import { SCHOOL_STREAMS } from '../userContext.js';
import { ACTION_LABELS, THRESHOLDS } from './config.js';

const nameOf = (id) => CAREER_BY_ID[id]?.name ?? id;
const streamLabel = (id) => SCHOOL_STREAMS.find((s) => s.id === id)?.label ?? id;
const has = (list, skill) => list.some((x) => skillMatches(x, skill));
const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ------------------------------------------------------------------ evidence assessment
export function fitTier(score, t = THRESHOLDS) {
  return score >= t.fitTiers.strong ? 'strong' : score >= t.fitTiers.good ? 'good' : 'moderate';
}

/** Courses of a career's track in order (first option per stage, then specialisation). */
function trackCourses(careerId) {
  const t = CAREER_TRACKS[careerId];
  if (!t) return [];
  return [...t.stages, ...(t.specialisation ? [t.specialisation] : [])].map((s) => COURSE_BY_ID[s.options[0]]).filter(Boolean);
}
export const trackSkills = (careerId) => [...new Set(trackCourses(careerId).flatMap(courseSkills))];

/**
 * Skill evidence for one career. Demonstrated = passed evaluated projects only (Module 3);
 * learned = completed modules (weaker). Readiness uses market core skills when research is
 * cached, else the career's track skills — the basis and threshold are always reported.
 */
export function skillState(career, skills, t = THRESHOLDS) {
  const { demonstrated, learned } = skills;
  const track = trackSkills(career.careerId);
  const gap = career.skillGap;
  const hasMarket = Boolean(gap && gap.items.length);
  const demoTrack = demonstrated.filter((d) => has(track, d));
  const learnedNotProven = learned.filter((l) => has(track, l) && !has(demonstrated, l));
  const missingCore = hasMarket ? gap.items.filter((i) => i.category === 'core' && i.status !== 'demonstrated') : [];

  // Next skill to build: a market core skill nobody has studied (with a course), else the
  // first track skill not yet learned or demonstrated.
  let nextSkill = null;
  const marketMissing = missingCore.find((i) => i.status === 'missing' && i.courses.length);
  if (marketMissing) {
    const c = marketMissing.courses[0];
    nextSkill = { skill: marketMissing.skill, courseId: c.courseId, course: c.title, module: c.module, basis: 'market core skill (researched)', sources: marketMissing.sources };
  } else {
    for (const c of trackCourses(career.careerId)) {
      const s = courseSkills(c).find((x) => !has(learned, x) && !has(demonstrated, x));
      if (s) { nextSkill = { skill: s, courseId: c.id, course: c.title, module: c.modules.find((m) => m.skills.includes(s))?.title ?? null, basis: 'career learning track' }; break; }
    }
  }
  // Next skill to prove: studied but never demonstrated (market core first).
  const marketLearned = missingCore.find((i) => i.status === 'learned');
  const proveSkill = marketLearned ? { skill: marketLearned.skill, basis: 'market core skill you studied' }
    : learnedNotProven[0] ? { skill: learnedNotProven[0], basis: 'completed module, not yet proven' } : null;

  const readiness = hasMarket && gap.coreReadiness != null
    ? { basis: 'market_core_readiness', value: gap.coreReadiness, threshold: { name: 'jobReadyCoreReadiness', value: t.jobReadyCoreReadiness } }
    : { basis: 'demonstrated_track_skills', value: demoTrack.length, threshold: { name: 'jobReadyDemonstratedSkills', value: t.jobReadyDemonstratedSkills } };
  readiness.jobReady = readiness.value >= readiness.threshold.value;
  const anyDemo = demoTrack.length + (hasMarket ? gap.counts.demonstrated : 0);
  readiness.level = readiness.jobReady ? 'high' : anyDemo > 0 ? 'medium' : 'low';
  readiness.demonstratedCount = Math.max(demoTrack.length, hasMarket ? gap.counts.demonstrated : 0);

  return { demonstrated: demoTrack, learnedNotProven, missingCore: missingCore.map((i) => i.skill), nextSkill, proveSkill, readiness, hasMarket };
}

/** Family view of the CAREER itself (Module 5 'aspiration' dimension) — separate from any route. */
export function careerSupport(career) {
  const d = career.alignment?.dimensions.find((x) => x.dimension === 'aspiration');
  if (!d || d.status === 'unknown') return 'unknown';
  return { aligned: 'supported', partial: 'partial', conflict: 'conflict' }[d.status];
}

const LOAN_IDS = ['loan_application', 'loan_repayment'];

/**
 * Dependencies of one route. Loans are modelled as an application/approval dependency
 * on the borrower; approval is always 'unknown' (never inferred), and no family co-signer
 * is assumed. Family actions keep the support Module 5 assigned.
 */
export function routeDependencies(route) {
  const plan = route.financing;
  const deps = [];
  if (plan.loanUsed > 0) {
    deps.push({
      id: 'loan_approval', kind: 'financing', label: 'Education loan application and approval', party: 'borrower',
      support: plan.loanState === 'yes' ? 'willing' : 'undecided', approval: 'unknown', timing: 'before_start',
      blocking: plan.loanState !== 'yes', hard: false,
      note: 'Approval and any co-applicant requirement depend on the lender; Praxio does not assume one.',
    });
  }
  for (const a of route.familyActions) {
    if (LOAN_IDS.includes(a.id) || a.id === 'upfront_funding') continue;
    const financing = a.id === 'fund_remaining';
    deps.push({
      id: a.id, kind: financing ? 'financing' : 'family', label: a.label, party: a.party, support: a.support, timing: a.timing,
      hard: a.support === 'not_supported',
      blocking: a.support === 'not_supported' || (a.support === 'conditional' && a.timing === 'before_start'),
      note: a.note ?? null,
    });
  }
  // Scholarship the plan relies on (student action, not a family one).
  if (plan.remainingGap > 0 && plan.status === 'conditional' && !deps.some((d) => d.id === 'fund_remaining')) {
    deps.push({ id: 'scholarship', kind: 'financing', label: 'Secure a scholarship', party: 'student', support: 'conditional', timing: 'before_start', hard: false, blocking: true, note: null });
  }
  return deps;
}

/**
 * Route status for a career. Pathway ≠ career: a blocked route with a viable alternative
 * is 'blocked_with_alternative', never a career rejection.
 */
export function routeState(career, plan) {
  if (!career.routes.length) return { status: 'unknown', route: null, dependencies: [], alternative: null, bridge: null };
  const committed = plan?.careerId === career.careerId ? career.routes.find((r) => r.type === plan.pathwayType && r.kind !== 'bridge') : null;
  const chosen = committed ?? career.routes.find((r) => r.recommended) ?? career.routes[0];
  const deps = routeDependencies(chosen);
  const hard = deps.filter((d) => d.hard);
  const viable = (r) => !routeDependencies(r).some((d) => d.hard);
  const alternative = career.routes.filter((r) => r.id !== chosen.id && r.kind !== 'bridge' && viable(r))
    .sort((a, b) => (b.alignmentScore ?? 0) - (a.alignmentScore ?? 0))[0] ?? null;
  const bridge = career.routes.find((r) => r.kind === 'bridge' && viable(r)) ?? null;
  let status;
  if (!hard.length) status = deps.some((d) => d.blocking) ? 'dependent' : 'clear';
  else status = alternative ? 'blocked_with_alternative' : bridge ? 'blocked_with_bridge' : 'blocked';
  return { status, route: chosen, committed: Boolean(committed), dependencies: deps, alternative, bridge };
}

// ------------------------------------------------------------------ candidate builders
const action = (type, fields) => ({ type, title: ACTION_LABELS[type], careerId: null, routeId: null, steps: [], reasons: [], ...fields });

/** Stage actions for a committed direction. Returns { candidates, gated }. */
export function stageCandidates(types, c, ctx, t = THRESHOLDS) {
  const name = nameOf(c.careerId);
  const s = c.skills;
  const entry = CAREER_ENTRY[c.careerId];
  const fitReason = { text: `Career Fit ${Math.round(c.careerFit)}% (${c.fitTier})`, basis: 'Module 1 Career Fit' };
  const out = [];
  const gated = [];
  for (const type of types) {
    const base = { careerId: c.careerId, routeId: c.route?.route?.id ?? null };
    if (type === 'compare_degrees' && entry) {
      const steps = [`Degree options: ${entry.degrees.slice(0, 3).join(' · ')}`];
      if (ctx.stream && ctx.stream !== 'undecided' && !entry.streams.includes(ctx.stream)) steps.unshift(`Usually entered via ${entry.streams.map(streamLabel).join(' / ')}; with ${streamLabel(ctx.stream)}, look at ${entry.degrees.slice(-1)[0]}`);
      const reasons = [fitReason];
      const fin = c.feasibility?.financing;
      if (fin && fin.status !== 'funded') {
        steps.push('Compare government colleges and scholarships alongside private options');
        reasons.push({ text: `Typical cost of this field's route: ${fin.statusLabel.toLowerCase()}`, basis: 'Module 2 financing (typical career cost)' });
      }
      out.push(action(type, { ...base, title: `Compare degree options for ${name}`, steps, reasons }));
    } else if (type === 'prepare_entrance' && entry) {
      out.push(action(type, { ...base, title: `Prepare for entrance exams toward ${name}`, steps: [`Common exams: ${entry.exams.slice(0, 3).join(', ')}`], reasons: [fitReason, { text: 'Typical entry route for this field', basis: 'career entry routes (prototype data)' }] }));
    } else if (type === 'build_skill' && s.nextSkill) {
      out.push(action(type, { ...base, title: `Build ${s.nextSkill.skill} for ${name}`, steps: [`Start ${s.nextSkill.course}${s.nextSkill.module ? ` → ${s.nextSkill.module}` : ''}`, 'Finish with the module project to prove it'], reasons: [fitReason, { text: `${s.nextSkill.skill} is not yet learned or demonstrated`, basis: s.nextSkill.basis, sources: s.nextSkill.sources }], gapSize: s.missingCore.length }));
    } else if (type === 'close_market_gap' && s.hasMarket && s.nextSkill?.basis.startsWith('market')) {
      out.push(action(type, { ...base, title: `Close your ${s.nextSkill.skill} gap for ${name}`, steps: [`Learn it via ${s.nextSkill.course}`, 'Prove it with an evaluated project'], reasons: [{ text: `Employers ask for: ${listOf(s.missingCore.slice(0, 4))}`, basis: 'Module 4 market research × your demonstrated skills', sources: s.nextSkill.sources }, fitReason], gapSize: s.missingCore.length }));
    } else if (type === 'complete_project' && s.proveSkill) {
      out.push(action(type, { ...base, title: `Prove ${s.proveSkill.skill} with an evaluated project`, steps: ['Open the project for the module you completed', 'Submit it on GitHub for evaluation'], reasons: [{ text: `You studied ${s.proveSkill.skill} but haven't demonstrated it; course completion is not proof of skill`, basis: s.proveSkill.basis }, fitReason], gapSize: s.missingCore.length }));
    } else if (type === 'apply_jobs' || type === 'pursue_internship') {
      const r = s.readiness;
      const pass = type === 'apply_jobs' ? r.jobReady : r.demonstratedCount >= t.internshipDemonstratedSkills;
      const gate = type === 'apply_jobs' ? { rule: r.basis, value: r.value, threshold: r.threshold }
        : { rule: 'demonstrated_relevant_skills', value: r.demonstratedCount, threshold: { name: 'internshipDemonstratedSkills', value: t.internshipDemonstratedSkills } };
      if (!pass) { gated.push({ type, title: ACTION_LABELS[type], careerId: c.careerId, gate }); continue; }
      out.push(action(type, { ...base, title: type === 'apply_jobs' ? `Apply for ${name} roles` : `Pursue a ${name} internship`, steps: ['Lead with your demonstrated skills and project links'], reasons: [{ text: `Readiness passes the prototype gate (${gate.value} vs ${gate.threshold.value})`, basis: gate.rule }, fitReason], gate }));
    } else if (type === 'pursue_higher_studies' && ctx.goal === 'higher_studies') {
      const hs = c.route?.dependencies.find((d) => d.id === 'higher_studies');
      out.push(action(type, { ...base, title: `Plan higher studies toward ${name}`, steps: ['Shortlist programmes and their admission requirements'], reasons: [fitReason, { text: hs ? `Family support for postgraduate study: ${hs.support.replace('_', ' ')}` : 'Family view on postgraduate study: unknown', basis: 'Module 5 family actions' }] }));
    } else if (type === 'pursue_certification' && s.nextSkill) {
      out.push(action(type, { ...base, title: `Upskill: ${s.nextSkill.course}`, steps: ['Take it alongside work', 'Prove it with the module project'], reasons: [fitReason, { text: `Covers ${s.nextSkill.skill}, which you haven't proven yet`, basis: s.nextSkill.basis }], gapSize: s.missingCore.length }));
    } else if (type === 'map_transferable_skills') {
      const steps = s.demonstrated.length ? [`Already proven and transferable: ${listOf(s.demonstrated.slice(0, 4))}`] : [ctx.role ? `List what you do as ${ctx.role} against ${name} skills` : `List which of your current skills carry over to ${name}`];
      if (s.nextSkill) steps.push(`First gap to bridge: ${s.nextSkill.skill}`);
      out.push(action(type, { ...base, title: `Map your transferable skills to ${name}`, steps, reasons: [fitReason, { text: `${s.demonstrated.length} demonstrated skill(s) relevant to ${name}`, basis: 'Module 3 demonstrated skills' }] }));
    } else if (type === 'take_bridge_path') {
      const br = c.route?.bridge ?? c.routes.find((r) => r.kind === 'bridge');
      if (br) out.push(action(type, { ...base, routeId: br.id, title: `Bridge into ${name} via ${nameOf(br.viaCareerId)}`, steps: [br.chain], reasons: [{ text: `Shares foundations with ${name} and aligns better with your family (${br.alignmentScore}/100)`, basis: 'Module 5 lower-risk path' }] }));
    }
  }
  return { candidates: out, gated };
}

/** Dependency actions for the direction's route (tier 'dependency' or 'later'). */
export function dependencyCandidates(c) {
  const out = [];
  const name = nameOf(c.careerId);
  const r = c.route;
  if (c.support === 'conflict') {
    out.push(action('resolve_family_action', { careerId: c.careerId, tier: 'dependency', title: `Talk through ${name} with your family`, steps: ['Discuss which family priorities this career meets and which it does not'], reasons: [{ text: 'Your family\'s stated priorities are less typically met by this career', basis: 'Module 5 career-direction dimension' }] }));
  }
  if (!r || r.status === 'unknown') return out;
  if (r.status === 'blocked_with_alternative') {
    const alt = r.alternative;
    out.push(action('compare_pathways', { careerId: c.careerId, routeId: alt.id, tier: 'dependency', title: `Switch to the ${alt.title.toLowerCase()} for ${name}`, steps: [alt.chain, `${alt.costLabel} · family alignment ${alt.alignmentScore}/100`], reasons: [{ text: `The current route needs a step that isn't supported (${r.dependencies.filter((d) => d.hard).map((d) => d.label.toLowerCase()).join(', ')}); the career itself is not ruled out`, basis: 'Module 5 family actions × Module 2 financing' }] }));
  } else if (r.status === 'blocked_with_bridge') {
    out.push(action('take_bridge_path', { careerId: c.careerId, routeId: r.bridge.id, tier: 'dependency', title: `Bridge into ${name} via ${nameOf(r.bridge.viaCareerId)}`, steps: [r.bridge.chain], reasons: [{ text: 'No direct route works right now; a shared-skills bridge does', basis: 'Module 5 lower-risk path' }] }));
  }
  if (r.status === 'blocked_with_alternative' || r.status === 'blocked_with_bridge') return out;
  for (const d of r.dependencies) {
    if (!d.blocking && d.support !== 'unknown') continue;
    const type = d.kind === 'financing' ? 'resolve_financing' : 'resolve_family_action';
    const tier = d.blocking ? 'dependency' : 'later';
    const title = d.id === 'loan_approval' ? 'Decide on and apply for the education loan'
      : d.id === 'scholarship' || d.id === 'fund_remaining' ? 'Find funding for the remaining cost'
        : d.support === 'unknown' ? `Confirm with your family: ${d.label.toLowerCase()}` : `Agree with your family: ${d.label.toLowerCase()}`;
    out.push(action(type, { careerId: c.careerId, routeId: r.route.id, tier, dependencyId: d.id, title, steps: d.note ? [d.note] : [], reasons: [{ text: `${d.label}: ${d.support.replace('_', ' ')}`, basis: d.kind === 'financing' ? 'Module 2 financing plan' : 'Module 5 family actions' }] }));
  }
  return out;
}

/** Evidence-gathering actions when the direction is deliberately kept open. */
export function keepOpenCandidates(reason, open, ctx) {
  const names = open.map((c) => nameOf(c.careerId));
  if (ctx.stage === 'school_10') {
    const streams = [...new Set(open.flatMap((c) => CAREER_ENTRY[c.careerId]?.streams.slice(0, 2) ?? []))].slice(0, 3);
    const explore = open.flatMap((c) => CAREER_ENTRY[c.careerId]?.explore.slice(0, 1) ?? []).slice(0, 3);
    return [action('explore_stream', { tier: 'stage', title: 'Explore streams before choosing a career', steps: [`Streams that keep ${listOf(names)} open: ${streams.map(streamLabel).join(', ')}`, ...explore], reasons: [{ text: 'At Class 10 the useful decision is the stream, not the final career', basis: 'stage' }] })];
  }
  if (reason === 'no_strong_fit') {
    return [action('explore_careers', { tier: 'stage', title: 'Explore more directions before committing', steps: [`Your closest matches: ${listOf(names)}`, 'Try one beginner course or activity in each'], reasons: [{ text: 'No career reaches the "good" Career Fit tier yet', basis: 'Module 1 Career Fit' }] })];
  }
  if (ctx.group === 'school') {
    return [action('compare_degrees', { tier: 'stage', title: `Compare degrees that keep ${listOf(names)} open`, steps: open.map((c) => `${nameOf(c.careerId)}: ${CAREER_ENTRY[c.careerId]?.degrees.slice(0, 2).join(' · ')}`), reasons: [{ text: 'Your top careers are too close to separate yet', basis: 'Module 1 Career Fit' }] })];
  }
  const steps = open.map((c) => (c.skills.nextSkill ? `${nameOf(c.careerId)}: try ${c.skills.nextSkill.course} and its first project` : `${nameOf(c.careerId)}: try one beginner project`));
  return [action('trial_project', { tier: 'stage', title: `Try a small project in ${listOf(names)}`, steps, reasons: [{ text: 'Your top careers are too close to separate; a project in each produces real evidence', basis: 'Module 1 Career Fit + Module 3 projects' }] })];
}

// ------------------------------------------------------------------ academic eligibility (consumed, never computed here)
const QUAL_LABEL = { class_10: 'Class 10', class_12: 'Class 12' };

/**
 * Academic dependency actions for the careers in focus (the direction, or the open set).
 * Input is bundle.academic: summarised results from the academic eligibility engine.
 * Every action requires a concrete dependency in those results; unknown stays unknown and is
 * never treated as failure.
 *   add_academic_record  a route needs a record that is missing (pending school_12 → 'later', or
 *                        'evidence' once the student says results are out; achieved-mode
 *                        requirement blocked on a missing record → 'evidence')
 *   take_subject         prospective route needs a subject the planned stream lacks, and no
 *                        route into that career is open → 'dependency'
 *   compare_routes       the career's first route is closed/uncertain while another is viable
 */
export function academicCandidates(academic, focus) {
  if (academic?.status !== 'evaluated' || !focus.length) return [];
  const byId = Object.fromEntries(academic.careers.map((a) => [a.careerId, a]));
  const inFocus = focus.map((c) => byId[c.careerId]).filter(Boolean);
  const out = [];

  // 1. Missing academic records.
  const records = new Map();
  // Results already out → the marks can be added now; awaiting/unsure → not yet urgent.
  for (const q of academic.pendingRecords) records.set(q, academic.resultsStatus === 'out' ? 'evidence' : 'later');
  for (const a of inFocus) {
    for (const r of a.routes) for (const m of r.remedies) if (m.type === 'add_record' && m.qualification) records.set(m.qualification, 'evidence');
  }
  for (const [q, tier] of [...records].sort(([a], [b]) => a.localeCompare(b))) {
    const label = QUAL_LABEL[q] ?? q;
    out.push(action('add_academic_record', {
      tier, qualification: q, title: `Add your ${label} marks`,
      steps: [`Enter or upload your ${label} subjects and marks`],
      reasons: [{ text: tier === 'evidence' ? `Entry-route requirements cannot be checked without your ${label} record` : academic.resultsStatus === 'awaiting' ? `When your ${label} results are out, adding your marks will show which entry routes are open` : `Your ${label} marks will show which entry routes are open`, basis: 'Academic eligibility' }],
    }));
  }

  // 2. Subjects needed to keep a route open (prospective only, and only if nothing is open).
  const subjects = new Map();
  for (const a of inFocus) {
    if (a.mode !== 'prospective' || a.status === 'open') continue;
    for (const r of a.routes.filter((x) => x.status === 'needs_subject')) {
      for (const m of r.remedies.filter((x) => x.type === 'take_subject' && x.subject)) {
        const e = subjects.get(m.subject) ?? { label: m.label ?? m.subject, careers: [], routes: [] };
        if (!e.careers.includes(a.careerId)) e.careers.push(a.careerId);
        if (!e.routes.includes(r.label)) e.routes.push(r.label);
        subjects.set(m.subject, e);
      }
    }
  }
  for (const [subject, e] of [...subjects].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(action('take_subject', {
      tier: 'dependency', subject, careerId: e.careers.length === 1 ? e.careers[0] : null,
      title: `Take ${e.label} in Class 11–12`,
      steps: [`Keeps ${listOf(e.routes)} open for ${listOf(e.careers.map(nameOf))}`],
      reasons: [{ text: `${listOf(e.routes)} needs ${e.label}, which your planned stream does not include`, basis: 'Academic eligibility (prospective)' }],
    }));
  }

  // 3. Another entry route when the first one is closed or uncertain.
  for (const a of inFocus) {
    if (a.routes.length < 2) continue;
    const [primary, ...alts] = a.routes;
    let tier = null;
    let viable = [];
    if (a.mode === 'achieved' && primary.status === 'not_eligible') {
      viable = alts.filter((r) => r.status !== 'not_eligible');
      tier = viable.length ? 'dependency' : null;
    } else if (a.mode === 'achieved' && primary.status === 'unknown') {
      viable = alts.filter((r) => r.status === 'eligible');
      tier = viable.length ? 'later' : null;
    } else if (a.mode === 'prospective' && primary.status === 'needs_subject') {
      viable = alts.filter((r) => r.status === 'open');
      tier = viable.length ? 'later' : null;
    }
    if (!tier) continue;
    out.push(action('compare_routes', {
      tier, careerId: a.careerId, title: `Compare entry routes into ${nameOf(a.careerId)}`,
      steps: viable.map((r) => `${r.label}: ${r.status.replace('_', ' ')}`),
      reasons: [{ text: `${primary.label} is ${primary.status.replace('_', ' ')}; the career is not ruled out`, basis: 'Academic eligibility (entry routes)' }],
    }));
  }
  return out;
}
