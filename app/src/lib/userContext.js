// User context: who the person is right now, what they're doing, what they want next.
// One shared Praxio core; the stage only changes which questions are relevant and how
// results are interpreted. No stage has its own scoring engine.
//
// Stored on `profiles` (current_stage, current_activity, primary_goal, school_stream,
// current_role). Existing fields are reused: `branch` = field of study (UG/PG/graduates),
// `year_of_study` = current year (students only).

export const STAGES = [
  { id: 'school_10', label: 'Class 10', group: 'school' },
  { id: 'school_11', label: 'Class 11', group: 'school' },
  { id: 'school_12', label: 'Class 12', group: 'school' },
  { id: 'undergraduate', label: 'Undergraduate (in college)', group: 'college' },
  { id: 'postgraduate', label: 'Postgraduate', group: 'college' },
  { id: 'graduate_unemployed', label: 'Graduated, not yet working', group: 'graduate' },
  { id: 'employed_professional', label: 'Working professional', group: 'working' },
  { id: 'career_switcher', label: 'Switching careers', group: 'working' },
];

export const ACTIVITIES = [
  { id: 'school_student', label: 'Studying in school' },
  { id: 'college_student', label: 'Studying in college' },
  { id: 'working', label: 'Working' },
  { id: 'unemployed', label: 'Not currently working' },
  { id: 'preparing_for_exam', label: 'Preparing for an exam' },
  { id: 'looking_for_job', label: 'Looking for a job' },
  { id: 'higher_studies', label: 'Pursuing higher studies' },
  { id: 'skill_building', label: 'Building skills' },
  { id: 'career_switching', label: 'Moving into a new career' },
  { id: 'other', label: 'Other' },
];

export const GOALS = [
  { id: 'explore_careers', label: 'Explore careers' },
  { id: 'choose_stream', label: 'Choose my stream / subjects' },
  { id: 'choose_degree', label: 'Choose a degree / course' },
  { id: 'choose_career', label: 'Choose a career direction' },
  { id: 'build_skills', label: 'Build skills' },
  { id: 'internship', label: 'Get an internship' },
  { id: 'placement', label: 'Get placed after college' },
  { id: 'find_job', label: 'Find a job' },
  { id: 'higher_studies', label: 'Go for higher studies' },
  { id: 'career_switch', label: 'Switch to a new career' },
  { id: 'upskill', label: 'Upskill in my current field' },
];

export const SCHOOL_STREAMS = [
  { id: 'pcm', label: 'Science (PCM)' },
  { id: 'pcb', label: 'Science (PCB)' },
  { id: 'pcmb', label: 'Science (PCMB)' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'humanities', label: 'Humanities / Arts' },
  { id: 'undecided', label: 'Not decided yet' },
];

/**
 * Per-stage behaviour. `steps` lists the onboarding step ids shown (the assessment
 * questions themselves are shared). `goals` are the relevant goal options, first = default.
 */
export const STAGE_PROFILES = {
  school_10: {
    activity: 'school_student', goals: ['explore_careers', 'choose_stream'],
    headline: 'Explore your direction', focus: 'interests, aptitude and which stream to choose next',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'traits'], // career-preference sliders are premature at 15
    asks: { year: false, branch: false, stream: false, role: false },
  },
  school_11: {
    activity: 'school_student', goals: ['choose_career', 'choose_degree', 'explore_careers'],
    headline: 'Plan your next education step', focus: 'career direction, degree options and entrance exams',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: false, branch: false, stream: true, role: false },
  },
  school_12: {
    activity: 'school_student', goals: ['choose_degree', 'choose_career', 'explore_careers'],
    headline: 'Plan your next education step', focus: 'degree options, entrance exams, affordability and location',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: false, branch: false, stream: true, role: false },
  },
  undergraduate: {
    activity: 'college_student', goals: ['choose_career', 'build_skills', 'internship', 'placement', 'higher_studies'],
    headline: 'Build toward your career', focus: 'specialisation, skills, projects, internships and placements',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: true, branch: true, stream: false, role: false },
  },
  postgraduate: {
    activity: 'higher_studies', goals: ['find_job', 'build_skills', 'choose_career', 'higher_studies'],
    headline: 'Build toward your career', focus: 'specialisation depth, research or industry roles',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: true, branch: true, stream: false, role: false },
  },
  graduate_unemployed: {
    activity: 'looking_for_job', goals: ['find_job', 'build_skills', 'higher_studies', 'choose_career'],
    headline: 'Close your skill gap and become job-ready', focus: 'target roles, demonstrated skills and skill gaps',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: false, branch: true, stream: false, role: false },
  },
  employed_professional: {
    activity: 'working', goals: ['upskill', 'career_switch', 'higher_studies'],
    headline: 'Plan your career growth', focus: 'transferable skills, upskilling and next roles',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: false, branch: true, stream: false, role: true },
  },
  career_switcher: {
    activity: 'career_switching', goals: ['career_switch', 'build_skills', 'upskill'],
    headline: 'Plan your career transition', focus: 'transferable skills, transition cost and risk, learning pathway',
    steps: ['about', 'interests', 'aptitude', 'quiz', 'preferences', 'traits'],
    asks: { year: false, branch: true, stream: false, role: true },
  },
};

// Existing users (created before stages existed) were undergraduates.
export const LEGACY_DEFAULT_STAGE = 'undergraduate';

const by = (list, id) => list.find((x) => x.id === id) ?? null;

/** Normalised context for any profile (legacy rows default to undergraduate). */
export function userContext(profile) {
  const stage = STAGE_PROFILES[profile?.current_stage] ? profile.current_stage : LEGACY_DEFAULT_STAGE;
  const p = STAGE_PROFILES[stage];
  return {
    stage,
    stageLabel: by(STAGES, stage).label,
    group: by(STAGES, stage).group,
    activity: by(ACTIVITIES, profile?.current_activity) ? profile.current_activity : p.activity,
    goal: by(GOALS, profile?.primary_goal) ? profile.primary_goal : p.goals[0],
    stream: profile?.school_stream ?? null,
    role: profile?.current_role ?? null,
    isLegacy: !profile?.current_stage,
    headline: p.headline,
    focus: p.focus,
    steps: p.steps,
    asks: p.asks,
    goalOptions: p.goals.map((g) => by(GOALS, g)),
  };
}

export const isSchool = (ctx) => ctx.group === 'school';
export const isWorking = (ctx) => ctx.group === 'working';
export const labelOf = { stage: (id) => by(STAGES, id)?.label, activity: (id) => by(ACTIVITIES, id)?.label, goal: (id) => by(GOALS, id)?.label, stream: (id) => by(SCHOOL_STREAMS, id)?.label };
