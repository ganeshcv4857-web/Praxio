// Academic evidence helpers: describe what a structured record shows about subjects.
// They never touch Career Fit or any other module, never change the record, and return
// null / 'unknown' instead of guessing. Eligibility (Phase D) will build on these.

import { resolveSubject, subjectPercentage } from '../../../supabase/functions/_shared/academic/validate.js';

// Prototype description bands (percent of subject marks), NOT validated thresholds and NOT
// used for Career Fit. Bump the version when they change.
export const EVIDENCE_BANDS = Object.freeze({ version: 'academic-bands-v1-prototype', strong: 75, weak: 50 });

const entries = (record) => (Array.isArray(record?.subjects) ? record.subjects : [])
  .filter((s) => s && typeof s === 'object')
  .map((s) => ({ s, r: resolveSubject(s) }));

/** Percentage for a canonical subject, or null if absent, unmarked or ambiguous. */
export function getSubjectPercentage(record, subject) {
  const hits = entries(record).filter(({ r }) => r.canonical === subject);
  if (hits.length !== 1) return null; // absent, or duplicated (inconsistent) → unknown
  return subjectPercentage(hits[0].s);
}

/** true | false | 'unknown'. false only when the record says its subject list is complete. */
export function hasSubject(record, subject) {
  if (entries(record).some(({ r }) => r.canonical === subject)) return true;
  return record?.subjects_complete === true ? false : 'unknown';
}

function banded(record) {
  return entries(record)
    .map(({ s, r }) => ({ subject: r.canonical, variant: r.variant, percentage: subjectPercentage(s), origin: s.origin ?? null }))
    .filter((x) => x.subject && x.percentage != null);
}

/** Subjects at or above the "strong" band, highest first. */
export function getAcademicStrengths(record, bands = EVIDENCE_BANDS) {
  return banded(record).filter((x) => x.percentage >= bands.strong)
    .sort((a, b) => b.percentage - a.percentage || a.subject.localeCompare(b.subject))
    .map((x) => ({ ...x, band: 'strong', threshold: bands.strong, bandsVersion: bands.version }));
}

/** Subjects below the "weak" band, lowest first. Unmarked subjects are not gaps (unknown). */
export function getAcademicGaps(record, bands = EVIDENCE_BANDS) {
  return banded(record).filter((x) => x.percentage < bands.weak)
    .sort((a, b) => a.percentage - b.percentage || a.subject.localeCompare(b.subject))
    .map((x) => ({ ...x, band: 'weak', threshold: bands.weak, bandsVersion: bands.version }));
}
