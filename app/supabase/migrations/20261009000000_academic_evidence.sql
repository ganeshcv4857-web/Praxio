-- Academic Evidence (Phase A): private marksheet storage + structured academic records.
--
--   SOURCE      academic_documents   uploaded Class 10 / 12 marksheets (files in a PRIVATE bucket)
--   GENERATED   generated_outputs    raw extraction snapshots (kind 'academic_extraction'; append-only)
--   CONFIRMED   academic_records     the user-confirmed record, one per qualification
--   DERIVED     (not stored)         validation issues and eligibility are computed in app code
--
-- Extraction is NOT verification. Two separate fields describe trust in a record:
--   evidence_level         self_reported | extracted | document_checked
--   official_verification  not_attempted | verification_unavailable | officially_verified | verification_failed
-- Both (and every provenance field) are writable ONLY server-side (service role). A browser
-- can only ever save a self_reported record; editing marks later downgrades it again.
--
-- Not stored by design: student name, roll number, date of birth, parents' names, school.
-- Account deletion cascades to these tables, but NOT to Storage objects: files under
-- academic-documents/{uid}/ must be removed by the app/an admin job (see docs).
-- Requires the earlier migrations (profiles, generated_outputs, touch_updated_at).

-- ---------------------------------------------------------------------------
-- 1. academic_documents: uploaded marksheets (source data). Files live in Storage at
--    academic-documents/{user_id}/{id}.{ext}. Rows are inserted by the owner as
--    'uploaded'; only the server (service role) moves them to extracted / failed.
-- ---------------------------------------------------------------------------
create table public.academic_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  qualification  text not null check (qualification in ('class_10', 'class_12')),
  storage_path   text not null check (
                   storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
                   and split_part(storage_path, '/', 1) = user_id::text),
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status         text not null default 'uploaded' check (status in ('uploaded', 'extracted', 'extraction_failed')),
  uploaded_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, sha256),          -- the same file uploaded twice is a duplicate
  unique (storage_path)
);
create index academic_documents_user_idx on public.academic_documents (user_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- 2. academic_records: one confirmed record per user and qualification.
--    Values are stored exactly as stated on the marksheet; nothing is recalculated or
--    corrected here (validation reports inconsistencies, it never overwrites).
--    subjects: [{ name_raw, code, canonical, obtained, max, grade,
--                 origin: 'extracted'|'user_entered'|'user_corrected', confidence }]
-- ---------------------------------------------------------------------------
create table public.academic_records (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  qualification          text not null check (qualification in ('class_10', 'class_12')),
  board                  text check (char_length(board) <= 80),
  passing_year           smallint check (passing_year between 1950 and 2100),
  exam_session           text check (char_length(exam_session) <= 40),
  stream                 text check (stream in ('pcm', 'pcb', 'pcmb', 'commerce', 'humanities', 'undecided')),
  subjects               jsonb not null default '[]'::jsonb
                           check (jsonb_typeof(subjects) = 'array' and jsonb_array_length(subjects) <= 20),
  total_obtained         numeric(7, 2) check (total_obtained >= 0),
  total_max              numeric(7, 2) check (total_max > 0),
  percentage_stated      numeric(5, 2) check (percentage_stated between 0 and 100),
  grade_stated           text check (char_length(grade_stated) <= 20),   -- e.g. CGPA '9.4' or 'A1'
  result_stated          text check (result_stated in ('pass', 'compartment', 'fail', 'withheld')),
  -- provenance & trust (server-only; see trigger below)
  source                 text not null default 'self_reported' check (source in ('self_reported', 'document')),
  document_id            uuid references public.academic_documents (id) on delete set null,
  extraction_output_id   uuid references public.generated_outputs (id) on delete set null,
  evidence_level         text not null default 'self_reported'
                           check (evidence_level in ('self_reported', 'extracted', 'document_checked')),
  official_verification  text not null default 'not_attempted'
                           check (official_verification in ('not_attempted', 'verification_unavailable', 'officially_verified', 'verification_failed')),
  validator_version      text,
  checked_at             timestamptz,
  confirmed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, qualification),
  check (evidence_level = 'self_reported' or (validator_version is not null and checked_at is not null)),
  check (evidence_level <> 'document_checked' or source = 'document')
);

