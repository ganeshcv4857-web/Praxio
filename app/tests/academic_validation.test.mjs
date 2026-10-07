// Academic Evidence Phase B: subject canonicalisation, deterministic validation, evidence helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { canonicaliseSubject, normaliseSubjectName, SUBJECTS } = await import('../supabase/functions/_shared/academic/subjects.js');
const V = await import('../supabase/functions/_shared/academic/validate.js');
const { validateAcademicRecord, validateAcademicRecords, VALIDATOR_VERSION } = V;
const E = await import('../src/lib/academic/evidence.js');
const { QUALIFICATIONS } = await import('../src/lib/academic/schema.js');

const YEAR = { currentYear: 2026 };
const sub = (name_raw, obtained, max = 100, extra = {}) => ({ name_raw, obtained, max, origin: 'extracted', confidence: 0.9, ...extra });
const class12 = (over = {}) => ({
  qualification: 'class_12', board: 'CBSE', passing_year: 2025, stream: 'pcm', subjects_complete: true,
  subjects: [sub('Mathematics', 87), sub('Physics', 82), sub('Chemistry', 79), sub('English Core', 91), sub('Computer Science', 88)],
  total_obtained: 427, total_max: 500, percentage_stated: 85.4,
  evidence_level: 'extracted', official_verification: 'not_attempted', ...over,
});
const codes = (res) => res.issues.map((i) => i.code);
const has = (res, code) => res.issues.find((i) => i.code === code);

// ------------------------------------------------------------------ canonicalisation
test('aliases map deterministically; variants are kept', () => {
  assert.deepEqual(canonicaliseSubject('Maths'), { canonical: 'mathematics', variant: null, status: 'known', candidates: [] });
  assert.equal(canonicaliseSubject('MATHEMATICS').canonical, 'mathematics');
  assert.deepEqual([canonicaliseSubject('Mathematics Standard').canonical, canonicaliseSubject('Mathematics Standard').variant], ['mathematics', 'standard']);
  assert.equal(canonicaliseSubject('Mathematics Basic').variant, 'basic');
  assert.equal(canonicaliseSubject('041 Mathematics').canonical, 'mathematics', 'leading code ignored');
  assert.equal(canonicaliseSubject('Physics (Theory)').canonical, 'physics');
  assert.equal(canonicaliseSubject('Computer Science').canonical, 'computer_science');
  assert.equal(canonicaliseSubject('English Core').canonical, 'english');
  assert.equal(normaliseSubjectName('  Business   Studies & Accounts '), 'business studies and accounts');
});

test('distinct subjects are not merged', () => {
  assert.equal(canonicaliseSubject('Applied Mathematics').canonical, 'applied_mathematics');
  assert.equal(canonicaliseSubject('Computer Applications').canonical, 'computer_applications');
  assert.equal(canonicaliseSubject('Science').canonical, 'science', 'Class 10 science is not physics');
});

test('ambiguous names are never resolved; unknown names stay unknown', () => {
  const c = canonicaliseSubject('Computer');
  assert.deepEqual([c.canonical, c.status], [null, 'ambiguous']);
  assert.deepEqual(c.candidates, ['computer_science', 'computer_applications']);
  assert.equal(canonicaliseSubject('IP').status, 'ambiguous');
  const u = canonicaliseSubject('Advanced Underwater Basketry');
  assert.deepEqual([u.canonical, u.status], [null, 'unknown']);
  assert.equal(canonicaliseSubject('').status, 'unknown');
  assert.equal(canonicaliseSubject(null).status, 'unknown');
});

test('every alias target is a known subject', () => {
  for (const name of ['maths', 'accounts', 'social studies', 'english core', 'hindi course b']) {
    assert.ok(Object.hasOwn(SUBJECTS, canonicaliseSubject(name).canonical), name);
  }
});

// ------------------------------------------------------------------ valid record & shape
test('valid record: no errors, versioned result, derived values separate from stated ones', () => {
  const r = validateAcademicRecord(class12(), YEAR);
  assert.equal(r.valid, true, JSON.stringify(r.issues));
  assert.equal(r.version, VALIDATOR_VERSION);
  assert.deepEqual(r.issues.filter((i) => i.severity !== 'info'), []);
  assert.deepEqual(r.derived.percentage, { stated: 85.4, calculated: 85.4, basis: 'stated_totals' });
  assert.equal(r.derived.subjects[0].canonical, 'mathematics');
  for (const i of r.issues) assert.deepEqual(Object.keys(i).sort(), ['code', 'detail', 'field', 'severity']);
});

