// Parent–Student Alignment: every weight, threshold and inference rule lives here.
// These are INITIAL ENGINEERED VALUES for a prototype, not scientifically validated.
// Bump ALIGNMENT_VERSION whenever any of them change.

export const ALIGNMENT_VERSION = 'alignment-v1';

// Dimension weights (sum to 1). Unknown dimensions are excluded and the remaining
// weights renormalised; `coverage` reports how much weight had real data behind it.
export const WEIGHTS = {
  aspiration: 0.25, // the career the student wants vs. what the family values in a career
  financial: 0.25,  // pathway cost vs. family education budget (+ loan)
  risk: 0.2,        // pathway risk vs. family risk comfort (student appetite shown alongside)
  location: 0.1,    // where the work is vs. family preference for staying close
  education: 0.1,   // pathway length vs. family expectation about time to employment
  priorities: 0.1,  // family priorities vs. the student's own stated preferences (career-independent)
};

export const DIMENSIONS = [
  { id: 'aspiration', label: 'Career direction' },
  { id: 'financial', label: 'Education cost' },
  { id: 'risk', label: 'Financial risk' },
  { id: 'location', label: 'Location' },
  { id: 'education', label: 'Length of education' },
  { id: 'priorities', label: 'Shared values' },
];

// Overall categories (checked top-down).
export const CATEGORIES = [
  { min: 80, id: 'strong', label: 'Strong Alignment', tone: 'emerald' },
  { min: 60, id: 'moderate', label: 'Moderate Alignment', tone: 'indigo' },
  { min: 40, id: 'significant', label: 'Significant Conflict', tone: 'amber' },
  { min: 0, id: 'high', label: 'High Conflict', tone: 'rose' },
];

// Per-dimension status and severity from its 0–100 score.
export const STATUS_THRESHOLDS = { aligned: 75, partial: 50 }; // below partial → conflict
export const SEVERITY_THRESHOLDS = { none: 75, low: 55, medium: 35 }; // below medium → high

// Below this much known weight the result is marked tentative.
export const MIN_COVERAGE = 0.5;

// Gap of 0 / 1 / 2+ levels between what a path needs and what the family accepts.
export const LEVEL_GAP_SCORES = [100, 55, 20];

// Aspiration: floor so a single unmet priority doesn't zero the dimension.
export const ASPIRATION_FLOOR = 20;

// Student risk appetite from Module 1 (0–100): average of tr_risk and pref_novelty.
export const STUDENT_RISK_LEVELS = [
  { max: 40, level: 0, label: 'Prefers low risk' },
  { max: 70, level: 1, label: 'Comfortable with moderate risk' },
  { max: 101, level: 2, label: 'Comfortable with high risk' },
];

// Research pathways add one level of perceived financial risk (long, stipend-dependent).
export const RESEARCH_RISK_BUMP = 1;

// ---- Inferring family positions from the priorities already collected in Module 2 ----
// (No new questions are asked; when there is no signal the position is "unknown".)
export const FAMILY_INFERENCE = {
  prefersProximity: ['location_proximity'],
  prefersEarlyEmployment: ['financial_stability', 'job_security'],
  openToHigherStudy: ['prestige'],
};

// Family priority ↔ student's own preference (Module 1/2). Values: 100 match, 60 partial, 20 mismatch.
export const PRIORITY_MATCH = { match: 100, partial: 60, mismatch: 20 };
