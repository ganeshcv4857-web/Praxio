-- Praxio foundation: persistent assessment progress + a separate store for generated
-- (AI or template) content, so generated text never overwrites authoritative data.
--
--   AUTHORITATIVE (Praxio's own record)          GENERATED (contextual, replaceable)
--   profiles, assessment_sessions,                generated_outputs
--   recommendations (scores), feasibility_*,        - career explanations
--   development_plans, course/module progress,      - project customisations
--   project_challenges (template), submissions,     - evaluation narrative
--   project_evaluations (scores/decisions),         - (future) Groq: market insights,
--   demonstrated_skills, reward_transactions          course suggestions, reasoning …
--
-- Requires the three earlier migrations. Safe on empty and on populated databases:
-- existing generated text is copied into generated_outputs before columns are dropped.

-- ---------------------------------------------------------------------------
-- 1. assessment_sessions: Module 1 progress, including unfinished attempts.
--    Answers are committed to `profiles` only when the assessment is completed,
--    so an abandoned retake never leaves profile and recommendations out of sync.
-- ---------------------------------------------------------------------------
create table public.assessment_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  current_step    smallint not null default 0 check (current_step between 0 and 20),
  -- Draft answers, keyed exactly like the profile columns they will be committed to:
  -- { full_name, branch, year_of_study, interests, aptitude, preferences, traits }
  draft           jsonb not null default '{}'::jsonb,
  -- Raw quick-check responses (option index per item, null = skipped).
  quiz_answers    jsonb not null default '[]'::jsonb,
  catalog_version text,                        -- Module 1 catalog the result was scored with
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
-- At most one unfinished attempt per student.
create unique index assessment_sessions_one_open_idx
  on public.assessment_sessions (user_id) where status = 'in_progress';
create index assessment_sessions_user_idx on public.assessment_sessions (user_id, started_at desc);

alter table public.assessment_sessions enable row level security;
create policy "own assessment sessions" on public.assessment_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger assessment_sessions_touch_updated_at
  before update on public.assessment_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. generated_outputs: every piece of AI-generated or template-generated content.
--    Append-only for students (no UPDATE policy): a newer output supersedes an older
--    one by created_at; history is kept. Designed for the future Groq layer:
--    provenance (generator/model), evidence (sources), freshness (expires_at),
--    confidence, and the version of the Praxio data it was produced from.
-- ---------------------------------------------------------------------------
create table public.generated_outputs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  kind             text not null check (kind in (
                     'career_explanation',      -- Module 1 "why this fits you"
                     'project_customisation',   -- Module 3 tailored project wording
                     'evaluation_feedback',     -- Module 3 strengths / improvements / notes
                     'market_insight',          -- reserved: future Groq market intelligence
                     'course_suggestion',       -- reserved: future Groq course discovery
                     'reasoning'                -- reserved: future Groq explanations
                   )),
  -- What the output is about. subject_id for Praxio rows (uuid), subject_key for
  -- catalog entities (e.g. a career id like 'ai-ml').
  subject_type     text not null check (subject_type in (
                     'recommendation', 'project_challenge', 'project_evaluation', 'career', 'course', 'user'
                   )),
  subject_id       uuid,
  subject_key      text,
  content          jsonb not null,
  generator        text not null check (generator in ('gemini', 'groq', 'deterministic')),
  model            text,
  sources          jsonb not null default '[]'::jsonb,   -- [{ url, title, retrieved_at }]
  confidence       numeric(3, 2) check (confidence between 0 and 1),
  context_version  text,                                  -- e.g. catalog/config version used
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,                           -- freshness for time-sensitive data
  check (subject_id is not null or subject_key is not null)
);
create index generated_outputs_subject_idx
  on public.generated_outputs (user_id, subject_type, subject_id, kind, created_at desc);
create index generated_outputs_key_idx
  on public.generated_outputs (user_id, subject_type, subject_key, kind, created_at desc);

alter table public.generated_outputs enable row level security;
create policy "read own generated outputs" on public.generated_outputs
  for select using (user_id = auth.uid());
-- Until server-side generation (Groq layer) writes these with the service role,
-- the client records outputs it received from the edge function.
create policy "insert own generated outputs" on public.generated_outputs
  for insert with check (user_id = auth.uid());
create policy "delete own generated outputs" on public.generated_outputs
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Backfill: move generated text out of authoritative tables.
-- ---------------------------------------------------------------------------
insert into public.generated_outputs (user_id, kind, subject_type, subject_id, content, generator, model, created_at)
select r.user_id, 'career_explanation', 'recommendation', r.id, r.explanation,
       case when r.explanation_model is null then 'deterministic' else 'gemini' end,
       r.explanation_model, r.created_at
from public.recommendations r
where r.explanation is not null;

insert into public.generated_outputs (user_id, kind, subject_type, subject_id, content, generator, model, created_at)
select e.user_id, 'evaluation_feedback', 'project_evaluation', e.id,
       jsonb_build_object('feedback', e.feedback, 'strengths', e.strengths, 'improvements', e.improvements),
       case when e.evaluator = 'gemini' then 'gemini' else 'deterministic' end,
       e.model, e.evaluated_at
from public.project_evaluations e;

-- AI-customised challenges stored the AI wording in title/description. The original
-- template wording is in the code catalog; copy the AI wording out so it is labelled.
insert into public.generated_outputs (user_id, kind, subject_type, subject_id, content, generator, created_at)
select c.user_id, 'project_customisation', 'project_challenge', c.id,
       jsonb_build_object('title', c.title, 'scenario', c.description, 'backfilled', true),
       'gemini', c.created_at
from public.project_challenges c
where c.source = 'ai';

alter table public.recommendations drop column explanation, drop column explanation_model;
alter table public.project_evaluations drop column feedback, drop column strengths, drop column improvements;
alter table public.project_challenges drop column source;

-- ---------------------------------------------------------------------------
-- 4. Documentation in the database itself.
-- ---------------------------------------------------------------------------
comment on table public.assessment_sessions is 'Module 1 attempts (draft answers, raw quiz responses, step). Authoritative answers live in profiles once completed.';
comment on table public.generated_outputs is 'AI/template-generated content with provenance. Never authoritative; never overwrites Praxio data.';
comment on table public.recommendations is 'Module 1 deterministic Career Fit shortlist (authoritative). Explanations live in generated_outputs.';
comment on table public.project_challenges is 'Module 3 assigned projects with template wording (authoritative). AI tailoring lives in generated_outputs.';
comment on table public.project_evaluations is 'Module 3 evaluation decisions: validated criterion scores, app-computed total, pass, points. Narrative lives in generated_outputs.';