test('input is never mutated (marks, totals, percentage, evidence, provenance)', () => {
  const rec = class12({ percentage_stated: 82.4, subjects: [sub('Maths', 87, 100, { origin: 'user_corrected' }), sub('Computer', 120), sub('Physics', 'AB')] });
  const before = structuredClone(rec);
  validateAcademicRecord(rec, YEAR);
  validateAcademicRecords([rec, { qualification: 'class_10', passing_year: 2025, subjects: [] }], YEAR);
  E.getAcademicStrengths(rec); E.getAcademicGaps(rec); E.getSubjectPercentage(rec, 'mathematics'); E.hasSubject(rec, 'biology');
  assert.deepEqual(rec, before);
});

// ------------------------------------------------------------------ required fields / qualification
test('invalid or missing qualification is an error', () => {
  assert.ok(has(validateAcademicRecord(class12({ qualification: 'ug_degree' }), YEAR), 'unsupported_qualification'));
  const r = validateAcademicRecord(class12({ qualification: undefined }), YEAR);
  assert.equal(r.valid, false);
  assert.ok(has(r, 'missing_qualification'));
  assert.ok(has(validateAcademicRecord(null), 'not_a_record'));
  assert.deepEqual(QUALIFICATIONS, V.QUALIFICATIONS, 'one source of truth');
});

test('missing board / year / subjects are reported as unknown, not invented', () => {
  const r = validateAcademicRecord({ qualification: 'class_10', subjects: [] }, YEAR);
  assert.deepEqual(['missing_board', 'missing_passing_year', 'no_subjects'].map((c) => has(r, c)?.severity), ['warning', 'warning', 'warning']);
  assert.ok(has(r, 'percentage_unknown'));
  assert.equal(r.derived.percentage.calculated, null);
});

test('invalid / future passing year', () => {
  assert.ok(has(validateAcademicRecord(class12({ passing_year: 20.5 }), YEAR), 'invalid_passing_year'));
  assert.ok(has(validateAcademicRecord(class12({ passing_year: 1800 }), YEAR), 'invalid_passing_year'));
  assert.equal(has(validateAcademicRecord(class12({ passing_year: 2030 }), YEAR), 'future_passing_year').severity, 'warning');
});

// ------------------------------------------------------------------ marks
test('impossible marks are errors', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Maths', 120), sub('Physics', -3), sub('Chemistry', 50, 0)] }), YEAR);
  assert.equal(r.valid, false);
  for (const c of ['mark_exceeds_max', 'negative_mark', 'invalid_max']) assert.ok(has(r, c), c);
  assert.equal(r.derived.subjects[0].percentage, null, 'no percentage from impossible marks');
});

test('non-numeric marks are errors and are not converted', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Maths', '87'), sub('Physics', 'AB')], total_obtained: '427' }), YEAR);
  assert.equal(r.issues.filter((i) => i.code === 'non_numeric_mark').length, 2);
  assert.ok(has(r, 'non_numeric_total'));
  assert.equal(r.derived.subjects[0].percentage, null);
});

test('duplicate subjects (after aliasing) are errors', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Mathematics', 87), sub('Maths', 87), sub('Mathematics Basic', 70)] }), YEAR);
  assert.equal(r.issues.filter((i) => i.code === 'duplicate_subject').length, 2);
  assert.match(r.issues.filter((i) => i.code === 'duplicate_subject')[1].detail, /different variant/);
});

test('missing subject marks / max stay unknown', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Maths', null, null), sub('Physics', 80, null)], total_obtained: null, total_max: null, percentage_stated: null }), YEAR);
  assert.ok(has(r, 'subject_marks_missing'));
  assert.ok(has(r, 'subject_max_missing'));
  assert.equal(r.derived.percentage.calculated, null);
});

// ------------------------------------------------------------------ totals & percentage
test('correct totals produce no total issues', () => {
  const r = validateAcademicRecord(class12(), YEAR);
  assert.ok(!has(r, 'total_mismatch') && !has(r, 'total_max_mismatch'));
});

