// Plain-language wording for the academic eligibility engine (lib/academic/eligibility.js),
// which returns codes, not sentences. Unknown codes fall back to readable text, never raw.
import { ENTRY_ROUTES } from '../../lib/academic/routes.js';

export const QUAL = { class_10: 'Class 10', class_12: 'Class 12' };
const human = (code) => String(code ?? '').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

// Career / route status → [tone, label]
export const STATUS = {
  eligible: ['good', 'Open'],
  open: ['good', 'Open with your stream'],
  not_eligible: ['bad', 'Closed'],
  needs_subject: ['warn', 'Needs a subject'],
  unknown: ['warn', 'Needs clarification'],
  no_catalogued_route: ['muted', 'Not catalogued yet'],
};
export const statusOf = (s) => STATUS[s] ?? ['muted', human(s)];

// Requirement status → [tone, short label]
export const REQ_STATUS = {
  satisfied: ['good', 'Met'],
  open: ['good', 'Met'],
  not_satisfied: ['bad', 'Not met'],
  needs_subject: ['bad', 'Missing'],
  unknown: ['warn', 'Unclear'],
  future: ['muted', 'Later'],
};
export const reqStatusOf = (s) => REQ_STATUS[s] ?? ['muted', human(s)];

const REASON = {
  passed: 'Passed',
  failed: 'Not passed',
  result_missing: 'Result not recorded yet',
  result_compartment: 'Compartment result: final result pending',
  result_withheld: 'Result withheld',
  result_fail: 'Not passed',
  subject_present: 'Subject is in your record',
  subjects_present: 'Subjects are in your record',
  subject_absent: 'Required subject isn’t in your subject list',
  meets_minimum: 'Your marks meet the minimum',
  below_minimum: 'Your marks are below the minimum',
  relaxation_band: 'Within the relaxed range for reserved categories; depends on your category',
  marks_missing: 'Marks missing for a required subject',
  max_marks_missing: 'Maximum marks missing for a required subject',
  grade_only: 'Only a grade is recorded; marks are needed',
  no_third_subject_marks: 'Needs marks for a third subject',
  other_combinations_possible: 'Another subject combination may count; check with the institution',
  record_has_errors: 'Your record has errors; fix them first',
  institution_specific: 'Set by each institution',
  unsupported_requirement: 'Praxio can’t check this requirement yet',
  source_not_official: 'Looks unmet, but the source isn’t official yet, so it stays unclear',
  subject_list_incomplete: 'Your subject list isn’t marked complete',
  ambiguous_subject: 'A subject name could mean more than one subject',
  unrecognised_subject: 'A subject wasn’t recognised',
  no_record: 'No record yet',
  duplicate_records: 'More than one record for this qualification',
  stream_includes_subject: 'Your stream includes it',
  stream_includes_subjects: 'Your stream includes them',
  stream_lacks_subject: 'Your stream doesn’t include it',
  stream_unknown: 'Stream not chosen yet',
  stream_subjects_not_established: 'Your stream doesn’t fix this subject; choose it in Class 11',
  not_yet_evaluable: 'Checked once you have results',
};
export const reasonText = (code) => REASON[code] ?? human(code);

const routeLabel = (id) => ENTRY_ROUTES[id]?.label ?? human(id);

/** One remedy → { text, action } where action is 'record' | 'upload' | null. */
export function remedyText(r) {
  const q = QUAL[r.qualification] ?? 'academic';
  switch (r.type) {
    case 'add_record': return { text: `Add your ${q} marks`, action: 'record' };
    case 'complete_record': return { text: `Complete your ${q} record${r.fields?.length ? ` (${r.fields.map(human).join(', ').toLowerCase()})` : ''}`, action: 'record' };
    case 'fix_record': return { text: `Fix the errors in your ${q} record`, action: 'record' };
    case 'confirm_subject_list': return { text: `Confirm your ${q} subject list is complete`, action: 'record' };
    case 'clarify_subject': return { text: `Pick the exact subject for “${r.name}” in your ${q} record`, action: 'record' };
    case 'verify_record': return { text: `Upload your ${q} marksheet so it can be checked`, action: 'upload' };
    case 'take_subject': return { text: `Take ${r.label ?? human(r.subject)} in Class 11–12`, action: null };
    case 'check_institution': return { text: r.note ? `Check with the institution: ${r.note}` : 'Check the institution’s own rules', action: null };
    case 'prepare_entrance': return { text: `Prepare for ${r.label}`, action: null };
    case 'compare_routes': return { text: `Other routes stay open: ${(r.routes ?? []).map(routeLabel).join(', ')}`, action: null };
    default: return { text: human(r.type), action: null };
  }
}
