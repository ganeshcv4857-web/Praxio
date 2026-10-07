// Academic entry routes: how a person enters a degree, and the academic requirements for it.
// An entry route is NOT a career and NOT a Module 3 learning pathway. A career lists its
// routes in careerEntry.js (`routes`); eligibility (Phase D2) is evaluated per route, and a
// career is only closed when every one of its routes is.
//
// SOURCES ARE MANDATORY. Each requirement points at a SourceRef. Only a requirement whose
// source status is 'official' (a primary document from the issuing authority) may ever
// produce `not_satisfied`; 'secondary' and 'unverified' sources cap the result at `unknown`
// (the computed value is shown as indicative). No remembered rule is presented as official.
//
// Scope (deliberately small): the national minimum for each route. State, university and
// institution rules (CETs, branch-specific subjects, reserved-category relaxations that need
// the user's category) are NOT modelled and are disclosed as assumptions/notes.

import { isKnownSubject } from '../../../supabase/functions/_shared/academic/subjects.js';
import { QUALIFICATIONS } from '../../../supabase/functions/_shared/academic/validate.js';

export const ROUTES_VERSION = 'entry-routes-v1';
export const ACADEMIC_YEAR = '2025-26';   // the admission year the sources describe

export const SOURCE_STATUSES = ['official', 'secondary', 'unverified'];
export const REQUIREMENT_TYPES = ['qualification_passed', 'subjects_all', 'subjects_any', 'min_combined_percentage', 'institution_specific'];

/** SourceRef: { authority, document, url, section, checkedOn, status, note } */
export const SOURCES = Object.freeze({
  // AICTE first-year B.E./B.Tech eligibility, as reproduced by an affiliating university.
  // Primary (AICTE Approval Process Handbook 2024-27) not yet pinned → secondary.
  aicte_be_btech_ptu: Object.freeze({
    authority: 'AICTE (as published by I.K. Gujral Punjab Technical University)',
    document: 'Eligibility Criteria for Admission, Session 2025-26',
    url: 'https://ptu.ac.in/wp-content/uploads/2025/04/90-96-Eligibility-Criteria-for-Admission-Session-2025-26.pdf',
    section: 'B.E./B.Tech first year',
    checkedOn: '2026-10-07',
    status: 'secondary',
    note: 'Replace with the clause in the AICTE Approval Process Handbook 2024-27 to make it official.',
  }),
  // AICTE leaves BCA eligibility to the affiliating university's admission policy.
  aicte_bca_circular: Object.freeze({
    authority: 'AICTE (circular as hosted by the University of Kashmir)',
    document: 'AICTE circular dated 24-09-2025 on BCA/BBA eligibility',
    url: 'https://cs.uok.edu.in/Files/79755f07-9550-4aeb-bd6f-5d802d56b46d/Custom/Circular_AICTE%2024-9-2025.pdf',
    section: 'Eligibility: BCA',
    checkedOn: '2026-10-07',
    status: 'secondary',
    note: 'States eligibility "as per the affiliating University admission policy" (integrated BCA-MCA, 2026-27).',
  }),
  // No national rule found: every university sets its own.
  university_specific: Object.freeze({
    authority: 'Individual universities',
    document: 'University admission policies',
    url: null,
    section: null,
    checkedOn: '2026-10-07',
    status: 'unverified',
    note: 'No national eligibility rule was found for this route.',
  }),
});

// AICTE third-subject list for B.E./B.Tech, as canonical subject ids. "Technical Vocational
// subject" is a category rather than a subject name, so it cannot be matched and is omitted:
// a student relying on it gets `unknown`, never `not_satisfied`.
const BTECH_THIRD_SUBJECTS = [
  'chemistry', 'computer_science', 'electronics', 'information_technology', 'biology',
  'informatics_practices', 'biotechnology', 'agriculture', 'engineering_graphics',
  'business_studies', 'entrepreneurship',
];

