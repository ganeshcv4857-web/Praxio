-- Adaptive assessment (assessment-v2): stage-specific questions with explicit "not sure".
--
--   profiles.assessment_version     which questionnaire produced the stored answers
--                                   (NULL = legacy 'assessment-v1', the universal form)
--   profiles.assessment_meta        per-question status/version: { version, answers: { id: { status, v, value? } } }
--                                   status 'unknown' = the person said they don't know; such answers are
--                                   never written into interests/aptitude/preferences/traits
--   profiles.class12_results_status Class 12 students: whether results are out (out | awaiting | unsure)
--   assessment_sessions.assessment_version  questionnaire version of the attempt
--
-- Additive only: no backfill. Existing answers keep their original (v1) meaning; old slider
-- values are not reinterpreted. Existing owner-only RLS on both tables covers the new columns.

alter table public.profiles
  add column if not exists assessment_version text check (char_length(assessment_version) <= 40),
  add column if not exists assessment_meta jsonb not null default '{}'::jsonb check (jsonb_typeof(assessment_meta) = 'object'),
  add column if not exists class12_results_status text check (class12_results_status in ('out', 'awaiting', 'unsure'));

alter table public.assessment_sessions
  add column if not exists assessment_version text check (char_length(assessment_version) <= 40);

comment on column public.profiles.assessment_meta is 'Per-question answer status/version (answered | unknown). Unknown answers are not module data.';
comment on column public.profiles.class12_results_status is 'Class 12 students only: out | awaiting | unsure. Drives when adding marks is suggested.';
