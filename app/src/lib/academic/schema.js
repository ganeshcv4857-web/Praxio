// Academic Evidence: shared identifiers for the academic_documents / academic_records tables
// (supabase/migrations/20261009000000_academic_evidence.sql).

export const QUALIFICATIONS = ['class_10', 'class_12'];

// Fields a client may write on academic_records. Provenance and trust fields (source,
// document_id, extraction_output_id, evidence_level, official_verification,
// validator_version, checked_at) are server-only; the database trigger enforces this.
export const CLIENT_RECORD_FIELDS = [
  'board', 'passing_year', 'exam_session', 'stream', 'subjects', 'total_obtained', 'total_max',
  'percentage_stated', 'grade_stated', 'result_stated', 'confirmed_at',
];

/** Only the client-writable fields of a record (anything else is dropped, never sent). */
export function clientRecordValues(values = {}) {
  return Object.fromEntries(CLIENT_RECORD_FIELDS.filter((k) => k in values).map((k) => [k, values[k]]));
}
