// Praxio Decision Engine: every rule constant lives here.
//
// The engine is TIER-BASED, not a weighted sum. Candidate next actions are ordered by
// tier (evidence → dependency → stage → later), then by explicit tie-breaks. There are
// no aggregate weights: Career Fit, Feasibility, Alignment and Market are read as the
// categories/statuses their own engines already produce, never blended into a new score.
//
// THRESHOLDS are PROTOTYPE ENGINEERING CONSTANTS, not scientifically validated values.
// Bump THRESHOLDS.version whenever any of them change; every decision records the
// version and the specific threshold each rule used (decision.trace).

export const DECISION_VERSION = 'decision-v1';

export const THRESHOLDS = Object.freeze({
  version: 'decision-thresholds-v1-prototype',
  // Two careers whose Career Fit differs by at most this many points are treated as tied.
  tieBand: 5,
  // Job/internship readiness gate: share of market core skills DEMONSTRATED (evaluated projects).
  jobReadyCoreReadiness: 50,
  // Fallback gate when no market research is cached: demonstrated skills from the career's track.
  jobReadyDemonstratedSkills: 2,
  // Internship gate: at least this many demonstrated skills relevant to the career.
  internshipDemonstratedSkills: 1,
  // Fit tiers reuse the cut-offs Module 3 already uses to word Career Fit (strong / good / moderate).
  fitTiers: Object.freeze({ strong: 75, good: 55 }),
});

// Tiers, in rank order. Lower index ranks first.
export const TIERS = ['evidence', 'dependency', 'stage', 'later'];

export const SCHOOL_STAGES = ['school_10', 'school_11', 'school_12'];
// Stages for which cost/feasibility evidence matters enough to ask for it first.
export const COST_RELEVANT_STAGES = ['school_12', 'undergraduate', 'postgraduate', 'graduate_unemployed', 'employed_professional', 'career_switcher'];

// Stage → action types it can recommend, in default order (first = stage's primary action).
// complete_project (prove what you already studied) precedes build_skill (learn something
// new): it is only generated when a learned skill is still unproven.
export const STAGE_ACTIONS = Object.freeze({
  school_10: ['explore_stream'],
  school_11: ['compare_degrees', 'prepare_entrance'],
  school_12: ['compare_degrees', 'prepare_entrance'],
  undergraduate: ['complete_project', 'build_skill', 'pursue_internship', 'pursue_higher_studies'],
  postgraduate: ['complete_project', 'build_skill', 'apply_jobs', 'pursue_internship'],
  graduate_unemployed: ['complete_project', 'close_market_gap', 'build_skill', 'apply_jobs'],
  employed_professional: ['map_transferable_skills', 'pursue_certification', 'complete_project', 'pursue_higher_studies'],
  career_switcher: ['map_transferable_skills', 'take_bridge_path', 'complete_project', 'build_skill'],
});

// primary_goal reorders actions WITHIN the stage's set; it never adds types the stage lacks.
export const GOAL_PROMOTES = Object.freeze({
  internship: ['pursue_internship'],
  placement: ['pursue_internship', 'apply_jobs'],
  find_job: ['apply_jobs', 'close_market_gap'],
  higher_studies: ['pursue_higher_studies'],
  career_switch: ['take_bridge_path', 'map_transferable_skills'],
  upskill: ['pursue_certification'],
  build_skills: ['build_skill', 'complete_project'],
  choose_degree: ['compare_degrees'],
  choose_stream: ['explore_stream'],
});

// Actions that need demonstrated capability first (readiness gate).
export const READINESS_GATED = ['apply_jobs', 'pursue_internship'];

export const ACTION_LABELS = Object.freeze({
  complete_assessment: 'Complete the career assessment',
  confirm_stage: 'Confirm where you are right now',
  complete_feasibility: 'Check what is realistic for you',
  explore_stream: 'Explore streams',
  explore_careers: 'Explore more career directions',
  trial_project: 'Try a small project in each direction',
  compare_degrees: 'Compare degree options',
  prepare_entrance: 'Prepare for entrance exams',
  build_skill: 'Build a skill',
  complete_project: 'Prove a skill with a project',
  close_market_gap: 'Close a skill gap employers ask for',
  pursue_internship: 'Pursue an internship',
  apply_jobs: 'Apply for jobs',
  pursue_certification: 'Pursue a certification',
  pursue_higher_studies: 'Plan higher studies',
  map_transferable_skills: 'Map your transferable skills',
  take_bridge_path: 'Take a lower-risk bridge path',
  compare_pathways: 'Compare routes into this career',
  resolve_financing: 'Resolve how the path is financed',
  resolve_family_action: 'Agree a required step with your family',
  refresh_market: 'Check current market research',
});