-- ---------------------------------------------------------------------------
-- 3. Protect trust/provenance fields from client writes.
--    PostgREST runs browser requests as 'authenticated' (or 'anon'); the edge function's
--    service-role client runs as 'service_role'. Only the latter may set these fields.
--    A client may still edit the marks, but doing so downgrades the record to
--    self_reported. document_id may be cleared (FK ON DELETE SET NULL when the owner
--    deletes the document) but never set by a client.
-- ---------------------------------------------------------------------------
create function public.protect_academic_record() returns trigger
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
      new.total_max, new.percentage_stated, new.grade_stated, new.result_stated, new.qualification)
     is distinct from
     (old.board, old.passing_year, old.exam_session, old.stream, old.subjects, old.total_obtained,
      old.total_max, old.percentage_stated, old.grade_stated, old.result_stated, old.qualification) then
    new.source := 'self_reported';
    new.evidence_level := 'self_reported';
    new.official_verification := 'not_attempted';
    new.validator_version := null;
    new.checked_at := null;
  end if;
  return new;
end;
$$;

create trigger academic_records_protect
  before insert or update on public.academic_records
  for each row execute function public.protect_academic_record();
create trigger academic_records_touch_updated_at
  before update on public.academic_records
  for each row execute function public.touch_updated_at();
create trigger academic_documents_touch_updated_at
  before update on public.academic_documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row level security.
-- ---------------------------------------------------------------------------
alter table public.academic_documents enable row level security;
alter table public.academic_records   enable row level security;

-- Documents: owner reads, inserts (as 'uploaded' only) and deletes. No UPDATE policy:
-- extraction status changes are server-side only.
create policy "read own academic documents" on public.academic_documents
  for select using (user_id = auth.uid());
create policy "insert own academic documents" on public.academic_documents
  for insert with check (user_id = auth.uid() and status = 'uploaded');
create policy "delete own academic documents" on public.academic_documents
  for delete using (user_id = auth.uid());

-- Records: owner has full access to their own rows; the trigger guards trust fields.
create policy "own academic records" on public.academic_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. generated_outputs: allow raw extraction snapshots about a document.
-- ---------------------------------------------------------------------------
alter table public.generated_outputs drop constraint if exists generated_outputs_kind_check;
alter table public.generated_outputs
  add constraint generated_outputs_kind_check check (kind in (
    'career_explanation', 'project_customisation', 'evaluation_feedback',
    'market_insight', 'course_suggestion', 'reasoning',
    'academic_extraction'));
alter table public.generated_outputs drop constraint if exists generated_outputs_subject_type_check;
alter table public.generated_outputs
  add constraint generated_outputs_subject_type_check check (subject_type in (
    'recommendation', 'project_challenge', 'project_evaluation', 'career', 'course', 'user',
    'academic_document'));
-- Extraction snapshots are the evidence a record is checked against, so clients must not
-- be able to forge them: only the server (service role, bypasses RLS) inserts this kind.
drop policy if exists "insert own generated outputs" on public.generated_outputs;
create policy "insert own generated outputs" on public.generated_outputs
  for insert with check (user_id = auth.uid() and kind <> 'academic_extraction');

-- ---------------------------------------------------------------------------
-- 6. Storage: private bucket, owner-folder access. Path: {auth.uid()}/{document_id}.{ext}
--    No UPDATE policy: an uploaded file is never replaced in place.
--    Files are read through short-lived signed URLs or by the edge function.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academic-documents', 'academic-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "read own academic files" on storage.objects
  for select to authenticated
  using (bucket_id = 'academic-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own academic files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'academic-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and array_length(storage.foldername(name), 1) = 1);
create policy "delete own academic files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'academic-documents' and (storage.foldername(name))[1] = auth.uid()::text);

comment on table public.academic_documents is 'Uploaded marksheets (source). Files in the private academic-documents bucket; extraction snapshots in generated_outputs.';
comment on table public.academic_records is 'User-confirmed academic record per qualification, values as stated. Extraction is not verification: evidence_level and official_verification are server-set only.';
comment on column public.academic_records.official_verification is 'Official channel only (e.g. DigiLocker). verification_unavailable when no official check exists; never set from OCR/extraction.';
