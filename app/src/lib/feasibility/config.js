// Module 2 (Career Feasibility): every tunable number and every answer option lives here.
// Bump FEASIBILITY_VERSION when weights, thresholds or option mappings change; stored
// results record the version they were calculated with.

export const FEASIBILITY_VERSION = '2026-10-07.1';

// Factor weights (must sum to 1).
export const WEIGHTS = {
  financial: 0.35,
  education: 0.2,
  risk: 0.2,
  location: 0.1,
  family: 0.15,
};

// Overall result categories, checked top-down.
export const CATEGORIES = [
  { min: 75, id: 'high', label: 'Highly Feasible', emoji: '🟢', tone: 'emerald' },
  { min: 50, id: 'moderate', label: 'Moderately Feasible', emoji: '🟡', tone: 'amber' },
  { min: 0, id: 'barrier', label: 'High Financial / Practical Barrier', emoji: '🔴', tone: 'rose' },
];

// Per-factor status shown on the cards (✓ / ⚠ / ✗).
export const FACTOR_STATUS = { good: 75, warn: 50 };

// Score for a gap of 0, 1 or 2 levels between what a career needs and what the student accepts.
export const LEVEL_GAP_SCORES = [100, 55, 20];

const L = 100000; // ₹1 lakh

// ---------------------------------------------------------------------------
// Answer options. `value` is what the scorer uses.
// ---------------------------------------------------------------------------

export const INCOME_BANDS = [
  { id: 'lt3', label: 'Below ₹3L' },
  { id: '3to6', label: '₹3–6L' },
  { id: '6to10', label: '₹6–10L' },
  { id: '10to20', label: '₹10–20L' },
  { id: 'gt20', label: '₹20L+' },
];
// Families earning under ₹6L have their stated risk tolerance lowered one level.
export const LOW_INCOME_BANDS = ['lt3', '3to6'];

// Budget = total the family can spend on the whole education pathway (top of each band).
export const BUDGET_BANDS = [
  { id: 'lt2', label: 'Below ₹2L', value: 2 * L },
  { id: '2to5', label: '₹2–5L', value: 5 * L },
  { id: '5to10', label: '₹5–10L', value: 10 * L },
  { id: '10to20', label: '₹10–20L', value: 20 * L },
  { id: 'gt20', label: '₹20L+', value: 35 * L },
];

// Extra funding an education loan is assumed to add to the budget.
export const LOAN_OPTIONS = [
  { id: 'no', label: 'Not willing', value: 0 },
  { id: 'maybe', label: 'Maybe', value: 4 * L },
  { id: 'yes', label: 'Willing', value: 10 * L },
];

export const RISK_LEVELS = [
  { id: 'low', label: 'Low', level: 0 },
  { id: 'moderate', label: 'Moderate', level: 1 },
  { id: 'high', label: 'High', level: 2 },
];

// Levels of education after the undergraduate degree.
export const EDUCATION_OPTIONS = [
  { id: 'ug', label: 'Start working after undergraduate degree', level: 0 },
  { id: 'masters', label: "Open to Master's", level: 1 },
  { id: 'masters_spec', label: "Open to Master's + specialization", level: 2 },
  { id: 'phd', label: 'Open to PhD / research', level: 3 },
];

export const LOCATION_OPTIONS = [
  { id: 'near_home', label: 'Stay near home' },
  { id: 'india', label: 'Anywhere in India' },
  { id: 'metros', label: 'Major Indian cities' },
  { id: 'international', label: 'Open to international opportunities' },
];

// Mobility level: 0 = stays local, 1 = moves within India, 2 = moves abroad.
export const RELOCATION_OPTIONS = [
  { id: 'no', label: 'No', level: 0 },
  { id: 'india', label: 'Within India', level: 1 },
  { id: 'international', label: 'Internationally', level: 2 },
];

export const FAMILY_PRIORITIES = [
  { id: 'financial_stability', label: 'Financial stability' },
  { id: 'high_salary', label: 'High salary' },
  { id: 'job_security', label: 'Job security' },
  { id: 'prestige', label: 'Prestige' },
  { id: 'passion', label: 'Passion / personal interest' },
  { id: 'work_life_balance', label: 'Work-life balance' },
  { id: 'location_proximity', label: 'Location proximity' },
  { id: 'entrepreneurship', label: 'Entrepreneurship / independence' },
];
// Every recommended career came from the student's own interests (Module 1),
// so "passion" is treated as satisfied by all of them.
export const PRIORITIES_ALWAYS_MET = ['passion'];
// With no priorities selected the family factor is neutral.
export const FAMILY_NEUTRAL_SCORE = 100;
// Floor so a single unmet priority doesn't zero the factor: score = floor + (100 - floor) × matchRatio.
export const FAMILY_FLOOR = 30;

export const byId = (list, id) => list.find((o) => o.id === id);
