// Pathway selection: which realistic route should this student take into a career?
//
//   pathScore = 0.25·careerFit + 0.25·feasibility + 0.20·budget + 0.15·study + 0.15·requirement
//
// careerFit comes from Module 1 (stored recommendation score), feasibility from the
// Module 2 engine, and budget/study/requirement compare each pathway with the
// student's Module 2 answers. Deterministic — no LLM.

import { CAREER_BY_ID } from '../careers.js';
import { CAREER_COSTS } from '../feasibility/careerCosts.js';
import { EDUCATION_OPTIONS, LEVEL_GAP_SCORES, byId } from '../feasibility/config.js';
import { categoryOf, evaluateCareer, studentCapacity } from '../feasibility/scoring.js';
import { formatLakh } from '../feasibility/careerCosts.js';
import { CAREER_TRACKS, COURSE_BY_ID, PROGRAMMES, formatPrice } from './catalog.js';
import {
  BUDGET_TIER_LABEL, COURSE_PRICE_CAP, MS_ABROAD_MIN_FUNDING, OVERQUALIFY_PENALTY, PATH_WEIGHTS,
} from './config.js';

// Same per-level penalties Module 2 uses for "education compatibility".
const REQUIREMENT_GAP_PENALTY = { low: 15, medium: 25, high: 40 };

export const PATHWAY_TYPES = {
  self_paced: { label: 'Self-paced: free & low-cost learning', short: 'Self-paced learning' },
  structured: { label: 'Structured certificate programmes', short: 'Certificate programmes' },
  higher_study: { label: 'Higher studies', short: 'Higher studies' },
  research: { label: 'Research (PhD) route', short: 'PhD route' },
};

const levelLabel = (level) => EDUCATION_OPTIONS.find((o) => o.level === level)?.label.replace(/^Open to /, '') ?? '';

export const priceCapFor = (inputs) => COURSE_PRICE_CAP[inputs.education_budget] ?? COURSE_PRICE_CAP.lt2;

/** Pick one course for a stage. mode 'cheapest' or 'richest' (most structured within the cap). */
function pickCourse(options, used, cap, mode) {
  const avail = options.filter((id) => COURSE_BY_ID[id] && !used.has(id));
  if (!avail.length) return null;
  const within = avail.filter((id) => COURSE_BY_ID[id].price <= cap);
  const pool = within.length ? within : avail;
  const sorted = [...pool].sort((a, b) => COURSE_BY_ID[a].price - COURSE_BY_ID[b].price);
  const id = mode === 'richest' ? sorted[sorted.length - 1] : sorted[0];
  return { courseId: id, overCap: !within.length };
}

function courseStages(stages, used, cap, mode) {
  const out = [];
  for (const st of stages) {
    const pick = pickCourse(st.options, used, cap, mode);
    if (!pick) continue;
    used.add(pick.courseId);
    out.push({
      kind: 'course',
      title: st.title,
      courseId: pick.courseId,
      overCap: pick.overCap,
      alternatives: st.options.filter((id) => id !== pick.courseId && COURSE_BY_ID[id]),
    });
  }
  return out;
}

const programmeStage = (p) => ({ kind: 'programme', title: p.title, programme: p.id });
const milestone = (title) => ({ kind: 'milestone', title });

/** Candidate pathways for one career, built from its track and the student's budget. */
export function buildPathways(careerId, inputs) {
  const track = CAREER_TRACKS[careerId];
  if (!track) return [];
  const cap = priceCapFor(inputs);
  const capacity = studentCapacity(inputs);
  const pathways = [];

  // 1. Self-paced: cheapest option per stage, straight to work.
  const selfStages = courseStages(track.stages, new Set(), cap, 'cheapest');
  pathways.push({ type: 'self_paced', educationLevel: 0, stages: [...selfStages, milestone('Internship → first role')] });

  // 2. Structured: richest option per stage within budget — only if it differs.
  const structStages = courseStages(track.stages, new Set(), cap, 'richest');
  if (structStages.some((s, i) => s.courseId !== selfStages[i]?.courseId)) {
    pathways.push({ type: 'structured', educationLevel: 0, stages: [...structStages, milestone('Internship → first role')] });
  }

  // 3. Higher study: foundations, then the programme, then specialisation.
  let programme = PROGRAMMES[track.programme];
  if (programme.id === 'mtech' && capacity.mobility === 2 && capacity.fundingCap >= MS_ABROAD_MIN_FUNDING) {
    programme = PROGRAMMES.ms_abroad;
  }
  const used = new Set();
  const base = courseStages(track.stages.slice(0, 2), used, cap, 'cheapest');
  const spec = courseStages([track.specialisation], used, cap, 'cheapest');
  const isPhd = programme.id === 'phd';
  pathways.push({
    type: isPhd ? 'research' : 'higher_study',
    educationLevel: programme.educationLevel,
    stages: [...base, programmeStage(programme), ...spec, milestone(isPhd ? 'Research publications → academic role' : 'Advanced projects → internship')],
  });

  // 4. Research route for careers where postgraduate study matters most.
  if (!isPhd && CAREER_COSTS[careerId]?.higherStudyImportance === 'high') {
    const u = new Set();
    pathways.push({
      type: 'research',
      educationLevel: PROGRAMMES.phd.educationLevel,
      stages: [
        ...courseStages(track.stages.slice(0, 2), u, cap, 'cheapest'),
        programmeStage(PROGRAMMES.phd),
        ...courseStages([track.specialisation], u, cap, 'cheapest'),
        milestone('Research publications → R&D role'),
      ],
    });
  }

  return pathways.map((p) => ({
    ...p,
    id: `${careerId}:${p.type}`,
    careerId,
    title: PATHWAY_TYPES[p.type].label,
    cost: pathwayCost(p),
  }));
}

