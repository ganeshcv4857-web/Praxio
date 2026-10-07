// Assessment question catalog: every question Praxio asks, who sees it, and which module
// consumes the answer. Pure data + pure predicates; the planner (planner.js) decides what to
// show, deterministically. No AI decides which question is asked.
//
// Question:
//   id        stable id; a change of MEANING requires a new id (old answers keep theirs)
//   v         version; bump for wording-only changes (incl. a new "not sure" option)
//   assessment 'profile' (Module 1 onboarding) | 'feasibility' (Module 2 wizard)
//   page      page id (pages keep the existing page-based UX)
//   kind      'choice' | 'multi' | 'text' | 'likert' | 'slider' | 'quiz'
//   field     where the answer is stored ('interests.int_software', 'school_stream', 'quiz.0', …)
//   store     'meta' when the answer lives only in assessment_meta (gate questions)
//   label     wording; schoolLabel (and left/right, schoolLeft/schoolRight for sliders) is used for
//             school stages and must measure the same thing
//   stages    stage ids that see it (null = every stage)
//   goals     primary goals that see it (null = any goal)
//   when      optional pure predicate (answers, ctx) → boolean, for prerequisites/branching
//   requires  question ids `when` reads (prerequisites are always ordered before dependents)
//   required  must be answered (a real value or an explicit unknown) before the page is done
//   unknown   how "not sure" is stored: null (not offered) | 'absent' (left out of module input)
//   feeds     [{ module, use }] — the downstream consumers (must be real)
//   purpose   why the question exists
//   priority  ordering within a page (lower first)

import { INTERESTS, APTITUDES, TRAITS, PREFERENCES, BRANCHES } from '../features.js';
import { APTITUDE_QUIZ } from '../quiz.js';
import { SCHOOL_STREAMS, STAGES } from '../userContext.js';
import {
  BUDGET_BANDS, EDUCATION_OPTIONS, FAMILY_PRIORITIES, INCOME_BANDS, LOAN_OPTIONS,
  PRIMARY_FUNDERS, RELOCATION_OPTIONS, RISK_LEVELS, SCHOLARSHIP_OPTIONS,
} from '../feasibility/config.js';

export const ASSESSMENT_VERSION = 'assessment-v2';
// Profiles stored before versioning existed answered the universal questionnaire.
export const LEGACY_ASSESSMENT_VERSION = 'assessment-v1';

// Downstream consumers a question may feed.
export const MODULES = ['user_context', 'career_fit', 'academic_eligibility', 'decision_engine', 'stage_guidance', 'market', 'alignment', 'feasibility', 'presentation'];

