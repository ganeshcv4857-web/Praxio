-- Module 2: location_preference is no longer asked (assessment-v2). No feasibility factor or
-- other module used it; relocation carries the location signal. Existing values are kept;
-- new rows may leave it NULL. The allowed-values check still applies to non-NULL values.
alter table public.feasibility_assessments alter column location_preference drop not null;

comment on column public.feasibility_assessments.location_preference is 'Retired in assessment-v2 (unused by any module). Kept for existing rows; NULL for new ones.';
