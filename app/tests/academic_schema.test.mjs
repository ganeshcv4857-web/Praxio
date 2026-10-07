// Academic Evidence Phase A: migration security properties + client data-layer guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const SQL = readFileSync(new URL('../supabase/migrations/20261009000000_academic_evidence.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, ''); // ignore comments
const FLAGS_SQL = readFileSync(new URL('../supabase/migrations/20261010000000_academic_record_flags.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
const { CLIENT_RECORD_FIELDS, clientRecordValues, QUALIFICATIONS } = await import('../src/lib/academic/schema.js');
const demo = await import('../src/lib/demoDb.js');

const TRUST_FIELDS = ['source', 'document_id', 'extraction_output_id', 'evidence_level', 'official_verification', 'validator_version', 'checked_at'];
const policiesOn = (table) => [...SQL.matchAll(new RegExp(`create policy "[^"]+" on ${table.replace('.', '\\.')}\\s+for (\\w+)`, 'g'))].map((m) => m[1]);

test('bucket is private with size and type limits', () => {
  assert.match(SQL, /insert into storage\.buckets[\s\S]*'academic-documents', 'academic-documents', false, 5242880/);
  assert.match(SQL, /set public = false/);
  assert.ok(!/application\/pdf/.test(SQL), 'PDF not accepted until extraction supports it');
});

test('storage policies: owner folder only, authenticated only, no UPDATE', () => {
  const ops = policiesOn('storage.objects');
  assert.deepEqual(ops.sort(), ['delete', 'insert', 'select']);
  const blocks = SQL.split('create policy').filter((b) => b.includes('on storage.objects'));
  for (const b of blocks) {
    assert.match(b, /to authenticated/);
    assert.match(b, /bucket_id = 'academic-documents'/);
    assert.match(b, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  }
});

test('RLS enabled on both tables; documents have no UPDATE policy and insert only as uploaded', () => {
  assert.match(SQL, /alter table public\.academic_documents enable row level security/);
  assert.match(SQL, /alter table public\.academic_records\s+enable row level security/);
  assert.deepEqual(policiesOn('public.academic_documents').sort(), ['delete', 'insert', 'select']);
  assert.match(SQL, /for insert with check \(user_id = auth\.uid\(\) and status = 'uploaded'\)/);
  assert.deepEqual(policiesOn('public.academic_records'), ['all']);
});

test('trust fields are protected by a trigger that only trusts non-client roles', () => {
  assert.match(SQL, /create trigger academic_records_protect\s+before insert or update on public\.academic_records/);
  assert.match(SQL, /current_user not in \('authenticated', 'anon'\)/);
  for (const f of TRUST_FIELDS) assert.ok(SQL.includes(`new.${f}`), f);
  assert.match(SQL, /set search_path = ''/);
  assert.ok(!/security definer/i.test(SQL), 'trigger runs as the caller, not elevated');
});

test('document_checked requires a document source and a recorded check', () => {
  assert.match(SQL, /check \(evidence_level <> 'document_checked' or source = 'document'\)/);
  assert.match(SQL, /check \(evidence_level = 'self_reported' or \(validator_version is not null and checked_at is not null\)\)/);
});

test('no identity fields are stored', () => {
  for (const col of ['student_name', 'roll_no', 'roll_number', 'date_of_birth', 'dob', 'father', 'mother', 'school_name']) {
    assert.ok(!new RegExp(`\\b${col}\\b`, 'i').test(SQL), col);
  }
});

test('generated_outputs constraints keep every existing value and add the extraction kind', () => {
  for (const k of ['career_explanation', 'project_customisation', 'evaluation_feedback', 'market_insight', 'course_suggestion', 'reasoning', 'academic_extraction']) assert.ok(SQL.includes(`'${k}'`), k);
  for (const t of ['recommendation', 'project_challenge', 'project_evaluation', 'career', 'course', 'user', 'academic_document']) assert.ok(SQL.includes(`'${t}'`), t);
});

test('clients cannot forge extraction snapshots in generated_outputs', () => {
  assert.match(SQL, /drop policy if exists "insert own generated outputs" on public\.generated_outputs/);
  assert.match(SQL, /for insert with check \(user_id = auth\.uid\(\) and kind <> 'academic_extraction'\)/);
});

test('client record values never include trust/provenance fields', () => {
  for (const f of TRUST_FIELDS) assert.ok(!CLIENT_RECORD_FIELDS.includes(f), f);
  const v = clientRecordValues({ board: 'CBSE', evidence_level: 'document_checked', official_verification: 'officially_verified', source: 'document', user_id: 'x' });
  assert.deepEqual(v, { board: 'CBSE' });
});

test('demo: self-reported records stay self-reported; values stored as given', async () => {
  const subjects = [{ name_raw: 'Mathematics', canonical: 'mathematics', obtained: 87, max: 100, origin: 'user_entered' }];
  const r = await demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'class_12', { board: 'CBSE', subjects, percentage_stated: 82.4, evidence_level: 'document_checked' });
  assert.equal(r.evidence_level, 'self_reported');
  assert.equal(r.official_verification, 'not_attempted');
  assert.equal(r.percentage_stated, 82.4, 'stated value kept as stated');
  assert.deepEqual(r.subjects, subjects);
  const again = await demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'class_12', { board: 'ISC' });
  assert.equal(again.id, r.id, 'one record per qualification');
  assert.equal(again.board, 'ISC');
  const ev = await demo.getAcademicEvidence(demo.DEMO_USER_ID);
  assert.deepEqual([ev.documents.length, ev.records.length], [0, 1]);
  await assert.rejects(() => demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'ug_degree', {}));
  await demo.deleteAcademicRecord(demo.DEMO_USER_ID, 'class_12');
  assert.equal((await demo.getAcademicEvidence()).records.length, 0);
  assert.deepEqual(QUALIFICATIONS, ['class_10', 'class_12']);
});

