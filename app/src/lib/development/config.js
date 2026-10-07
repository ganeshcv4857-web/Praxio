// Module 3 (Career Development): every tunable rule lives here.
// Budget signals come from Module 2's answers (education_budget + loan_willingness) —
// Module 3 asks no budget question of its own.

export const DEVELOPMENT_VERSION = '2026-10-07.1';

const L = 100000;

// Overall Path Score = Σ weight × component (each 0–100). Must sum to 1.
export const PATH_WEIGHTS = {
  careerFit: 0.25, // Module 1 score for the career
  feasibility: 0.25, // Module 2 score for the career
  budget: 0.2, // pathway cost vs. money available
  study: 0.15, // pathway's education level vs. how far the student wants to study
  requirement: 0.15, // pathway's education level vs. what the career typically expects
};

// Penalty when a pathway goes *beyond* what the career needs (e.g. PhD for cloud ops).
export const OVERQUALIFY_PENALTY = 15;

// Max price of a single course, by Module 2 education_budget band.
// Courses above the cap are only used when a stage has no affordable alternative.
export const COURSE_PRICE_CAP = {
  lt2: 5000,
  '2to5': 20000,
  '5to10': 60000,
  '10to20': 150000,
  gt20: Infinity,
};
export const BUDGET_TIER_LABEL = {
  lt2: 'free and low-cost learning',
  '2to5': 'mostly low-cost options',
  '5to10': 'paid options where they add value',
  '10to20': 'paid and specialised options',
  gt20: 'premium options where they add value',
};

// MS abroad is only considered for students open to moving abroad with this much funding.
export const MS_ABROAD_MIN_FUNDING = 30 * L;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

// Difficulty rules (simple, by design):
//   no passed projects yet                         → beginner
//   ≥ INTERMEDIATE_AFTER passed projects           → intermediate
//   ≥ ADVANCED_AFTER passed with average ≥ ADVANCED_MIN_AVG → advanced
// and never below the course's own level.
export const DIFFICULTY_RULES = { INTERMEDIATE_AFTER: 2, ADVANCED_AFTER: 3, ADVANCED_MIN_AVG: 85 };

export const COMMON_REQUIREMENTS = [
  'Public GitHub repository with a README explaining what you built, how to run it and what you learned',
];
export const DIFFICULTY_REQUIREMENTS = {
  beginner: [],
  intermediate: ['Add tests or validation checks for your core logic'],
  advanced: [
    'Add tests or validation checks for your core logic',
    'Extend the project with one feature of your own and document the trade-offs you made',
  ],
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
export const EVALUATION_WEIGHTS = {
  concept_application: 0.4,
  correctness: 0.25,
  understanding: 0.2,
  practical_application: 0.15,
};
export const EVALUATION_CRITERIA = [
  { id: 'concept_application', label: 'Concept application', hint: 'Did the project actually apply the concept?' },
  { id: 'correctness', label: 'Correctness', hint: 'Does the implementation work correctly?' },
  { id: 'understanding', label: 'Understanding', hint: 'Do you show understanding of what you built?' },
  { id: 'practical_application', label: 'Practical application', hint: 'Is the concept used meaningfully?' },
];

// A skill counts as demonstrated only when the project passes AND the concept itself was applied.
export const PASS_SCORE = 70;
export const MIN_CONCEPT_SCORE = 60;

// ---------------------------------------------------------------------------
// Rewards (for demonstrated practical work only — never for ticking off modules)
// ---------------------------------------------------------------------------
export const REWARD_TIERS = [
  { min: 95, points: 200 },
  { min: 85, points: 150 },
  { min: 70, points: 100 },
  { min: 50, points: 50 },
  { min: 0, points: 0 },
];