export const ENTRY_ROUTES = Object.freeze({
  be_btech: Object.freeze({
    id: 'be_btech',
    label: 'B.E. / B.Tech (AICTE minimum)',
    qualification: 'class_12',
    requirements: [
      { id: 'passed_12', type: 'qualification_passed', label: 'Passed Class 12', params: { qualification: 'class_12' }, source: 'aicte_be_btech_ptu' },
      { id: 'physics_maths', type: 'subjects_all', label: 'Physics and Mathematics', params: { subjects: ['physics', 'mathematics'] }, source: 'aicte_be_btech_ptu' },
      { id: 'third_subject', type: 'subjects_any', label: 'One of the listed third subjects', params: { subjects: BTECH_THIRD_SUBJECTS }, source: 'aicte_be_btech_ptu' },
      { id: 'pm_plus_third_45', type: 'min_combined_percentage', label: '45% in Physics, Mathematics and the third subject together',
        params: { all: ['physics', 'mathematics'], anyOf: BTECH_THIRD_SUBJECTS, min: 45, relaxedMin: 40 }, source: 'aicte_be_btech_ptu',
        note: '40% for reserved categories, EWS and PwD; Praxio does not collect category, so 40–45% stays unknown.' },
    ],
    assumptions: ['Class 12 from a board recognised by the Central or a State Government (not checked from a marksheet)'],
    notes: [
      'National minimum only: state entrance tests, institutes and some branches may require more.',
      'AICTE handbooks have changed whether Physics and Mathematics are compulsory, and since 2022-23 reportedly list it per branch; until the 2024-27 handbook clause is pinned, this route never blocks.',
    ],
    steps: [{ kind: 'entrance', label: 'JEE Main or a state engineering entrance test', source: 'unverified' }],
  }),
  bca: Object.freeze({
    id: 'bca',
    label: 'BCA',
    qualification: 'class_12',
    requirements: [
      { id: 'passed_12', type: 'qualification_passed', label: 'Passed Class 12', params: { qualification: 'class_12' }, source: 'aicte_bca_circular' },
      { id: 'university_rules', type: 'institution_specific', label: 'University admission policy', params: { note: 'Subjects and marks are set by each university.' }, source: 'aicte_bca_circular' },
    ],
    assumptions: [],
    notes: ['Check the specific university\'s BCA admission rules.'],
    steps: [{ kind: 'entrance', label: 'CUET or a university entrance test, where used', source: 'unverified' }],
  }),
  bsc_cs: Object.freeze({
    id: 'bsc_cs',
    label: 'B.Sc Computer Science',
    qualification: 'class_12',
    requirements: [
      { id: 'passed_12', type: 'qualification_passed', label: 'Passed Class 12', params: { qualification: 'class_12' }, source: 'university_specific' },
      { id: 'university_rules', type: 'institution_specific', label: 'University admission policy', params: { note: 'Subjects and marks are set by each university.' }, source: 'university_specific' },
    ],
    assumptions: [],
    notes: ['Check the specific university\'s B.Sc admission rules.'],
    steps: [{ kind: 'entrance', label: 'CUET or a university entrance test, where used', source: 'unverified' }],
  }),
});

export const sourceOf = (requirement) => SOURCES[requirement.source] ?? null;

// ---------------------------------------------------------------- catalog integrity

/** Problems with the catalog (empty = consistent). `careerEntry` maps career id → { routes }. */
export function catalogProblems(careerEntry = {}) {
  const out = [];
  const add = (where, msg) => out.push(`${where}: ${msg}`);
  if (!ROUTES_VERSION) add('catalog', 'missing ROUTES_VERSION');
  for (const [key, src] of Object.entries(SOURCES)) {
    if (!SOURCE_STATUSES.includes(src.status)) add(`source ${key}`, `invalid status ${src.status}`);
    if (!src.authority || !src.document) add(`source ${key}`, 'missing authority/document');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.checkedOn ?? '')) add(`source ${key}`, 'missing checkedOn date');
    if (src.status !== 'unverified' && !/^https:\/\//.test(src.url ?? '')) add(`source ${key}`, 'non-unverified source needs an https URL');
  }
  for (const [id, r] of Object.entries(ENTRY_ROUTES)) {
    if (r.id !== id) add(`route ${id}`, 'id mismatch');
    if (!QUALIFICATIONS.includes(r.qualification)) add(`route ${id}`, `unknown qualification ${r.qualification}`);
    if (!r.requirements?.length) add(`route ${id}`, 'no requirements');
    const ids = new Set();
    for (const q of r.requirements ?? []) {
      const at = `route ${id} / ${q.id}`;
      if (ids.has(q.id)) add(at, 'duplicate requirement id');
      ids.add(q.id);
      if (!REQUIREMENT_TYPES.includes(q.type)) add(at, `unsupported type ${q.type}`);
      if (!SOURCES[q.source]) add(at, `unknown source ${q.source}`);
      const subjects = [...(q.params?.subjects ?? []), ...(q.params?.all ?? []), ...(q.params?.anyOf ?? [])];
      for (const s of subjects) if (!isKnownSubject(s)) add(at, `unknown subject ${s}`);
      if (q.type === 'min_combined_percentage' && !(q.params.min > 0 && q.params.min <= 100)) add(at, 'min must be 1–100');
      if (q.params?.qualification && !QUALIFICATIONS.includes(q.params.qualification)) add(at, `unknown qualification ${q.params.qualification}`);
    }
  }
  for (const [careerId, e] of Object.entries(careerEntry)) {
    for (const r of e.routes ?? []) if (!ENTRY_ROUTES[r]) add(`career ${careerId}`, `unknown route ${r}`);
  }
  return out;
}
