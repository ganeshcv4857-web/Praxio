// Stage-aware interpretation of Career Fit: same deterministic score, different "next step"
// depending on where the person is (10th → stream, 12th → degree/exams, UG → skills/projects,
// graduate → employability gaps, professional → transition). Never changes any score.

import { CAREER_BY_ID } from './careers.js';
import { CAREER_ENTRY } from './careerEntry.js';
import { CAREER_TRACKS, COURSE_BY_ID, courseSkills } from './development/catalog.js';
import { SCHOOL_STREAMS } from './userContext.js';
import { skillMatches } from './marketInsights.js';

const streamLabel = (id) => SCHOOL_STREAMS.find((s) => s.id === id)?.label ?? id;
const trackCourses = (careerId, n = 2) =>
  (CAREER_TRACKS[careerId]?.stages ?? []).slice(0, n).map((s) => COURSE_BY_ID[s.options[0]]).filter(Boolean);

const FIT_PHRASE = {
  school: 'This field may suit you',
  college: 'A direction to build toward',
  graduate: 'This field fits your profile',
  working: 'A possible next move',
};

/**
 * { headline, steps: [{ text, kind }], basis }
 *   ctx:          userContext(profile)
 *   demonstrated: demonstrated skill names (Module 3, passed projects only)
 *   marketGap:    optional marketSkillGap() result (Module 4)
 */
export function stageGuidance({ careerId, ctx, demonstrated = [], marketGap = null }) {
  const career = CAREER_BY_ID[careerId];
  const entry = CAREER_ENTRY[careerId];
  const steps = [];
  let basis = 'Career Fit';

  if (ctx.stage === 'school_10') {
    steps.push({ kind: 'stream', text: `Consider ${entry.streams.slice(0, 2).map(streamLabel).join(' or ')} in Class 11` });
    entry.explore.slice(0, 2).forEach((t) => steps.push({ kind: 'explore', text: t }));
    basis = 'Career Fit + typical entry routes';
  } else if (ctx.stage === 'school_11' || ctx.stage === 'school_12') {
    if (ctx.stream && ctx.stream !== 'undecided' && !entry.streams.includes(ctx.stream)) {
      steps.push({ kind: 'note', text: `Usually entered via ${entry.streams.map(streamLabel).join(' / ')}; with ${streamLabel(ctx.stream)}, look at: ${entry.degrees.slice(-1)[0]}` });
    }
    steps.push({ kind: 'degree', text: `Degree options: ${entry.degrees.slice(0, 3).join(' · ')}` });
    steps.push({ kind: 'exam', text: `Entrance exams: ${entry.exams.slice(0, 3).join(', ')}` });
    basis = 'Career Fit + typical entry routes';
  } else if (ctx.group === 'college') {
    for (const c of trackCourses(careerId)) steps.push({ kind: 'skill', text: `Build ${courseSkills(c).slice(0, 3).join(', ')} (${c.title})` });
    steps.push({ kind: 'project', text: ctx.goal === 'internship' || ctx.goal === 'placement' ? 'Prove skills with projects before internship/placement season' : 'Prove each skill with a project in your learning path' });
    basis = 'Career Fit + learning path';
  } else if (ctx.group === 'graduate') {
    const missing = marketGap?.items.filter((i) => i.category === 'core' && i.status !== 'demonstrated').map((i) => i.skill) ?? [];
    if (missing.length) {
      steps.push({ kind: 'gap', text: `Skills employers ask for that you haven't proven yet: ${missing.slice(0, 4).join(', ')}` });
      basis = 'Career Fit + market skill gap';
    } else {
      for (const c of trackCourses(careerId)) steps.push({ kind: 'skill', text: `Show employers ${courseSkills(c).slice(0, 3).join(', ')}` });
      steps.push({ kind: 'market', text: 'Research the market for this role to see current skill gaps' });
    }
    steps.push({ kind: 'project', text: 'Demonstrate at least one core skill with an evaluated project' });
  } else {
    const trackSkills = trackCourses(careerId, 4).flatMap((c) => courseSkills(c));
    const transferable = demonstrated.filter((d) => trackSkills.some((s) => skillMatches(s, d)));
    steps.push(transferable.length
      ? { kind: 'transfer', text: `Transferable skills you've already proven: ${transferable.slice(0, 4).join(', ')}` }
      : { kind: 'transfer', text: ctx.role ? `Map what you do as ${ctx.role} to this field's skills` : 'Identify which of your current skills carry over' });
    const first = trackCourses(careerId, 1)[0];
    if (first) steps.push({ kind: 'skill', text: `Start with ${first.title} alongside work` });
    steps.push({ kind: 'transition', text: 'Check the cost and risk of the transition in Feasibility and Family alignment' });
    basis = 'Career Fit + demonstrated skills';
  }

  return { headline: `${FIT_PHRASE[ctx.group]}: ${career.name}`, steps: steps.slice(0, 3), basis };
}
