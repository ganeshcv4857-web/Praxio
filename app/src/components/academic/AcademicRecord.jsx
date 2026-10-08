import { useEffect, useMemo, useState } from 'react';
import * as db from '../../lib/db.js';
import { QUALIFICATIONS } from '../../lib/academic/schema.js';
import { SUBJECTS, subjectLabel } from '../../../supabase/functions/_shared/academic/subjects.js';
import { RESULTS, STREAMS, validateAcademicRecord } from '../../../supabase/functions/_shared/academic/validate.js';
import { getAcademicGaps, getAcademicStrengths } from '../../lib/academic/evidence.js';
import { Btn, More, PageHead, Panel, Status } from '../ui/kit.jsx';

// Academic record: enter Class 10 / Class 12 marks subject by subject. Saved as a
// self-reported record (the database keeps provenance server-side); Praxio's academic
// validator checks it live, and errors block saving. Pathway eligibility and the Decision
// Engine read these records.

const QUAL_LABEL = { class_10: 'Class 10', class_12: 'Class 12' };
const STREAM_LABEL = { pcm: 'Science (PCM)', pcb: 'Science (PCB)', pcmb: 'Science (PCMB)', commerce: 'Commerce', humanities: 'Humanities / Arts', undecided: 'Not decided' };
const RESULT_LABEL = { pass: 'Passed', compartment: 'Compartment', fail: 'Not passed', withheld: 'Result withheld' };
const LEVEL = {
  self_reported: ['info', 'Self-reported'],
  extracted: ['warn', 'Read from document'],
  document_checked: ['good', 'Validated'],
};
const BOARDS = ['CBSE', 'CISCE (ICSE / ISC)', 'State board', 'NIOS', 'IB', 'Cambridge (IGCSE / A Level)'];
const STREAM_PRESETS = {
  pcm: ['physics', 'chemistry', 'mathematics', 'english'],
  pcb: ['physics', 'chemistry', 'biology', 'english'],
  pcmb: ['physics', 'chemistry', 'mathematics', 'biology', 'english'],
  commerce: ['accountancy', 'business_studies', 'economics', 'english'],
  humanities: ['history', 'economics', 'english'],
};
const SUBJECT_OPTIONS = Object.entries(SUBJECTS).sort((a, b) => a[1].localeCompare(b[1]));
const DEFAULT_SUBJECTS = {
  class_10: ['mathematics', 'science', 'social_science', 'english', 'hindi'],
  class_12: ['physics', 'chemistry', 'mathematics', 'english'],
};

const num = (v) => (v === '' || v == null ? null : Number(v));
const emptyRow = (canonical = '') => ({ canonical, obtained: '', max: '100' });

function formFromRecord(qual, rec) {
  if (!rec) {
    return {
      board: '', passing_year: '', stream: qual === 'class_12' ? '' : null, result_stated: 'pass',
      subjects: DEFAULT_SUBJECTS[qual].map((c) => emptyRow(c)), subjects_complete: false, percentage_stated: '',
    };
  }
  return {
    board: rec.board ?? '', passing_year: rec.passing_year ?? '', stream: qual === 'class_12' ? (rec.stream ?? '') : null,
    result_stated: rec.result_stated ?? 'pass', subjects_complete: Boolean(rec.subjects_complete),
    percentage_stated: rec.percentage_stated ?? '',
    subjects: (rec.subjects ?? []).map((s) => ({ canonical: s.canonical ?? '', obtained: s.obtained ?? '', max: s.max ?? '100' })),
  };
}

/** Form → record values (client-writable fields only). */
function toValues(qual, f) {
  const subjects = f.subjects
    .filter((s) => s.canonical)
    .map((s) => ({ name_raw: subjectLabel(s.canonical), canonical: s.canonical, obtained: num(s.obtained), max: num(s.max), origin: 'user_entered' }));
  return {
    board: f.board.trim() || null, // 'Other' with nothing typed saves as unknown
    passing_year: f.passing_year === '' ? null : Number(f.passing_year),
    ...(qual === 'class_12' ? { stream: f.stream || null } : {}),
    result_stated: f.result_stated || null,
    subjects,
    subjects_complete: f.subjects_complete,
    percentage_stated: num(f.percentage_stated),
    confirmed_at: new Date().toISOString(),
  };
}

