-- Module 2: Career Feasibility.
-- One row per student, keyed to the existing profile (no duplicate student records).
-- Inputs are stored as plain option ids so the score is reproducible from them, together
-- with config_version (src/lib/feasibility/config.js) and the career dataset.
-- `results` caches the last calculation for reporting; the app recalculates on load.

create table public.feasibility_assessments (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  income_band           text not null check (income_band in ('lt3', '3to6', '6to10', '10to20', 'gt20')),
  education_budget      text not null check (education_budget in ('lt2', '2to5', '5to10', '10to20', 'gt20')),
  loan_willingness      text not null check (loan_willingness in ('no', 'maybe', 'yes')),
  risk_tolerance        text not null check (risk_tolerance in ('low', 'moderate', 'high')),
  education_preference  text not null check (education_preference in ('ug', 'masters', 'masters_spec', 'phd')),
  location_preference   text not null check (location_preference in ('near_home', 'india', 'metros', 'international')),
  relocation            text not null check (relocation in ('no', 'india', 'international')),
  family_priorities     text[] not null default '{}',
  results               jsonb not null default '[]'::jsonb,  -- [{ domainId, score, category, factors, consideration }]
  config_version        text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.feasibility_assessments enable row level security;

create policy "own feasibility" on public.feasibility_assessments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger feasibility_touch_updated_at
  before update on public.feasibility_assessments
  for each row execute function public.touch_updated_at();