test('total mismatch is reported, never corrected', () => {
  const rec = class12({ total_obtained: 420 });
  const r = validateAcademicRecord(rec, YEAR);
  assert.match(has(r, 'total_mismatch').detail, /420 ≠ subject sum 427/);
  assert.equal(rec.total_obtained, 420);
  assert.equal(r.derived.totals.stated.obtained, 420);
  assert.equal(r.derived.totals.subjectSum.obtained, 427);
  assert.ok(has(validateAcademicRecord(class12({ total_max: 600 }), YEAR), 'total_max_mismatch'));
});

test('percentage mismatch: stated 82.4 vs calculated 79.8 is reported, neither overwritten', () => {
  const rec = class12({ total_obtained: 399, total_max: 500, percentage_stated: 82.4, subjects_complete: false });
  const r = validateAcademicRecord(rec, YEAR);
  const i = has(r, 'percentage_mismatch');
  assert.match(i.detail, /Stated 82\.4% ≠ calculated 79\.8%/);
  assert.deepEqual([r.derived.percentage.stated, r.derived.percentage.calculated], [82.4, 79.8]);
  assert.equal(rec.percentage_stated, 82.4);
  assert.ok(!has(validateAcademicRecord(class12({ percentage_stated: 85.45 }), YEAR), 'percentage_mismatch'), 'within 0.1 tolerance');
  assert.ok(has(validateAcademicRecord(class12({ percentage_stated: 120 }), YEAR), 'percentage_out_of_range'));
  assert.ok(has(validateAcademicRecord(class12({ total_obtained: 600 }), YEAR), 'total_exceeds_max'));
});

// ------------------------------------------------------------------ best five
const sixSubjects = [sub('English', 90), sub('Hindi', 60), sub('Mathematics Standard', 95), sub('Science', 88), sub('Social Science', 85), sub('Sanskrit', 92)];
const class10 = (over = {}) => ({ qualification: 'class_10', board: 'CBSE', passing_year: 2023, subjects_complete: true, subjects: sixSubjects, total_obtained: 450, total_max: 500, percentage_stated: 90, ...over });

test('best-five is applied only when the record explicitly declares it', () => {
  const declared = validateAcademicRecord(class10({ aggregation: 'best_five' }), YEAR);
  assert.ok(has(declared, 'best_five_total'));
  assert.ok(!has(declared, 'total_mismatch'));
  assert.ok(!has(declared, 'percentage_mismatch'));
  assert.deepEqual(declared.derived.totals.bestFive, { obtained: 450, max: 500 });

  const undeclared = validateAcademicRecord(class10(), YEAR);
  const m = has(undeclared, 'total_mismatch');
  assert.ok(m, 'not applied silently');
  assert.match(m.detail, /equals the best five subjects, but the record does not state a best-five rule/);
  assert.ok(has(validateAcademicRecord(class10({ aggregation: 'top_three' }), YEAR), 'invalid_aggregation'));
});

test('best-five needs at least five marked subjects', () => {
  const r = validateAcademicRecord(class10({ aggregation: 'best_five', subjects: sixSubjects.slice(0, 4), total_obtained: 333, total_max: 400 }), YEAR);
  assert.ok(has(r, 'best_five_not_applicable'));
});

// ------------------------------------------------------------------ grade-only, incomplete, unknown
test('grade-only record: percentage unknown, no conversion', () => {
  const r = validateAcademicRecord({ qualification: 'class_10', board: 'CBSE', passing_year: 2015, grade_stated: '9.4', subjects: [{ name_raw: 'Mathematics', grade: 'A1', origin: 'extracted' }] }, YEAR);
  assert.ok(has(r, 'grade_only'));
  assert.equal(r.derived.percentage.calculated, null);
  assert.equal(r.derived.percentage.stated, null);
  assert.equal(r.valid, true);
});

test('incomplete subject list: totals not compared, absent subjects unknown', () => {
  const rec = class12({ subjects_complete: undefined, subjects: [sub('Mathematics', 87)], stream: 'pcm' });
  const r = validateAcademicRecord(rec, YEAR);
  assert.ok(has(r, 'subjects_incomplete'));
  assert.ok(!has(r, 'total_mismatch'), 'missing subjects explain the gap');
  assert.ok(!has(r, 'stream_subject_conflict'), 'cannot say physics is missing');
  assert.equal(E.hasSubject(rec, 'physics'), 'unknown');
  assert.equal(E.hasSubject({ ...rec, subjects_complete: true }, 'physics'), false);
  assert.equal(E.hasSubject(rec, 'mathematics'), true);
  const over = validateAcademicRecord(class12({ subjects_complete: false, subjects: [sub('Mathematics', 87)], total_obtained: 50 }), YEAR);
  assert.ok(has(over, 'subjects_exceed_total'), 'subjects above the total are inconsistent regardless');
});

