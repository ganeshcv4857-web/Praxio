-- Review 1 refinements: stage-aware user context + financing / action-dependency inputs.
-- All new columns are nullable or defaulted, so existing rows stay valid. Existing users
-- without a stage are treated as 'undergraduate' by the app (their previous behaviour).
-- Reused (not duplicated): profiles.branch = field of study; profiles.year_of_study = current year.

alter table public.profiles
  add column if not exists current_stage text check (current_stage in (
    'school_10', 'school_11', 'school_12', 'undergraduate', 'postgraduate',
    'graduate_unemployed', 'employed_professional', 'career_switcher')),
  add column if not exists current_activity text check (current_activity in (
    'school_student', 'college_student', 'working', 'unemployed', 'preparing_for_exam',
    'looking_for_job', 'higher_studies', 'skill_building', 'career_switching', 'other')),
  add column if not exists primary_goal text check (primary_goal in (
    'explore_careers', 'choose_stream', 'choose_degree', 'choose_career', 'build_skills', 'internship',
    'placement', 'find_job', 'higher_studies', 'career_switch', 'upskill')),
  add column if not exists school_stream text check (school_stream in ('pcm', 'pcb', 'pcmb', 'commerce', 'humanities', 'undecided')),
  add column if not exists current_role text check (char_length(current_role) <= 120);

-- Who pays, and whether scholarships are part of the plan (loan willingness already exists).
alter table public.feasibility_assessments
  add column if not exists primary_funder text not null default 'family' check (primary_funder in ('family', 'self', 'shared')),
  add column if not exists scholarship_interest text not null default 'no' check (scholarship_interest in ('no', 'maybe', 'yes'));

comment on column public.profiles.current_stage is 'Where the user is now (school_10 … career_switcher); drives stage-aware onboarding and interpretation.';
comment on column public.feasibility_assessments.primary_funder is 'Who mainly pays upfront: family | self | shared.';
