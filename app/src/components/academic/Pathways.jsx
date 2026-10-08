import { useEffect, useMemo, useState } from 'react';
import * as db from '../../lib/db.js';
import { CAREER_BY_ID } from '../../lib/careers.js';
import { evaluateCareerEligibility } from '../../lib/academic/eligibility.js';
import { ACADEMIC_YEAR } from '../../lib/academic/routes.js';
import { Btn, More, PageHead, Panel, Row, Rows, Status, Summary } from '../ui/kit.jsx';
import { QUAL, reasonText, remedyText, reqStatusOf, statusOf } from './wording.js';

// "Pathways open to you": the academic eligibility engine, career by career and route by
// route. Deterministic (no AI); eligibility never touches Career Fit. Detail (requirements,
// sources, assumptions) opens on demand.

function RouteBlock({ route, onAction }) {
  const [tone, label] = statusOf(route.status);
  const todo = route.remedies.map(remedyText);
  return (
    <div className="rounded-2xl bg-slate-950/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[16px] font-medium">{route.label}</div>
        <Status tone={tone}>{label}</Status>
      </div>
      <ul className="mt-3 divide-y divide-slate-800">
        {route.requirements.map((q) => {
          const [t, l] = reqStatusOf(q.status);
          return (
            <li key={q.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] text-slate-200">{q.label}</div>
                <div className="text-sm text-slate-500">{reasonText(q.reason)}</div>
              </div>
              <Status tone={t}>{l}</Status>
            </li>
          );
        })}
      </ul>
      {route.steps?.length > 0 && (
        <p className="mt-3 text-sm text-slate-400">Then: {route.steps.map((s) => s.label).join(' → ')}</p>
      )}
      {todo.length > 0 && (
        <div className="mt-4">
          <div className="text-[13px] text-slate-500">What to do</div>
          <ul className="mt-2 space-y-1.5">
            {todo.map((r) => (
              <li key={r.text} className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-slate-200">
                <span>→ {r.text}</span>
                {r.action && <button type="button" onClick={() => onAction(r.action)} className="min-h-[36px] text-sm font-medium text-indigo-300 hover:text-slate-100">{r.action === 'upload' ? 'Upload' : 'Open record'} →</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <More label="Sources and assumptions">
        <ul className="space-y-2">
          {route.source.map((s) => (
            <li key={s.key}>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">{s.document ?? s.key}</a> : (s.document ?? s.key)}
              <span className="text-slate-500"> · {s.authority}{s.checkedOn ? ` · checked ${s.checkedOn}` : ''} · </span>
              <span className={s.status === 'official' ? 'text-emerald-300' : 'text-amber-300'}>{s.status === 'official' ? 'official source' : `${s.status} source`}</span>
            </li>
          ))}
        </ul>
        {route.assumptions?.length > 0 && <ul className="mt-3 space-y-1">{route.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>}
      </More>
    </div>
  );
}

export default function Pathways({ userId, profile, recs, onOpenRecord }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    db.getAcademicEvidence(userId).then((ev) => setRecords(ev.records ?? [])).catch((e) => { setError(e.message); setRecords([]); });
  }, [userId]);

  const results = useMemo(() => {
    if (!records) return [];
    return recs.filter((r) => CAREER_BY_ID[r.domainId]).map((r) => {
      try {
        return { rec: r, result: evaluateCareerEligibility({ careerId: r.domainId, academicRecords: records, profile }) };
      } catch {
        return { rec: r, result: { status: 'unknown', routes: [], mode: 'achieved' } };
      }
    });
  }, [records, recs, profile]);

  if (!recs.length) return <p className="text-slate-400">Complete your assessment first to see pathways for your careers.</p>;
  const prospective = results[0]?.result.mode === 'prospective';
  const count = (ss) => results.filter((x) => ss.includes(x.result.status)).length;
  const open = count(['eligible', 'open']);
  const unclear = count(['unknown', 'needs_subject']);
  const closed = count(['not_eligible']);
  const hasRecord = (records ?? []).length > 0;

  return (
    <div>
      <PageHead eyebrow="Pathways" title="Pathways" accent="open to you."
        lede={prospective
          ? 'Based on the stream you plan to take. Once your results are in, Praxio checks your actual marks.'
          : `Checked against your recorded marks and each degree’s entry requirements (${ACADEMIC_YEAR}).`}>
        <Btn kind={hasRecord ? 'ghost' : 'primary'} onClick={onOpenRecord}>{hasRecord ? 'Edit marks' : 'Add your marks →'}</Btn>
      </PageHead>

      {error && <p role="alert" className="mb-6 rounded-2xl bg-rose-500/10 px-5 py-3 text-sm text-rose-300">{error}</p>}
      {records === null ? <p className="text-slate-400">Checking your pathways…</p> : (
        <>
          <Summary>
            {open > 0 && <Status tone="good">{open} open</Status>}
            {unclear > 0 && <Status tone="warn">{unclear} need clarification</Status>}
            {closed > 0 && <Status tone="bad">{closed} closed</Status>}
          </Summary>
          {!hasRecord && !prospective && (
            <Panel className="mb-6">
              <p className="text-[17px]">Most pathways are unclear because Praxio doesn’t have your marks yet.</p>
              <Btn className="mt-4" onClick={onOpenRecord}>Add your marks →</Btn>
            </Panel>
          )}
          <Rows>
            {results.map(({ rec, result }, i) => {
              const [tone, label] = statusOf(result.status);
              const viable = result.routes.filter((r) => ['eligible', 'open'].includes(r.status)).map((r) => r.label);
              return (
                <Row key={rec.domainId} defaultOpen={i === 0} title={CAREER_BY_ID[rec.domainId].name}
                  sub={result.status === 'no_catalogued_route' ? 'Entry routes for this career aren’t catalogued yet'
                    : viable.length ? `Open via ${viable.join(', ')}` : `${result.routes.length} route${result.routes.length === 1 ? '' : 's'} checked`}
                  meta={<Status tone={tone}>{label}</Status>}>
                  {result.routes.length === 0
                    ? <p className="text-slate-400">Praxio doesn’t have entry-route data for this career yet, so eligibility is unknown, not closed.</p>
                    : <div className="space-y-3">{result.routes.map((r) => <RouteBlock key={r.routeId} route={r} onAction={() => onOpenRecord()} />)}</div>}
                </Row>
              );
            })}
          </Rows>
          <div className="mt-10">
            <More label="How eligibility works">
              Eligibility is checked per entry route; a career closes only when every route is closed. Only official
              sources can mark a requirement as not met; anything from a secondary source stays “unclear”. Self-reported
              marks are used as given ({QUAL.class_12} and {QUAL.class_10} records). Eligibility never changes your career fit.
            </More>
          </div>
        </>
      )}
    </div>
  );
}