export default function AcademicRecord({ userId, onSaved, onOpenPathways }) {
  const [records, setRecords] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [qual, setQual] = useState('class_12');
  const [form, setForm] = useState(() => formFromRecord('class_12', null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    try {
      const ev = await db.getAcademicEvidence(userId);
      setRecords(ev.records ?? []);
      setDocuments(ev.documents ?? []);
      return ev.records ?? [];
    } catch (e) {
      setError(`Couldn’t load your academic record: ${e.message}`);
      setRecords([]);
      return [];
    }
  };
  useEffect(() => {
    load().then((rs) => setForm(formFromRecord(qual, rs.find((r) => r.qualification === qual))));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = records?.find((r) => r.qualification === qual) ?? null;
  const switchQual = (q) => {
    setQual(q);
    setSaved('');
    setError('');
    setForm(formFromRecord(q, records?.find((r) => r.qualification === q)));
  };

  const values = useMemo(() => toValues(qual, form), [qual, form]);
  const check = useMemo(() => validateAcademicRecord({ qualification: qual, ...values }), [qual, values]);
  const errors = check.issues.filter((i) => i.severity === 'error');
  const warnings = check.issues.filter((i) => i.severity === 'warning');
  const pct = check.derived?.percentage?.calculated;

  const set = (k, v) => { setSaved(''); setForm((f) => ({ ...f, [k]: v })); };
  const setRow = (i, k, v) => { setSaved(''); setForm((f) => ({ ...f, subjects: f.subjects.map((s, j) => (j === i ? { ...s, [k]: v } : s)) })); };
  // Choosing a stream fills its usual subjects, but never overwrites marks already typed.
  const pickStream = (v) => {
    const untouched = form.subjects.every((x) => x.obtained === '');
    setSaved('');
    setForm((f) => ({ ...f, stream: v, ...(untouched && STREAM_PRESETS[v] ? { subjects: STREAM_PRESETS[v].filter((c) => SUBJECTS[c]).map((c) => emptyRow(c)) } : {}) }));
  };
  const known = BOARDS.includes(form.board);
  const boardChoice = form.board === '' ? '' : known ? form.board : 'other';
  const rowPct = (x) => {
    const o = num(x.obtained); const m = num(x.max);
    return Number.isFinite(o) && Number.isFinite(m) && m > 0 && o <= m ? Math.round((o / m) * 1000) / 10 : null;
  };
  const totals = form.subjects.reduce((t, x) => {
    const o = num(x.obtained); const m = num(x.max);
    return Number.isFinite(o) && Number.isFinite(m) && m > 0 ? { o: t.o + o, m: t.m + m, n: t.n + 1 } : t;
  }, { o: 0, m: 0, n: 0 });
  const addRow = () => set('subjects', [...form.subjects, emptyRow()]);
  const removeRow = (i) => set('subjects', form.subjects.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await db.saveSelfReportedRecord(userId, qual, values);
      await load();
      setSaved(`${QUAL_LABEL[qual]} record saved.`);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete your ${QUAL_LABEL[qual]} record? Pathway eligibility will go back to unknown.`)) return;
    setBusy(true);
    try {
      await db.deleteAcademicRecord(userId, qual);
      const rs = await load();
      setForm(formFromRecord(qual, rs.find((r) => r.qualification === qual)));
      setSaved('Record deleted.');
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-2xl bg-slate-800 px-4 py-3 text-[15px] text-slate-100 outline-none focus:ring-2 focus:ring-indigo-400';
  const label = 'mb-2 block text-sm text-slate-400';
  const level = LEVEL[current?.evidence_level] ?? null;

  return (
    <div>
      <PageHead eyebrow="Academic record" title="Your marks," accent="your evidence."
        lede="Add your board results. Praxio uses them to check which degree and career pathways are open to you." />

      <div role="tablist" aria-label="Qualification" className="mb-6 flex flex-wrap items-center gap-2">
        {QUALIFICATIONS.map((q) => {
          const r = records?.find((x) => x.qualification === q);
          return (
            <button key={q} type="button" role="tab" aria-selected={qual === q} onClick={() => switchQual(q)}
              className={`inline-flex min-h-[46px] items-center gap-2 rounded-full px-5 text-[15px] transition ${qual === q ? 'bg-slate-100 text-slate-950' : 'bg-slate-900 text-slate-200 shadow-[var(--shadow)] hover:bg-slate-800'}`}>
              <span className={`h-2 w-2 rounded-full ${r ? 'bg-emerald-400' : 'bg-slate-600'}`} />{QUAL_LABEL[q]}
            </button>
          );
        })}
        {level && <Status tone={level[0]} className="ml-auto">{level[1]}</Status>}
      </div>

      {records === null ? <p className="text-slate-400">Loading…</p> : (
        <Panel className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="ac-board">Board</label>
              <select id="ac-board" className={input} value={boardChoice} onChange={(e) => set('board', e.target.value === 'other' ? ' ' : e.target.value)}>
                <option value="">Choose your board</option>
                {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="other">Other</option>
              </select>
              {boardChoice === 'other' && (
                <input aria-label="Board name" className={`${input} mt-2`} placeholder="Board name" value={form.board.trimStart()} onChange={(e) => set('board', e.target.value || ' ')} maxLength={80} autoFocus />
              )}
            </div>
            <div>
              <label className={label} htmlFor="ac-year">Passing year</label>
              <input id="ac-year" className={input} inputMode="numeric" placeholder="2026" value={form.passing_year} onChange={(e) => set('passing_year', e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
            <div>
              <label className={label} htmlFor="ac-result">Result</label>
              <select id="ac-result" className={input} value={form.result_stated} onChange={(e) => set('result_stated', e.target.value)}>
                {RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r] ?? r}</option>)}
              </select>
            </div>
            {qual === 'class_12' && (
              <div className="sm:col-span-3">
                <label className={label} htmlFor="ac-stream">Stream</label>
                <select id="ac-stream" className={input} value={form.stream ?? ''} onChange={(e) => pickStream(e.target.value)}>
                  <option value="">Choose your stream</option>
                  {STREAMS.map((s) => <option key={s} value={s}>{STREAM_LABEL[s] ?? s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Subjects and marks</span>
              {totals.n > 0 && (
                <span className="text-sm text-slate-300">
                  Total <strong className="tabular-nums text-slate-100">{Math.round(totals.o * 100) / 100} / {totals.m}</strong>
                  {Number.isFinite(pct) ? <> · <strong className="text-slate-100">{pct}%</strong></> : null}
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {form.subjects.map((s, i) => (
                <li key={i} className="grid grid-cols-[1fr_76px_76px_52px_36px] items-center gap-2">
                  <select aria-label={`Subject ${i + 1}`} className={input} value={s.canonical} onChange={(e) => setRow(i, 'canonical', e.target.value)}>
                    <option value="">Choose subject</option>
                    {SUBJECT_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <input aria-label={`Marks in subject ${i + 1}`} className={input} inputMode="decimal" placeholder="Marks" value={s.obtained} onChange={(e) => setRow(i, 'obtained', e.target.value.replace(/[^\d.]/g, ''))} />
                  <input aria-label={`Out of, subject ${i + 1}`} className={input} inputMode="decimal" placeholder="Out of" value={s.max} onChange={(e) => setRow(i, 'max', e.target.value.replace(/[^\d.]/g, ''))} />
                  <span className="text-right text-sm tabular-nums text-slate-400">{rowPct(s) != null ? `${rowPct(s)}%` : '—'}</span>
                  <button type="button" aria-label={`Remove subject ${i + 1}`} onClick={() => removeRow(i)} className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-800 hover:text-rose-300">✕</button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Btn kind="link" onClick={addRow} disabled={form.subjects.length >= 20}>+ Add subject</Btn>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.subjects_complete} onChange={(e) => set('subjects_complete', e.target.checked)} className="h-4 w-4 accent-current" />
                This is my full subject list
              </label>
            </div>
          </div>

          <More label="Overall percentage on your marksheet (optional)">
            <input aria-label="Overall percentage on marksheet" className={`${input} max-w-[160px]`} inputMode="decimal" placeholder="e.g. 87.4" value={form.percentage_stated} onChange={(e) => set('percentage_stated', e.target.value.replace(/[^\d.]/g, ''))} />
            <p className="mt-2">If your board states one, enter it exactly. Praxio compares it with the calculated value.</p>
          </More>

          {errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-2xl bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
              {errors.map((x, i) => <li key={i}>{x.detail}</li>)}
            </ul>
          )}
          {errors.length === 0 && warnings.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
              {warnings.map((x, i) => <li key={i}>{x.detail}</li>)}
            </ul>
          )}
          {error && <p role="alert" className="rounded-2xl bg-rose-500/10 px-5 py-3 text-sm text-rose-300">{error}</p>}
          {saved && <p role="status" className="rounded-2xl bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300">{saved}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={save} disabled={busy || errors.length > 0}>{busy ? 'Saving…' : current ? 'Update record' : 'Save record'}</Btn>
            {current && <Btn kind="ghost" onClick={remove} disabled={busy}>Delete</Btn>}
            <span className="text-sm text-slate-500">Saved as self-reported. Upload your marksheet below so it can be checked.</span>
          </div>
        </Panel>
      )}

      {current && <MarksSummary record={current} onOpenPathways={onOpenPathways} />}

      {records !== null && (
        <Panel className="mt-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[20px] font-medium tracking-[-0.02em]">{QUAL_LABEL[qual]} marksheet</h2>
            <span className="text-sm text-slate-500">Photo or scan · JPG, PNG or WEBP · up to 5 MB</span>
          </div>
          <p className="text-[15px] text-slate-400">Uploading your marksheet lets Praxio check your record against it. Until it’s checked, your marks count as self-reported.</p>
          <ul className="space-y-2">
            {documents.filter((d) => d.qualification === qual).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950/40 px-4 py-3">
                <span className="text-[15px] text-slate-200">Uploaded {new Date(d.uploaded_at).toLocaleDateString()}</span>
                <span className="flex items-center gap-2">
                  <Status tone={d.status === 'extracted' ? 'good' : d.status === 'extraction_failed' ? 'bad' : 'info'}>
                    {d.status === 'extracted' ? 'Read' : d.status === 'extraction_failed' ? 'Couldn’t read' : 'Waiting to be checked'}
                  </Status>
                  <Btn kind="link" onClick={async () => { try { window.open(await db.academicDocumentUrl(d), '_blank', 'noopener'); } catch (e) { setError(e.message); } }}>View</Btn>
                  <Btn kind="link" onClick={async () => {
                    if (!window.confirm('Delete this marksheet?')) return;
                    try { await db.deleteAcademicDocument(userId, d); await load(); } catch (e) { setError(e.message); }
                  }}>Delete</Btn>
                </span>
              </li>
            ))}
          </ul>
          <label className={`pill inline-flex min-h-[46px] cursor-pointer items-center gap-2 rounded-full bg-slate-800 px-5 text-[15px] text-slate-100 hover:bg-slate-700 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading ? 'Uploading…' : 'Upload marksheet'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setUploading(true); setError(''); setSaved('');
                try { await db.uploadAcademicDocument(userId, qual, file); await load(); setSaved('Marksheet uploaded.'); } catch (err) { setError(err.message); } finally { setUploading(false); }
              }} />
          </label>
        </Panel>
      )}
    </div>
  );
}

function MarksSummary({ record, onOpenPathways }) {
  let strengths = [];
  let gaps = [];
  try { strengths = getAcademicStrengths(record); gaps = getAcademicGaps(record); } catch { /* unreadable record: show nothing */ }
  return (
    <Panel className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-medium tracking-[-0.02em]">What your marks show</h2>
        {onOpenPathways && <Btn kind="link" onClick={onOpenPathways}>See pathways this opens →</Btn>}
      </div>
      {strengths.length === 0 && gaps.length === 0 ? (
        <p className="mt-3 text-[15px] text-slate-400">Add marks out of a maximum for each subject to see your strongest and weakest subjects.</p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-[13px] text-slate-500">Strong (75% and above)</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {strengths.length ? strengths.map((x) => <Status key={x.subject} tone="good">{subjectLabel(x.subject)} · {x.percentage}%</Status>) : <span className="text-sm text-slate-500">None yet</span>}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-slate-500">Below 50%</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {gaps.length ? gaps.map((x) => <Status key={x.subject} tone="warn">{subjectLabel(x.subject)} · {x.percentage}%</Status>) : <span className="text-sm text-slate-500">None</span>}
            </div>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm text-slate-500">Bands describe your marks only; they never change your career fit.</p>
    </Panel>
  );
}