test('unknown and ambiguous subjects are warnings and stay unresolved', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Computer', 80), sub('Underwater Basketry', 70)], subjects_complete: false }), YEAR);
  assert.ok(has(r, 'subject_ambiguous'));
  assert.ok(has(r, 'subject_unknown'));
  assert.deepEqual(r.derived.subjects.map((s) => s.canonical), [null, null]);
  assert.equal(E.getSubjectPercentage({ subjects: [sub('Computer', 80)] }, 'computer_science'), null);
});

test('explicit canonical is respected but a conflict with the name is reported', () => {
  const r = validateAcademicRecord(class12({ subjects: [sub('Physics', 80, 100, { canonical: 'chemistry' })], subjects_complete: false }), YEAR);
  assert.ok(has(r, 'canonical_mismatch'));
  assert.ok(has(validateAcademicRecord(class12({ subjects: [sub('Physics', 80, 100, { canonical: 'alchemy' })], subjects_complete: false }), YEAR), 'subject_unknown'));
});

// ------------------------------------------------------------------ stream & chronology
test('stream/subject conflict only with a complete list', () => {
  const r = validateAcademicRecord(class12({ stream: 'pcb' }), YEAR);
  assert.match(has(r, 'stream_subject_conflict').detail, /no biology/);
  assert.ok(!has(validateAcademicRecord(class12({ stream: 'commerce' }), YEAR), 'stream_subject_conflict'), 'no deterministic rule for commerce');
  assert.ok(has(validateAcademicRecord(class12({ stream: 'arts' }), YEAR), 'invalid_stream'));
  assert.ok(has(validateAcademicRecord(class10({ stream: 'pcm' }), YEAR), 'stream_on_class_10'));
});

test('Class 10 / Class 12 chronology and duplicate qualifications', () => {
  const bad = validateAcademicRecords([class10({ passing_year: 2024 }), class12({ passing_year: 2025 })], YEAR);
  assert.ok(bad.issues.find((i) => i.code === 'chronology_conflict'));
  const good = validateAcademicRecords([class10({ passing_year: 2023 }), class12({ passing_year: 2025 })], YEAR);
  assert.ok(!good.issues.find((i) => i.code === 'chronology_conflict'));
  const dup = validateAcademicRecords([class12(), class12()], YEAR);
  assert.equal(dup.valid, false);
  assert.ok(dup.issues.find((i) => i.code === 'duplicate_qualification'));
});

// ------------------------------------------------------------------ provenance & evidence
test('provenance is preserved and validated, evidence level is never upgraded', () => {
  const rec = class12({ subjects: [sub('Maths', 87, 100, { origin: 'user_corrected' }), sub('Physics', 82, 100, { origin: 'user_entered' })], subjects_complete: false, evidence_level: 'self_reported' });
  const r = validateAcademicRecord(rec, YEAR);
  assert.deepEqual(r.derived.subjects.map((s) => s.origin), ['user_corrected', 'user_entered']);
  assert.equal(rec.evidence_level, 'self_reported');
  assert.ok(!('evidence_level' in r) && !('official_verification' in r) && !JSON.stringify(r).includes('verified'));
  assert.ok(has(validateAcademicRecord(class12({ subjects: [sub('Maths', 87, 100, { origin: 'ocr_guess' })], subjects_complete: false }), YEAR), 'invalid_origin'));
  assert.ok(has(validateAcademicRecord(class12({ subjects: [sub('Maths', 87, 100, { confidence: 3 })], subjects_complete: false }), YEAR), 'invalid_confidence'));
});

