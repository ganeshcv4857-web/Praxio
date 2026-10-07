// Deterministic validation of structured Class 10 / Class 12 academic records.
// Plain JS: shared by the client, the tests and (later) the academic edge function.
//
// Validation checks CONSISTENCY. It is not verification: it never changes evidence_level
// or official_verification, never corrects source values, and never fills in a missing
// value. Stated values and calculated values are reported side by side in `derived`.
//
// Record shape (academic_records row; the last two are optional record-level flags):
//   { qualification, board, passing_year, exam_session, stream, subjects: [Subject],
//     total_obtained, total_max, percentage_stated, grade_stated, result_stated,
//     subjects_complete,   // true = explicitly complete, false = explicitly partial, null = unknown
//     aggregation }        // 'all_subjects' | 'best_five' when explicitly indicated, else null
// Neither flag is ever inferred: an absent subject does not make a list partial or complete.
//   Subject: { name_raw, code, canonical, obtained, max, grade, origin, confidence }

import { canonicaliseSubject, isKnownSubject } from './subjects.js';

export const VALIDATOR_VERSION = 'academic-validator-v1';
export const QUALIFICATIONS = ['class_10', 'class_12'];
export const STREAMS = ['pcm', 'pcb', 'pcmb', 'commerce', 'humanities', 'undecided'];
export const ORIGINS = ['extracted', 'user_entered', 'user_corrected'];
export const AGGREGATIONS = ['all_subjects', 'best_five'];
export const RESULTS = ['pass', 'compartment', 'fail', 'withheld'];

// Tolerances (prototype engineering constants, not board rules).
export const TOLERANCE = Object.freeze({
  marks: 0.01,       // sums of marks vs stated totals
  percentage: 0.1,   // stated vs calculated percentage, in percentage points
});
export const YEAR_RANGE = Object.freeze({ min: 1950 });
// Class 12 is normally passed at least this many years after Class 10.
export const MIN_YEARS_10_TO_12 = 2;

