-- Module 3: Career Development (learning path, modules, projects, evaluations, skills, rewards).
--
-- The course catalog, pathways and project templates are versioned in code
-- (src/lib/development/catalog.js), like the career catalog, so course_id / module_id /
-- career_id here are catalog ids rather than foreign keys. Every row is owned by one
-- student (profiles.id = auth.uid()) and protected by RLS.

-- Which career + pathway the student is following (one row per student).
create table public.development_plans (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  career_id     text not null,
  pathway_type  text not null check (pathway_type in ('self_paced', 'structured', 'higher_study', 'research')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Courses the student has started.
create table public.student_course_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  course_id     text not null,
  career_id     text not null,
  status        text not null default 'active' check (status in ('active', 'completed')),
  recommended   boolean not null default false,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (user_id, course_id)
);

-- Module completion = "learned". Never implies "demonstrated".
create table public.course_module_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  course_id     text not null,
  module_id     text not null,
  status        text not null default 'completed' check (status in ('completed')),
  completed_at  timestamptz not null default now(),
  unique (user_id, course_id, module_id)
);

-- One practical project per completed module.
create table public.project_challenges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  career_id     text not null,
  course_id     text not null,
  module_id     text not null,
  title         text not null,
  description   text not null,
  requirements  jsonb not null,            -- string[]
  skills        text[] not null,
  difficulty    text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  source        text not null default 'template' check (source in ('template', 'ai')),
  status        text not null default 'open' check (status in ('open', 'submitted', 'passed', 'needs_improvement')),
  created_at    timestamptz not null default now(),
  unique (user_id, course_id, module_id)
);

create table public.project_submissions (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.project_challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  github_url    text not null check (github_url ~ '^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+/?$'),
  demo_url      text,
  explanation   text,
  status        text not null default 'submitted' check (status in ('submitted', 'evaluated')),
  submitted_at  timestamptz not null default now()
);

-- Per-criterion scores + app-computed total.
create table public.project_evaluations (
  id                     uuid primary key default gen_random_uuid(),
  submission_id          uuid not null unique references public.project_submissions (id) on delete cascade,
  challenge_id           uuid not null references public.project_challenges (id) on delete cascade,
  user_id                uuid not null references public.profiles (id) on delete cascade,
  concept_application    smallint not null check (concept_application between 0 and 100),
  correctness            smallint not null check (correctness between 0 and 100),
  understanding          smallint not null check (understanding between 0 and 100),
  practical_application  smallint not null check (practical_application between 0 and 100),
  total_score            smallint not null check (total_score between 0 and 100),
  passed                 boolean not null,
  points_awarded         integer not null default 0 check (points_awarded >= 0),
  feedback               text,
  strengths              jsonb not null default '[]'::jsonb,
  improvements           jsonb not null default '[]'::jsonb,
  demonstrated_skills    text[] not null default '{}',
  evaluator              text not null check (evaluator in ('gemini', 'automated-check')),
  model                  text,
  evaluated_at           timestamptz not null default now()
);

-- Demonstrated = proven by a passing project. One row per skill, best score kept.
create table public.demonstrated_skills (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  skill               text not null,
  source_challenge_id uuid references public.project_challenges (id) on delete set null,
  score               smallint not null check (score between 0 and 100),
  demonstrated_at     timestamptz not null default now(),
  unique (user_id, skill)
);

-- Points ledger (for later achievements/levels).
create table public.reward_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  source_type  text not null check (source_type in ('project')),
  source_id    uuid not null,              -- project_challenges.id
  points       integer not null check (points > 0),
  reason       text not null,
  created_at   timestamptz not null default now()
);

create index student_course_plans_user_idx on public.student_course_plans (user_id);
create index course_module_progress_user_idx on public.course_module_progress (user_id);
create index project_challenges_user_idx on public.project_challenges (user_id, created_at);
create index project_submissions_challenge_idx on public.project_submissions (challenge_id, submitted_at);
create index project_evaluations_user_idx on public.project_evaluations (user_id);
create index reward_transactions_user_idx on public.reward_transactions (user_id, source_id);

-- ---------------------------------------------------------------------------
-- RLS: students only ever see and write their own rows.
-- ---------------------------------------------------------------------------
alter table public.development_plans       enable row level security;
alter table public.student_course_plans    enable row level security;
alter table public.course_module_progress  enable row level security;
alter table public.project_challenges      enable row level security;
alter table public.project_submissions     enable row level security;
alter table public.project_evaluations     enable row level security;
alter table public.demonstrated_skills     enable row level security;
alter table public.reward_transactions     enable row level security;

create policy "own development plan" on public.development_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own course plans" on public.student_course_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own module progress" on public.course_module_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own challenges" on public.project_challenges
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own submissions" on public.project_submissions
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.project_challenges c where c.id = challenge_id and c.user_id = auth.uid())
  );
create policy "own evaluations" on public.project_evaluations
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.project_submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
create policy "own demonstrated skills" on public.demonstrated_skills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rewards" on public.reward_transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger development_plans_touch_updated_at
  before update on public.development_plans
  for each row execute function public.touch_updated_at();