export function pathwayCost(p) {
  return p.stages.reduce((sum, s) => {
    if (s.kind === 'course') return sum + COURSE_BY_ID[s.courseId].price;
    if (s.kind === 'programme') return sum + PROGRAMMES[s.programme].price;
    return sum;
  }, 0);
}

const gapScore = (gap) => (gap <= 0 ? 100 : LEVEL_GAP_SCORES[Math.min(gap, LEVEL_GAP_SCORES.length - 1)]);
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Score one pathway. `rec` is the Module 1 recommendation for its career. */
export function scorePathway(pathway, rec, inputs) {
  const capacity = studentCapacity(inputs);
  const career = CAREER_COSTS[pathway.careerId];
  const feasibility = evaluateCareer(pathway.careerId, inputs);
  const needed = byId(EDUCATION_OPTIONS, career.typicalEducation).level;

  const reqGap = needed - pathway.educationLevel;
  const components = {
    careerFit: clamp(rec.score),
    feasibility: feasibility.score,
    budget: pathway.cost <= capacity.fundingCap ? 100 : clamp((100 * capacity.fundingCap) / pathway.cost),
    study: gapScore(pathway.educationLevel - capacity.educationLevel),
    requirement: reqGap > 0
      ? clamp(100 - reqGap * REQUIREMENT_GAP_PENALTY[career.higherStudyImportance])
      : clamp(100 - -reqGap * OVERQUALIFY_PENALTY),
  };
  const score = clamp(Object.entries(PATH_WEIGHTS).reduce((s, [k, w]) => s + w * components[k], 0));
  return { ...pathway, score, components, feasibility, reasons: explainPathway(pathway, components, feasibility, capacity, inputs, needed) };
}

function explainPathway(p, c, feasibility, capacity, inputs, needed) {
  const name = CAREER_BY_ID[p.careerId].name;
  const cat = categoryOf(feasibility.category);
  const reasons = [];
  reasons.push(
    c.careerFit >= 75 ? `Strong ${name} career fit (${c.careerFit}%)`
      : c.careerFit >= 55 ? `Good ${name} career fit (${c.careerFit}%)`
        : `Moderate ${name} career fit (${c.careerFit}%)`
  );
  reasons.push(`${cat.emoji} ${cat.label} for your family (${feasibility.score}%)`);
  reasons.push(
    c.budget === 100
      ? `Fits your education budget (${formatPrice(p.cost)} vs ${formatLakh(capacity.fundingCap)} available)`
      : `Costs about ${formatPrice(p.cost)}, above the ${formatLakh(capacity.fundingCap)} available`
  );
  if (p.educationLevel === 0) {
    reasons.push(capacity.educationLevel === 0
      ? 'Lets you start working after your degree, as you prefer'
      : 'No postgraduate study needed: you build skills through courses and projects');
  } else if (c.study === 100) {
    reasons.push(`Matches your openness to ${levelLabel(capacity.educationLevel).toLowerCase()}`);
  } else {
    reasons.push(`Needs more study (${levelLabel(p.educationLevel).toLowerCase()}) than you currently plan`);
  }
  if (needed > p.educationLevel) {
    reasons.push(`${name} often expects postgraduate study; this path relies on projects and certificates instead`);
  } else if (needed > 0) {
    reasons.push(`Includes the postgraduate study ${name} usually expects`);
  }
  if (p.stages.some((s) => s.kind === 'course')) {
    reasons.push(`Courses chosen for ${BUDGET_TIER_LABEL[inputs.education_budget] ?? 'your budget'}`);
  }
  return reasons;
}

/** Every pathway for every recommended career, best first. */
export function rankPathways(recs, inputs) {
  return recs
    .flatMap((rec) => buildPathways(rec.domainId, inputs).map((p) => scorePathway(p, rec, inputs)))
    .sort((a, b) => b.score - a.score || b.components.careerFit - a.components.careerFit);
}

/** "B.Tech → Python → … → Internship" */
export function pathwayChain(p) {
  return ['B.Tech', ...p.stages.map((s) => (s.kind === 'course' ? COURSE_BY_ID[s.courseId].title : s.title))].join(' → ');
}
