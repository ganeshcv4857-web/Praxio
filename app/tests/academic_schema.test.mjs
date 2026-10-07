// Academic Evidence Phase A: migration security properties + client data-layer guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const SQL = readFileSync(new URL('../supabase/migrations/20261009000000_academic_evidence.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, ''); // ignore comments
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
