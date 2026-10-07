// Assessment question catalog: every question Praxio asks, who sees it, and which module
// consumes the answer. Pure data + pure predicates; the planner (planner.js) decides what to
// show, deterministically. No AI decides which question is asked.
//
// Question:
//   id        stable id; a change of MEANING requires a new id (old answers keep theirs)
//   v         version; bump for wording-only changes
//   assessment 'profile' (Module 1 onboarding) | 'feasibility' (Module 2 wizard)
//   page      page id (pages keep the existing page-based UX)
//   kind      'choice' | 'multi' | 'text' | 'likert' | 'slider' | 'quiz'
//   field     where the answer is stored ('interests.int_software', 'school_stream', 'quiz.0', …)
//   stages    stage ids that see it (null = every stage)
//   goals     primary goals that see it (null = any goal)
//   when      optional pure predicate (answers, ctx) → boolean, for prerequisites/branching
//   required  must be answered (a real value or an explicit unknown) before the page is done
//   unknown   how "I don't know" is stored: null (not offered) | 'absent' (left out of the module input)
//   feeds     [{ module, use }] — the downstream consumers (must be real)
//   purpose   why the question exists
//   priority  ordering within a page (lower first)

import { INTERESTS, APTITUDES, TRAITS, PREFERENCES, BRANCHES } from '../features.js';
import { APTITUDE_QUIZ } from '../quiz.js';
import { ACTIVITIES, SCHOOL_STREAMS, STAGES } from '../userContext.js';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS, LOCATION_OPTIONS,
  PRIMARY_FUNDERS, RELOCATION_OPTIONS, RISK_LEVELS, SCHOLARSHIP_OPTIONS,
} from '../feasibility/config.js';

export const ASSESSMENT_VERSION = 'assessment-v1';
// Profiles stored before versioning existed answered this questionnaire.
export const LEGACY_ASSESSMENT_VERSION = 'assessment-v1';

// Downstream consumers a question may feed.
export const MODULES = ['user_context', 'career_fit', 'academic_eligibility', 'decision_engine', 'stage_guidance', 'market', 'alignment', 'feasibility', 'presentation'];

