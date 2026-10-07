-- All AI modes now run on Groq. Allow 'groq' as a project evaluator
-- (existing 'gemini' rows stay valid as history).
alter table public.project_evaluations drop constraint if exists project_evaluations_evaluator_check;
alter table public.project_evaluations
  add constraint project_evaluations_evaluator_check
  check (evaluator in ('groq', 'gemini', 'automated-check'));
