-- Academic Evidence: two record-level statements the validator needs (Phase B gap).
--
--   subjects_complete  true  = the listed subjects are explicitly the complete list
--                      false = explicitly known to be a partial list
--                      null  = unknown (default; existing rows stay unknown, never guessed)
--   aggregation        how the stated total was formed, only when explicitly indicated:
--                      'all_subjects' | 'best_five' | null (unknown / not specified)
--                      No board-specific rule is implied by either value.
--
-- Both are statements about the record, so a client edit to them is treated like an edit
-- to the marks: the record is downgraded to self_reported (trigger replaced below).

alter table public.academic_records
  add column if not exists subjects_complete boolean,
  add column if not exists aggregation text check (aggregation in ('all_subjects', 'best_five'));

create or replace function public.protect_academic_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;   -- service_role / postgres: trusted server-side writer
  end if;

  if tg_op = 'INSERT' then
    if new.source <> 'self_reported' or new.document_id is not null or new.extraction_output_id is not null
       or new.evidence_level <> 'self_reported' or new.official_verification <> 'not_attempted'
       or new.validator_version is not null or new.checked_at is not null then
      raise exception 'academic_records: provenance and verification fields are set server-side only'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.source is distinct from old.source
     or (new.document_id is distinct from old.document_id and new.document_id is not null)
     or (new.extraction_output_id is distinct from old.extraction_output_id and new.extraction_output_id is not null)
     or new.evidence_level is distinct from old.evidence_level
     or new.official_verification is distinct from old.official_verification
     or new.validator_version is distinct from old.validator_version
     or new.checked_at is distinct from old.checked_at then
    raise exception 'academic_records: provenance and verification fields are set server-side only'
      using errcode = '42501';
  end if;

  -- Any change to the stated academic values makes them the user's own statement.
  if (new.board, new.passing_year, new.exam_session, new.stream, new.subjects, new.total_obtained,
      new.total_max, new.percentage_stated, new.grade_stated, new.result_stated, new.qualification,
      new.subjects_complete, new.aggregation)
     is distinct from
     (old.board, old.passing_year, old.exam_session, old.stream, old.subjects, old.total_obtained,
      old.total_max, old.percentage_stated, old.grade_stated, old.result_stated, old.qualification,
      old.subjects_complete, old.aggregation) then
    new.source := 'self_reported';
    new.evidence_level := 'self_reported';
    new.official_verification := 'not_attempted';
    new.validator_version := null;
    new.checked_at := null;
  end if;
  return new;
end;
$$;

comment on column public.academic_records.subjects_complete is 'true = subject list explicitly complete; false = explicitly partial; null = unknown. Never inferred.';
comment on column public.academic_records.aggregation is 'How the stated total was formed when explicitly indicated: all_subjects | best_five; null = unknown.';