export const PAGES = {
  profile: ['stage', 'about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
  feasibility: ['finances', 'education', 'priorities'],
};

const ALL = null;
const NOT_10 = ['school_11', 'school_12', 'undergraduate', 'postgraduate', 'graduate_unemployed', 'employed_professional', 'career_switcher'];
const DEGREE = ['undergraduate', 'postgraduate', 'graduate_unemployed', 'employed_professional', 'career_switcher'];

// Career Fit features weighted by at least one career are real consumers; int_people is not.
const fit = (field) => [{ module: 'career_fit', use: `feature ${field.split('.').pop()}` }];
const q = (o) => Object.freeze({ v: 1, goals: null, when: null, required: false, unknown: null, priority: 50, ...o });

const QUESTIONS = [
  // ---- Module 1: stage page
  q({ id: 'current_stage', assessment: 'profile', page: 'stage', kind: 'choice', field: 'current_stage', label: 'Where are you currently in your journey?', options: STAGES.map((s) => s.id),
    stages: ALL, required: true, priority: 1, purpose: 'Selects the stage-specific assessment and interpretation',
    feeds: [{ module: 'user_context', use: 'stage' }, { module: 'decision_engine', use: 'stage actions' }, { module: 'academic_eligibility', use: 'prospective vs achieved mode' }] }),
  q({ id: 'current_activity', assessment: 'profile', page: 'stage', kind: 'choice', field: 'current_activity', label: 'What are you mainly doing right now?', options: ACTIVITIES.map((a) => a.id),
    stages: ALL, required: true, priority: 2, purpose: 'Asked today, but no module branches on it',
    feeds: [] }),
  q({ id: 'primary_goal', assessment: 'profile', page: 'stage', kind: 'choice', field: 'primary_goal', label: 'What do you most want help with?', options: 'stage_goals',
    stages: ALL, required: true, priority: 3, purpose: 'Orders the next actions within the stage',
    feeds: [{ module: 'decision_engine', use: 'goal-promoted action order' }, { module: 'stage_guidance', use: 'goal wording' }] }),

  // ---- Module 1: about page
  q({ id: 'full_name', assessment: 'profile', page: 'about', kind: 'text', field: 'full_name', label: 'Your name',
    stages: ALL, required: true, priority: 1, purpose: 'Greeting and personalised explanations',
    feeds: [{ module: 'presentation', use: 'greeting' }] }),
  q({ id: 'school_stream', assessment: 'profile', page: 'about', kind: 'choice', field: 'school_stream', label: 'Your stream', options: SCHOOL_STREAMS.map((s) => s.id),
    stages: ['school_11', 'school_12'], required: true, priority: 2, purpose: 'Which entry routes are open given the subjects being studied',
    feeds: [{ module: 'academic_eligibility', use: 'prospective route subjects' }, { module: 'stage_guidance', use: 'stream mismatch note' }] }),
  q({ id: 'branch', assessment: 'profile', page: 'about', kind: 'choice', field: 'branch', label: 'Branch / field of study', options: BRANCHES.map((b) => b.id),
    stages: DEGREE, required: true, priority: 3, purpose: 'Field of study',
    feeds: [{ module: 'career_fit', use: 'branch_fit' }, { module: 'market', use: 'research context' }] }),
  q({ id: 'year_of_study', assessment: 'profile', page: 'about', kind: 'choice', field: 'year_of_study', label: 'Year of study', options: [1, 2, 3, 4, 5],
    stages: ['undergraduate', 'postgraduate'], required: true, priority: 4, purpose: 'Where in the degree the student is',
    feeds: [{ module: 'market', use: 'research context' }] }),
  q({ id: 'current_role', assessment: 'profile', page: 'about', kind: 'text', field: 'current_role', label: 'Your current role',
    stages: ['employed_professional', 'career_switcher'], priority: 5, purpose: 'Transferable skills from the current job',
    feeds: [{ module: 'stage_guidance', use: 'transferable skills' }, { module: 'decision_engine', use: 'map_transferable_skills' }] }),

  // ---- Module 1: Likert / slider / quiz pages
  ...INTERESTS.map((it, i) => q({ id: it.key, assessment: 'profile', page: 'interests', kind: 'likert', field: `interests.${it.key}`, label: it.label,
    stages: ALL, required: true, priority: i, purpose: 'What the person enjoys',
    feeds: it.key === 'int_people' ? [] : fit(it.key) })),
  ...APTITUDES.map((it, i) => q({ id: it.key, assessment: 'profile', page: 'aptitude', kind: 'likert', field: `aptitude.${it.key}`, label: it.label,
    stages: ALL, required: true, priority: i, purpose: 'Self-rated strength', feeds: fit(it.key) })),
  ...APTITUDE_QUIZ.map((it, i) => q({ id: `quiz_${i}`, assessment: 'profile', page: 'quiz', kind: 'quiz', field: `quiz.${i}`, label: it.q, dim: it.dim,
    stages: ALL, priority: i, purpose: 'Measured aptitude signal, blended with the self-rating',
    feeds: [{ module: 'career_fit', use: `measured ${it.dim}` }] })),
  ...PREFERENCES.map((p, i) => q({ id: p.key, assessment: 'profile', page: 'preferences', kind: 'slider', field: `preferences.${p.key}`, label: `${p.left} ↔ ${p.right}`, left: p.left, right: p.right,
    stages: NOT_10, priority: i, legacyDefault: 50, purpose: 'Work-style preference',
    feeds: [...fit(p.key), ...(p.key === 'pref_stability' ? [{ module: 'alignment', use: 'shared values (stability)' }] : [])] })),
  ...TRAITS.map((it, i) => q({ id: it.key, assessment: 'profile', page: 'traits', kind: 'likert', field: `traits.${it.key}`, label: it.label,
    stages: ALL, required: true, priority: i, purpose: 'How the person works',
    feeds: [...fit(it.key), ...(it.key === 'tr_risk' ? [{ module: 'alignment', use: 'student risk appetite' }] : [])] })),

  // ---- Module 2: feasibility wizard
  q({ id: 'income_band', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'income_band', options: INCOME_BANDS.map((o) => o.id), stages: ALL, required: true, priority: 1,
    label: 'Annual family income', purpose: 'Risk adjustment and repayment burden', feeds: [{ module: 'feasibility', use: 'risk tolerance adjustment, repayment burden' }] }),
  q({ id: 'primary_funder', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'primary_funder', options: PRIMARY_FUNDERS.map((o) => o.id), stages: ALL, priority: 2,
    label: 'Who mainly pays', purpose: 'Who must act on funding', feeds: [{ module: 'feasibility', use: 'financing plan payer' }, { module: 'alignment', use: 'family funding actions' }] }),
  q({ id: 'education_budget', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'education_budget', options: BUDGET_BANDS.map((o) => o.id), stages: ALL, required: true, priority: 3,
    label: 'Education budget', purpose: 'What can be paid upfront', feeds: [{ module: 'feasibility', use: 'financial factor, financing plan' }] }),
  q({ id: 'loan_willingness', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'loan_willingness', options: LOAN_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 4,
    label: 'Education loan', purpose: 'Whether a loan can close a gap', feeds: [{ module: 'feasibility', use: 'financing plan loan' }] }),
  q({ id: 'scholarship_interest', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'scholarship_interest', options: SCHOLARSHIP_OPTIONS.map((o) => o.id), stages: ALL, priority: 5,
    label: 'Scholarships', purpose: 'Whether scholarships are part of the plan', feeds: [{ module: 'feasibility', use: 'financing plan scholarship' }] }),
  q({ id: 'risk_tolerance', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'risk_tolerance', options: RISK_LEVELS.map((o) => o.id), stages: ALL, required: true, priority: 6,
    label: 'Family risk tolerance', purpose: 'Comfort with financial risk', feeds: [{ module: 'feasibility', use: 'risk factor' }, { module: 'alignment', use: 'family risk' }] }),
  q({ id: 'education_preference', assessment: 'feasibility', page: 'education', kind: 'choice', field: 'education_preference', options: EDUCATION_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 1,
    label: 'How far to study', purpose: 'Education length the plan allows', feeds: [{ module: 'feasibility', use: 'education factor' }, { module: 'alignment', use: 'education dimension' }] }),
  q({ id: 'location_preference', assessment: 'feasibility', page: 'education', kind: 'choice', field: 'location_preference', options: LOCATION_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 2,
    label: 'Where to work', purpose: 'Asked today, but no module uses the answer', feeds: [] }),
  q({ id: 'relocation', assessment: 'feasibility', page: 'education', kind: 'choice', field: 'relocation', options: RELOCATION_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 3,
    label: 'Willing to relocate', purpose: 'Mobility for where the work is', feeds: [{ module: 'feasibility', use: 'location factor' }, { module: 'alignment', use: 'location dimension' }] }),
  q({ id: 'family_priorities', assessment: 'feasibility', page: 'priorities', kind: 'multi', field: 'family_priorities', options: FAMILY_PRIORITIES.map((o) => o.id), stages: ALL, priority: 1,
    label: 'What your family values', purpose: 'What the family hopes a career offers', feeds: [{ module: 'feasibility', use: 'family factor' }, { module: 'alignment', use: 'aspiration, priorities' }] }),
];

// Audit finding: asked today but consumed by no module. Removed from the assessment in AA3/AA5;
// listed here so the catalog stays honest until then (a test pins this list).
export const AUDIT_NO_CONSUMER = Object.freeze(['current_activity', 'int_people', 'location_preference']);

export const CATALOG = Object.freeze(QUESTIONS);
export const QUESTION_BY_ID = Object.freeze(Object.fromEntries(QUESTIONS.map((x) => [x.id, x])));