export const PAGES = {
  profile: ['stage', 'about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
  feasibility: ['finances', 'education', 'priorities'],
};

const ALL = null;
const SCHOOL = ['school_10', 'school_11', 'school_12'];
const NOT_10 = ['school_11', 'school_12', 'undergraduate', 'postgraduate', 'graduate_unemployed', 'employed_professional', 'career_switcher'];
const DEGREE = ['undergraduate', 'postgraduate', 'graduate_unemployed', 'employed_professional', 'career_switcher'];
const WORKING = ['employed_professional', 'career_switcher'];
export const WORKING_STAGES = WORKING;
// Stages asked whether they have tried programming before rating it (they may never have).
export const PROGRAMMING_GATE_STAGES = [...SCHOOL, 'career_switcher'];

// Questions retired from the assessment (no downstream consumer). Stored values are kept.
export const RETIRED = Object.freeze({
  int_people: 'No career weights it (assessment-v2)',
  current_activity: 'No module branches on it; stage implies a default (assessment-v2)',
});
// Module 2 questions retired from the wizard (no consumer). Stored values are kept.
export const RETIRED_FEASIBILITY = Object.freeze({
  location_preference: 'No module uses it; relocation carries the location signal (assessment-v2)',
});
// Audit findings still present; a test pins this list (empty: every question has a consumer).
export const AUDIT_NO_CONSUMER = Object.freeze([]);

const fit = (field) => [{ module: 'career_fit', use: `feature ${field.split('.').pop()}` }];
const q = (o) => Object.freeze({ v: 1, goals: null, when: null, requires: [], required: false, unknown: null, priority: 50, ...o });

// School-stage wording: same feature, plainer words.
const SCHOOL_INTERESTS = {
  int_software: 'Making apps, games or websites',
  int_data_ai: 'Finding patterns in data, and how AI works',
  int_electronics: 'Circuits and electronics (e.g. building with Arduino)',
  int_mechanical: 'Machines, engines and how physical things are built',
  int_infrastructure: 'Buildings, bridges, roads and cities',
  int_design: 'Designing how things look and how people use them',
  int_business: 'How businesses work and grow',
  int_research: 'Exploring open questions, like a scientist',
  int_security: 'Cyber-security: how systems are hacked and protected',
  int_sustainability: 'Energy, climate and protecting the environment',
  int_finance: 'Money, markets and economics',
};
const SCHOOL_APTITUDES = { apt_quant: 'Maths', apt_verbal: 'Reading, writing and explaining things', apt_spatial: 'Picturing shapes and space' };
const SCHOOL_PREFS = {
  pref_research: ['Building practical things', 'Understanding deep theory'],
  pref_hands_on: ['Working at a screen', 'Hands-on: labs, workshops, outdoors'],
  pref_coding: ['Little coding', 'Coding most of the time'],
  pref_study: ['Start working after my degree', 'Study further (master’s / PhD)'],
};

const gatedProgramming = (a, ctx) => !PROGRAMMING_GATE_STAGES.includes(ctx.stage) || a.tried_programming === 'yes';
// Further-study preference: asked of students; of working people only if further study is their goal.
const studyRelevant = (_a, ctx) => !WORKING.includes(ctx.stage) || ctx.goal === 'higher_studies';

const QUESTIONS = [
  // ---- Module 1: stage page
  q({ id: 'current_stage', assessment: 'profile', page: 'stage', kind: 'choice', field: 'current_stage', label: 'Where are you currently in your journey?', options: STAGES.map((s) => s.id),
    stages: ALL, required: true, priority: 1, purpose: 'Selects the stage-specific assessment and interpretation',
    feeds: [{ module: 'user_context', use: 'stage' }, { module: 'decision_engine', use: 'stage actions' }, { module: 'academic_eligibility', use: 'prospective vs achieved mode' }] }),
  q({ id: 'primary_goal', assessment: 'profile', page: 'stage', kind: 'choice', field: 'primary_goal', label: 'What do you most want help with?', options: 'stage_goals',
    stages: ALL, required: true, priority: 3, purpose: 'Orders the next actions within the stage',
    feeds: [{ module: 'decision_engine', use: 'goal-promoted action order' }, { module: 'stage_guidance', use: 'goal wording' }] }),

  // ---- Module 1: about page
  q({ id: 'full_name', v: 2, assessment: 'profile', page: 'about', kind: 'text', field: 'full_name', label: 'Your name (optional)',
    stages: ALL, priority: 1, purpose: 'Greeting only',
    feeds: [{ module: 'presentation', use: 'greeting' }] }),
  q({ id: 'school_stream_leaning', assessment: 'profile', page: 'about', kind: 'choice', field: 'school_stream', label: 'Which stream are you leaning towards for Class 11?', options: SCHOOL_STREAMS.map((s) => s.id),
    stages: ['school_10'], required: true, priority: 2, purpose: 'Which entry routes a stream choice would keep open',
    feeds: [{ module: 'academic_eligibility', use: 'prospective route subjects' }, { module: 'decision_engine', use: 'explore_stream / take_subject' }] }),
  q({ id: 'school_stream', assessment: 'profile', page: 'about', kind: 'choice', field: 'school_stream', label: 'Your stream', options: SCHOOL_STREAMS.map((s) => s.id),
    stages: ['school_11', 'school_12'], required: true, priority: 2, purpose: 'Which entry routes are open given the subjects being studied',
    feeds: [{ module: 'academic_eligibility', use: 'prospective route subjects' }, { module: 'stage_guidance', use: 'stream mismatch note' }] }),
  q({ id: 'class12_results_status', assessment: 'profile', page: 'about', kind: 'choice', field: 'class12_results_status', label: 'Have your Class 12 results come out?', options: ['out', 'awaiting', 'unsure'],
    stages: ['school_12'], required: true, priority: 3, purpose: 'Whether marks can be added now',
    feeds: [{ module: 'decision_engine', use: 'add_academic_record priority' }] }),
  q({ id: 'branch', assessment: 'profile', page: 'about', kind: 'choice', field: 'branch', label: 'Branch / field of study', options: BRANCHES.map((b) => b.id),
    stages: DEGREE, required: true, priority: 3, purpose: 'Field of study',
    feeds: [{ module: 'career_fit', use: 'branch_fit' }, { module: 'market', use: 'research context' }] }),
  q({ id: 'year_of_study', assessment: 'profile', page: 'about', kind: 'choice', field: 'year_of_study', label: 'Year of study', options: [1, 2, 3, 4, 5],
    stages: ['undergraduate', 'postgraduate'], required: true, priority: 4, purpose: 'Where in the degree the student is',
    feeds: [{ module: 'market', use: 'research context' }] }),
  q({ id: 'current_role', assessment: 'profile', page: 'about', kind: 'text', field: 'current_role', label: 'Your current role',
    stages: WORKING, priority: 5, purpose: 'Transferable skills from the current job',
    feeds: [{ module: 'stage_guidance', use: 'transferable skills' }, { module: 'decision_engine', use: 'map_transferable_skills' }] }),

  // ---- Module 1: Likert / slider / quiz pages ("not sure" → left out of the feature map)
  ...INTERESTS.filter((it) => !RETIRED[it.key]).map((it, i) => q({ id: it.key, v: 2, assessment: 'profile', page: 'interests', kind: 'likert', field: `interests.${it.key}`,
    label: it.label, schoolLabel: SCHOOL_INTERESTS[it.key] ?? it.label,
    stages: ALL, required: true, unknown: 'absent', priority: i, purpose: 'What the person enjoys', feeds: fit(it.key) })),
  q({ id: 'tried_programming', assessment: 'profile', page: 'aptitude', kind: 'choice', field: 'tried_programming', store: 'meta', options: ['yes', 'no', 'unsure'],
    label: 'Have you tried programming — at school, through a course, or on your own?',
    stages: PROGRAMMING_GATE_STAGES, required: true, priority: 3.5, purpose: 'Ask about programming only if the person has tried it, so no rating is invented',
    feeds: [{ module: 'career_fit', use: 'decides whether apt_programming and pref_coding are collected' }] }),
  ...APTITUDES.map((it, i) => q({ id: it.key, v: 2, assessment: 'profile', page: 'aptitude', kind: 'likert', field: `aptitude.${it.key}`,
    label: it.label, schoolLabel: SCHOOL_APTITUDES[it.key] ?? it.label,
    stages: ALL, required: true, unknown: 'absent', priority: i, purpose: 'Self-rated strength', feeds: fit(it.key),
    ...(it.key === 'apt_programming' ? { when: gatedProgramming, requires: ['tried_programming'] } : {}) })),
  ...APTITUDE_QUIZ.map((it, i) => q({ id: `quiz_${i}`, assessment: 'profile', page: 'quiz', kind: 'quiz', field: `quiz.${i}`, label: it.q, dim: it.dim,
    stages: ALL, priority: i, purpose: 'Measured aptitude signal, blended with the self-rating',
    feeds: [{ module: 'career_fit', use: `measured ${it.dim}` }] })),
  ...PREFERENCES.map((p, i) => q({ id: p.key, v: 2, assessment: 'profile', page: 'preferences', kind: 'slider', field: `preferences.${p.key}`,
    label: `${p.left} ↔ ${p.right}`, left: p.left, right: p.right, schoolLeft: SCHOOL_PREFS[p.key]?.[0] ?? p.left, schoolRight: SCHOOL_PREFS[p.key]?.[1] ?? p.right,
    stages: NOT_10, unknown: 'absent', priority: i, purpose: 'Work-style preference',
    feeds: [...fit(p.key), ...(p.key === 'pref_stability' ? [{ module: 'alignment', use: 'shared values (stability)' }] : [])],
    ...(p.key === 'pref_coding' ? { when: gatedProgramming, requires: ['tried_programming'] } : {}),
    ...(p.key === 'pref_study' ? { when: studyRelevant } : {}) })),
  ...TRAITS.map((it, i) => q({ id: it.key, v: 2, assessment: 'profile', page: 'traits', kind: 'likert', field: `traits.${it.key}`, label: it.label,
    stages: ALL, required: true, unknown: 'absent', priority: i, purpose: 'How the person works',
    feeds: [...fit(it.key), ...(it.key === 'tr_risk' ? [{ module: 'alignment', use: 'student risk appetite' }] : [])] })),

  // ---- Module 2: feasibility wizard
  q({ id: 'income_band', v: 2, assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'income_band', options: INCOME_BANDS.map((o) => o.id), stages: ALL, required: true, priority: 1,
    label: 'Annual family income', workingLabel: 'Annual household income', purpose: 'Risk adjustment and repayment burden', feeds: [{ module: 'feasibility', use: 'risk tolerance adjustment, repayment burden' }] }),
  q({ id: 'primary_funder', v: 2, assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'primary_funder', options: PRIMARY_FUNDERS.map((o) => o.id), stages: ALL, required: true, priority: 2,
    label: 'Who mainly pays', purpose: 'Who must act on funding', feeds: [{ module: 'feasibility', use: 'financing plan payer' }, { module: 'alignment', use: 'family funding actions' }] }),
  q({ id: 'education_budget', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'education_budget', options: BUDGET_BANDS.map((o) => o.id), stages: ALL, required: true, priority: 3,
    label: 'Education budget', purpose: 'What can be paid upfront', feeds: [{ module: 'feasibility', use: 'financial factor, financing plan' }] }),
  q({ id: 'loan_willingness', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'loan_willingness', options: LOAN_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 4,
    label: 'Education loan', purpose: 'Whether a loan can close a gap', feeds: [{ module: 'feasibility', use: 'financing plan loan' }] }),
  q({ id: 'scholarship_interest', assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'scholarship_interest', options: SCHOLARSHIP_OPTIONS.map((o) => o.id), stages: ALL, priority: 5,
    label: 'Scholarships', purpose: 'Whether scholarships are part of the plan', feeds: [{ module: 'feasibility', use: 'financing plan scholarship' }] }),
  q({ id: 'risk_tolerance', v: 2, assessment: 'feasibility', page: 'finances', kind: 'choice', field: 'risk_tolerance', options: RISK_LEVELS.map((o) => o.id), stages: ALL, required: true, priority: 6,
    label: 'Family risk tolerance', workingLabel: 'Household comfort with financial risk', purpose: 'Comfort with financial risk', feeds: [{ module: 'feasibility', use: 'risk factor' }, { module: 'alignment', use: 'family risk' }] }),
  // Level 0 ('ug') means "no postgraduate study". Its wording assumed an undergraduate; for
  // postgraduates and working people the same level is worded for where they are (same meaning).
  q({ id: 'education_preference', v: 2, assessment: 'feasibility', page: 'education', kind: 'choice', field: 'education_preference', options: EDUCATION_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 1,
    label: 'How far to study', optionLabels: Object.freeze({
      postgraduate: { ug: 'No further study after my current degree' },
      employed_professional: { ug: 'No further formal study' },
      career_switcher: { ug: 'No further formal study (short courses only)' },
    }), purpose: 'Education length the plan allows', feeds: [{ module: 'feasibility', use: 'education factor' }, { module: 'alignment', use: 'education dimension' }] }),
  q({ id: 'relocation', assessment: 'feasibility', page: 'education', kind: 'choice', field: 'relocation', options: RELOCATION_OPTIONS.map((o) => o.id), stages: ALL, required: true, priority: 3,
    label: 'Willing to relocate', purpose: 'Mobility for where the work is', feeds: [{ module: 'feasibility', use: 'location factor' }, { module: 'alignment', use: 'location dimension' }] }),
  // Family priorities only when the family is involved in paying.
  q({ id: 'family_priorities', v: 2, assessment: 'feasibility', page: 'priorities', kind: 'multi', field: 'family_priorities', options: FAMILY_PRIORITIES.map((o) => o.id), stages: ALL, priority: 1,
    when: (a) => a.primary_funder !== 'self', requires: ['primary_funder'],
    label: 'What your family values', purpose: 'What the family hopes a career offers', feeds: [{ module: 'feasibility', use: 'family factor' }, { module: 'alignment', use: 'aspiration, priorities' }] }),
];

export const CATALOG = Object.freeze(QUESTIONS);
export const QUESTION_BY_ID = Object.freeze(Object.fromEntries(QUESTIONS.map((x) => [x.id, x])));

/** The assessment version a stored profile was answered with (unversioned → legacy v1). */
export const assessmentVersionOf = (profile) => profile?.assessment_version || LEGACY_ASSESSMENT_VERSION;