// Subjects a science stream label implies. Only checked when the subject list is
// explicitly complete (otherwise an absent subject is unknown, not missing).
export const STREAM_SUBJECTS = Object.freeze({
  pcm: ['physics', 'chemistry', 'mathematics'],
  pcb: ['physics', 'chemistry', 'biology'],
  pcmb: ['physics', 'chemistry', 'mathematics', 'biology'],
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const near = (a, b, tol) => Math.abs(a - b) <= tol + 1e-9;
const round2 = (v) => Math.round(v * 100) / 100;

/** Canonical id of a subject: an explicit known `canonical`, else derived from name_raw. */
export function resolveSubject(s) {
  const fromName = canonicaliseSubject(s?.name_raw);
  if (s?.canonical != null && s.canonical !== '') {
    return { ...fromName, canonical: isKnownSubject(s.canonical) ? s.canonical : null, status: isKnownSubject(s.canonical) ? 'known' : 'unknown', given: s.canonical, fromName };
  }
  return { ...fromName, given: null, fromName };
}

/** Percentage of one subject, or null when it cannot be calculated (never guessed). */
export function subjectPercentage(s) {
  if (!isNum(s?.obtained) || !isNum(s?.max) || s.max <= 0 || s.obtained < 0 || s.obtained > s.max) return null;
  return round2((s.obtained / s.max) * 100);
}

function checkSubjects(record, issue) {
  const subjects = Array.isArray(record.subjects) ? record.subjects : null;
  if (subjects === null) {
    issue('error', 'subjects_not_list', 'subjects', 'subjects must be a list');
    return [];
  }
  if (!subjects.length) issue('warning', 'no_subjects', 'subjects', 'No subjects recorded; subject-level evidence is unknown');

  const seen = new Map();
  return subjects.map((s, i) => {
    const f = `subjects[${i}]`;
    const r = resolveSubject(s);
    if (!s || typeof s !== 'object') {
      issue('error', 'subject_not_object', f, 'Each subject must be an object');
      return { index: i, canonical: null, variant: null, status: 'unknown', percentage: null };
    }
    if (!s.name_raw && !s.canonical) issue('error', 'subject_name_missing', `${f}.name_raw`, 'Subject has no name');
    if (r.status === 'ambiguous') issue('warning', 'subject_ambiguous', `${f}.name_raw`, `"${s.name_raw}" could be ${r.candidates.join(' or ')}; not resolved automatically`);
    else if (r.status === 'unknown' && (s.name_raw || s.canonical)) issue('warning', 'subject_unknown', f, `"${s.name_raw ?? s.canonical}" is not a recognised subject; it stays unknown`);
    if (r.given && r.fromName.status === 'known' && r.fromName.canonical !== r.canonical) {
      issue('warning', 'canonical_mismatch', `${f}.canonical`, `canonical "${r.given}" differs from the name "${s.name_raw}" (${r.fromName.canonical})`);
    }
    if (s.origin != null && !ORIGINS.includes(s.origin)) issue('error', 'invalid_origin', `${f}.origin`, `origin must be one of ${ORIGINS.join(', ')}`);
    if (s.confidence != null && !(isNum(s.confidence) && s.confidence >= 0 && s.confidence <= 1)) issue('error', 'invalid_confidence', `${f}.confidence`, 'confidence must be between 0 and 1');

    for (const k of ['obtained', 'max']) {
      if (s[k] != null && !isNum(s[k])) issue('error', 'non_numeric_mark', `${f}.${k}`, `${k} is not a number (${JSON.stringify(s[k])})`);
    }
    if (isNum(s.obtained) && s.obtained < 0) issue('error', 'negative_mark', `${f}.obtained`, 'Marks cannot be negative');
    if (isNum(s.max) && s.max <= 0) issue('error', 'invalid_max', `${f}.max`, 'Maximum marks must be greater than zero');
    if (isNum(s.obtained) && isNum(s.max) && s.max > 0 && s.obtained > s.max) issue('error', 'mark_exceeds_max', `${f}.obtained`, `${s.obtained} is more than the maximum ${s.max}`);
    if (s.obtained == null && s.grade == null) issue('info', 'subject_marks_missing', f, 'No marks or grade for this subject; its result is unknown');
    else if (isNum(s.obtained) && s.max == null) issue('warning', 'subject_max_missing', `${f}.max`, 'Maximum marks missing; percentage unknown');

    if (r.canonical) {
      const key = `${r.canonical}:${r.variant ?? ''}`;
      const dupOf = seen.get(r.canonical);
      if (dupOf != null) issue('error', 'duplicate_subject', f, `Same subject as subjects[${dupOf.index}]${dupOf.key === key ? '' : ' (different variant)'}`);
      else seen.set(r.canonical, { index: i, key });
    }
    return { index: i, canonical: r.canonical, variant: r.variant, status: r.status, origin: s.origin ?? null, percentage: subjectPercentage(s) };
  });
}

function bestFiveSum(subjects) {
  const marks = subjects.map((s) => s?.obtained);
  if (marks.length < 5 || !marks.every(isNum)) return null;
  const top = subjects.filter((s) => isNum(s.obtained) && isNum(s.max)).sort((a, b) => b.obtained / b.max - a.obtained / a.max).slice(0, 5);
  if (top.length < 5) return null;
  return { obtained: round2(top.reduce((t, s) => t + s.obtained, 0)), max: round2(top.reduce((t, s) => t + s.max, 0)) };
}

/**
 * validateAcademicRecord(record, { currentYear }) →
 *   { valid, version, issues: [{ code, severity, field, detail }], derived }
 * valid = no error-level issues. Never mutates `record`.
 */
export function validateAcademicRecord(record, { currentYear = new Date().getFullYear() } = {}) {
  const issues = [];
  const issue = (severity, code, field, detail) => issues.push({ code, severity, field, detail });
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    issue('error', 'not_a_record', null, 'Record must be an object');
    return { valid: false, version: VALIDATOR_VERSION, issues, derived: null };
  }

  // ---- qualification / board / year / stream / result
  if (!record.qualification) issue('error', 'missing_qualification', 'qualification', 'Qualification is required');
  else if (!QUALIFICATIONS.includes(record.qualification)) issue('error', 'unsupported_qualification', 'qualification', `"${record.qualification}" is not supported (${QUALIFICATIONS.join(', ')})`);
  if (!record.board || !String(record.board).trim()) issue('warning', 'missing_board', 'board', 'Board is unknown');
  if (record.passing_year == null) issue('warning', 'missing_passing_year', 'passing_year', 'Passing year is unknown');
  else if (!Number.isInteger(record.passing_year) || record.passing_year < YEAR_RANGE.min) issue('error', 'invalid_passing_year', 'passing_year', `"${record.passing_year}" is not a valid year`);
  else if (record.passing_year > currentYear) issue('warning', 'future_passing_year', 'passing_year', `${record.passing_year} is after the current year ${currentYear}`);
  if (record.stream != null && !STREAMS.includes(record.stream)) issue('error', 'invalid_stream', 'stream', `"${record.stream}" is not a known stream`);
  if (record.stream != null && record.qualification === 'class_10') issue('warning', 'stream_on_class_10', 'stream', 'Streams apply from Class 11; a Class 10 record should not have one');
  if (record.result_stated != null && !RESULTS.includes(record.result_stated)) issue('error', 'invalid_result', 'result_stated', `"${record.result_stated}" is not a known result`);
  if (record.subjects_complete != null && typeof record.subjects_complete !== 'boolean') issue('error', 'invalid_subjects_complete', 'subjects_complete', 'subjects_complete must be true or false');
  if (record.aggregation != null && !AGGREGATIONS.includes(record.aggregation)) issue('error', 'invalid_aggregation', 'aggregation', `aggregation must be one of ${AGGREGATIONS.join(', ')}`);

  // ---- subjects
  const subjects = checkSubjects(record, issue);
  const list = Array.isArray(record.subjects) ? record.subjects.filter((s) => s && typeof s === 'object') : [];
  const complete = record.subjects_complete === true;
  if (list.length && !complete) {
    issue('info', 'subjects_incomplete', 'subjects_complete', record.subjects_complete === false
      ? 'The subject list is explicitly partial; an absent subject is unknown, not missing'
      : 'Whether the subject list is complete is unknown; an absent subject is unknown, not missing');
  }

  // ---- totals
  for (const k of ['total_obtained', 'total_max', 'percentage_stated']) {
    if (record[k] != null && !isNum(record[k])) issue('error', 'non_numeric_total', k, `${k} is not a number (${JSON.stringify(record[k])})`);
  }
  const tObt = isNum(record.total_obtained) ? record.total_obtained : null;
  const tMax = isNum(record.total_max) ? record.total_max : null;
  const pStated = isNum(record.percentage_stated) ? record.percentage_stated : null;
  if (tObt != null && tObt < 0) issue('error', 'negative_total', 'total_obtained', 'Total cannot be negative');
  if (tMax != null && tMax <= 0) issue('error', 'invalid_total_max', 'total_max', 'Maximum total must be greater than zero');
  if (tObt != null && tMax != null && tMax > 0 && tObt > tMax) issue('error', 'total_exceeds_max', 'total_obtained', `${tObt} is more than the maximum ${tMax}`);
  if (pStated != null && (pStated < 0 || pStated > 100)) issue('error', 'percentage_out_of_range', 'percentage_stated', 'Percentage must be between 0 and 100');

  // Sum of subject marks vs stated totals (only when every subject has numeric marks).
  const allMarked = list.length > 0 && list.every((s) => isNum(s.obtained) && isNum(s.max));
  const sum = allMarked ? { obtained: round2(list.reduce((t, s) => t + s.obtained, 0)), max: round2(list.reduce((t, s) => t + s.max, 0)) } : null;
  const best5 = record.aggregation === 'best_five' && allMarked ? bestFiveSum(list) : null;
  if (record.aggregation === 'best_five' && allMarked && !best5) issue('warning', 'best_five_not_applicable', 'aggregation', 'Best-five aggregation needs at least five marked subjects');
  const basis = best5 ? 'best_five' : 'all_subjects';
  // Totals are only compared with a complete list; otherwise absent subjects explain the gap.
  const expected = complete ? (best5 ?? sum) : null;
  if (!complete && sum && tObt != null && sum.obtained > tObt + TOLERANCE.marks) {
    issue('warning', 'subjects_exceed_total', 'total_obtained', `Listed subject marks (${sum.obtained}) already exceed the stated total ${tObt}`);
  }
  if (expected && tObt != null && !near(expected.obtained, tObt, TOLERANCE.marks)) {
    // A best-five match is only mentioned, never applied, unless the record declares it.
    const b5 = record.aggregation == null && allMarked ? bestFiveSum(list) : null;
    const hint = b5 && near(b5.obtained, tObt, TOLERANCE.marks) ? ' (it equals the best five subjects, but the record does not state a best-five rule)' : '';
    issue('warning', 'total_mismatch', 'total_obtained', `Stated total ${tObt} ≠ ${basis === 'best_five' ? 'best-five' : 'subject'} sum ${expected.obtained}${hint}`);
  } else if (expected && tObt != null && basis === 'best_five') {
    issue('info', 'best_five_total', 'total_obtained', `Total matches the best five subjects (${expected.obtained})`);
  }
  if (expected && tMax != null && !near(expected.max, tMax, TOLERANCE.marks)) {
    issue('warning', 'total_max_mismatch', 'total_max', `Stated maximum ${tMax} ≠ ${basis === 'best_five' ? 'best-five' : 'subject'} maximum ${expected.max}`);
  }

  // Percentage: from stated totals, else from subject marks only if the list is complete.
  let calculated = null;
  let calcBasis = null;
  if (tObt != null && tMax != null && tMax > 0 && tObt >= 0 && tObt <= tMax) {
    calculated = round2((tObt / tMax) * 100);
    calcBasis = 'stated_totals';
  } else if (expected && complete && expected.max > 0) {
    calculated = round2((expected.obtained / expected.max) * 100);
    calcBasis = basis === 'best_five' ? 'best_five_subjects' : 'subject_marks';
  }
  if (pStated != null && calculated != null && !near(pStated, calculated, TOLERANCE.percentage)) {
    issue('warning', 'percentage_mismatch', 'percentage_stated', `Stated ${pStated}% ≠ calculated ${calculated}% (${calcBasis.replace(/_/g, ' ')})`);
  }
  const gradeOnly = pStated == null && calculated == null && !list.some((s) => isNum(s.obtained)) && (record.grade_stated != null || list.some((s) => s.grade != null));
  if (gradeOnly) issue('info', 'grade_only', 'percentage_stated', 'Grades only: percentage is unknown (no conversion is applied)');
  else if (pStated == null && calculated == null) issue('info', 'percentage_unknown', 'percentage_stated', 'Percentage cannot be determined from this record');

  // ---- stream ↔ subjects (deterministic only for a complete list)
  if (complete && STREAM_SUBJECTS[record.stream]) {
    const present = new Set(subjects.map((s) => s.canonical).filter(Boolean));
    const missing = STREAM_SUBJECTS[record.stream].filter((x) => !present.has(x));
    if (missing.length) issue('warning', 'stream_subject_conflict', 'stream', `Stream ${record.stream.toUpperCase()} but the complete subject list has no ${missing.join(', ')}`);
  }

  return {
    valid: !issues.some((i) => i.severity === 'error'),
    version: VALIDATOR_VERSION,
    issues,
    derived: {
      subjects,
      subjectsComplete: typeof record.subjects_complete === 'boolean' ? record.subjects_complete : null, // as stated, never inferred
      aggregation: AGGREGATIONS.includes(record.aggregation) ? record.aggregation : null,
      percentage: { stated: pStated, calculated, basis: calcBasis },
      totals: { stated: { obtained: tObt, max: tMax }, subjectSum: sum, bestFive: best5 },
    },
  };
}

/**
 * Cross-record checks for one user's records (e.g. Class 10 vs Class 12).
 * Returns { valid, issues, records: { [qualification]: validateAcademicRecord(...) } }.
 */
export function validateAcademicRecords(records, opts = {}) {
  const issues = [];
  const out = {};
  const byQ = {};
  for (const r of records ?? []) {
    const q = r?.qualification;
    if (q && byQ[q]) issues.push({ code: 'duplicate_qualification', severity: 'error', field: 'qualification', detail: `More than one ${q} record` });
    else if (q) byQ[q] = r;
    if (q) out[q] = validateAcademicRecord(r, opts);
  }
  const y10 = byQ.class_10?.passing_year;
  const y12 = byQ.class_12?.passing_year;
  if (Number.isInteger(y10) && Number.isInteger(y12) && y12 - y10 < MIN_YEARS_10_TO_12) {
    issues.push({ code: 'chronology_conflict', severity: 'warning', field: 'passing_year', detail: `Class 12 (${y12}) is less than ${MIN_YEARS_10_TO_12} years after Class 10 (${y10})` });
  }
  return { valid: !issues.some((i) => i.severity === 'error') && Object.values(out).every((v) => v.valid), issues, records: out };
}