test('record flags migration: nullable, no default, controlled aggregation values', () => {
  assert.match(FLAGS_SQL, /add column if not exists subjects_complete boolean,/);
  assert.match(FLAGS_SQL, /add column if not exists aggregation text check \(aggregation in \('all_subjects', 'best_five'\)\);/);
  assert.ok(!/default/i.test(FLAGS_SQL.split('create or replace function')[0]), 'existing rows stay NULL (unknown)');
  assert.ok(!/update public\.academic_records/i.test(FLAGS_SQL), 'no backfill / inference');
});

test('record flags migration: trigger still guards trust fields and downgrades on flag edits', () => {
  assert.match(FLAGS_SQL, /create or replace function public\.protect_academic_record\(\)/);
  assert.match(FLAGS_SQL, /current_user not in \('authenticated', 'anon'\)/);
  assert.match(FLAGS_SQL, /set search_path = ''/);
  for (const f of TRUST_FIELDS) assert.ok(FLAGS_SQL.includes(`new.${f}`), f);
  for (const f of ['subjects_complete', 'aggregation']) {
    assert.ok(FLAGS_SQL.includes(`new.${f}`) && FLAGS_SQL.includes(`old.${f}`), `${f} counted as a stated value`);
  }
});

test('flags are client-writable record values; demo stores them as given, null by default', async () => {
  assert.ok(CLIENT_RECORD_FIELDS.includes('subjects_complete') && CLIENT_RECORD_FIELDS.includes('aggregation'));
  assert.deepEqual(clientRecordValues({ subjects_complete: false, aggregation: 'best_five' }), { subjects_complete: false, aggregation: 'best_five' });
  const fresh = await demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'class_10', { board: 'CBSE' });
  assert.deepEqual([fresh.subjects_complete, fresh.aggregation], [null, null], 'unknown, not guessed');
  const set = await demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'class_10', { subjects_complete: true, aggregation: 'all_subjects' });
  assert.deepEqual([set.subjects_complete, set.aggregation], [true, 'all_subjects']);
  const kept = await demo.saveSelfReportedRecord(demo.DEMO_USER_ID, 'class_10', { board: 'ICSE' });
  assert.deepEqual([kept.subjects_complete, kept.aggregation], [true, 'all_subjects'], 'other edits keep the flags');
  await demo.deleteAcademicRecord(demo.DEMO_USER_ID, 'class_10');
});