// ------------------------------------------------------------------ evidence helpers
test('subject percentage, strengths and gaps describe evidence only', () => {
  const rec = class12({ subjects: [sub('Mathematics', 87), sub('Physics', 41), sub('Chemistry', 79), sub('English Core', 91), sub('Biology', null, null)] });
  assert.equal(E.getSubjectPercentage(rec, 'mathematics'), 87);
  assert.equal(E.getSubjectPercentage(rec, 'biology'), null, 'unmarked → unknown');
  assert.equal(E.getSubjectPercentage(rec, 'history'), null, 'absent → unknown');
  assert.deepEqual(E.getAcademicStrengths(rec).map((x) => x.subject), ['english', 'mathematics', 'chemistry']);
  assert.deepEqual(E.getAcademicGaps(rec).map((x) => [x.subject, x.band]), [['physics', 'weak']]);
  assert.match(E.getAcademicStrengths(rec)[0].bandsVersion, /prototype/);
  const dup = { subjects: [sub('Maths', 90), sub('Mathematics', 40)] };
  assert.equal(E.getSubjectPercentage(dup, 'mathematics'), null, 'duplicated subject → unknown, not picked');
});

// ------------------------------------------------------------------ isolation from other modules
test('validation never touches Career Fit or any module output', async () => {
  const { rankCareers, shortlist } = await import('../src/lib/scoring.js');
  const { buildDecisionInputs } = await import('../src/lib/decisionInputs.js');
  const { decide } = await import('../src/lib/decision/engine.js');
  const profile = { current_stage: 'school_12', branch: 'cse', interests: { int_software: 5 }, aptitude: { apt_programming: 5 }, preferences: {}, traits: {} };
  const inputs = { income_band: '6to10', education_budget: '2to5', loan_willingness: 'no', risk_tolerance: 'moderate', education_preference: 'masters', location_preference: 'india', relocation: 'india', family_priorities: [] };
  const recs = shortlist(rankCareers(profile));
  const bundle = buildDecisionInputs({ profile, recs, inputs });
  const decision = decide(bundle);
  const snap = structuredClone({ recs, bundle, decision });
  const rec = class12();
  validateAcademicRecord(rec, YEAR); validateAcademicRecords([rec], YEAR); E.getAcademicStrengths(rec); E.getAcademicGaps(rec);
  assert.deepEqual({ recs, bundle, decision }, snap);
  assert.deepEqual(shortlist(rankCareers(profile)), recs, 'Career Fit is independent of academic records');
  assert.deepEqual(decide(buildDecisionInputs({ profile, recs, inputs })), decision, 'Decision Engine unchanged');
});

// ------------------------------------------------------------------ subjects_complete / aggregation (tri-state, never inferred)
test('subjects_complete is reported as stated: true / false / null, never inferred', () => {
  const base = { qualification: 'class_12', board: 'CBSE', passing_year: 2025, subjects: [sub('Mathematics', 87)] };
  const unknown = validateAcademicRecord({ ...base }, YEAR);
  assert.equal(unknown.derived.subjectsComplete, null);
  assert.match(has(unknown, 'subjects_incomplete').detail, /complete is unknown/);
  const partial = validateAcademicRecord({ ...base, subjects_complete: false }, YEAR);
  assert.equal(partial.derived.subjectsComplete, false);
  assert.match(has(partial, 'subjects_incomplete').detail, /explicitly partial/);
  assert.equal(validateAcademicRecord({ ...base, subjects_complete: null }, YEAR).derived.subjectsComplete, null);
  assert.equal(validateAcademicRecord(class12(), YEAR).derived.subjectsComplete, true);
  // Even a record that "looks" complete (five PCM-style subjects) is not marked complete.
  const looksFull = class12({ subjects_complete: null });
  assert.equal(validateAcademicRecord(looksFull, YEAR).derived.subjectsComplete, null);
  assert.ok(!has(validateAcademicRecord(looksFull, YEAR), 'total_mismatch'));
  assert.ok(has(validateAcademicRecord({ ...base, subjects_complete: 'yes' }, YEAR), 'invalid_subjects_complete'));
});

test('aggregation is reported as stated; all_subjects compares the full sum', () => {
  assert.equal(validateAcademicRecord(class12(), YEAR).derived.aggregation, null);
  const all = validateAcademicRecord(class12({ aggregation: 'all_subjects' }), YEAR);
  assert.equal(all.derived.aggregation, 'all_subjects');
  assert.ok(!has(all, 'total_mismatch'));
  const allWrong = validateAcademicRecord(class10({ aggregation: 'all_subjects' }), YEAR);
  assert.ok(has(allWrong, 'total_mismatch'), 'all_subjects never falls back to best five');
  assert.equal(validateAcademicRecord(class10({ aggregation: 'best_five' }), YEAR).derived.aggregation, 'best_five');
});
