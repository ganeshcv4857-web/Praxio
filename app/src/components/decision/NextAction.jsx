import { useEffect, useMemo, useState } from 'react';
import { loadDecisionBundle } from '../../lib/decision/load.js';
import { decide } from '../../lib/decision/engine.js';
import { getDecisionNarrative } from '../../lib/decision/narrative.js';

// Praxio Decision Engine card. The decision is deterministic (engine.js); the AI button
// only asks Groq to explain it. Every reason shows the module it came from.

const TAB_FOR = {
  confirm_stage: 'profile', complete_feasibility: 'feasibility', explore_stream: 'results', explore_careers: 'results',
  compare_degrees: 'results', prepare_entrance: 'results', trial_project: 'development', build_skill: 'development',
  complete_project: 'development', close_market_gap: 'market', pursue_certification: 'development', map_transferable_skills: 'development',
  compare_pathways: 'alignment', take_bridge_path: 'alignment', resolve_family_action: 'alignment', resolve_financing: 'feasibility',
  refresh_market: 'market', pursue_internship: 'market', apply_jobs: 'market', pursue_higher_studies: 'alignment',
};
const MODE_LABEL = {
  commit: 'Direction to develop',
  keep_open: 'Keep your options open (for now)',
  no_viable_path: 'Direction blocked by a required step',
};
const SUPPORT_TONE = { supported: 'text-emerald-300', willing: 'text-emerald-300', conditional: 'text-amber-300', undecided: 'text-amber-300', not_supported: 'text-rose-300', unknown: 'text-slate-400' };

export default function NextAction({ userId, profile, recs, inputs, go }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [narr, setNarr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    loadDecisionBundle({ userId, profile, recs, inputs })
      .then((b) => live && setBundle(b))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [userId, profile, recs, inputs]);

  const d = useMemo(() => (bundle ? decide(bundle) : null), [bundle]);
  useEffect(() => {
    if (!d) return;
    setNarr(null);
    getDecisionNarrative({ userId, decision: d }).then(setNarr);
  }, [d, userId]);

  if (error) return <section className="card text-sm text-slate-400">Praxio couldn't load your decision data right now.</section>;
  if (!d) return <section className="card text-sm text-slate-400">Working out your best next step…</section>;

  const a = d.nextAction;
  const n = narr?.narrative;
  const ai = narr?.status === 'ai' || narr?.status === 'cached';
  const askAi = async () => {
    setBusy(true);
    setNarr(await getDecisionNarrative({ userId, decision: d, request: true }));
    setBusy(false);
  };

  return (
    <section className="card border-indigo-500/40 bg-indigo-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Praxio recommends · {MODE_LABEL[d.mode]}</p>
          {d.direction && (
            <p className="mt-1 text-sm text-slate-300">
              {d.direction.name} · <span className="text-slate-400">{d.direction.fitTier} fit</span>
              {d.direction.status === 'route_conflict' && <span className="text-amber-300"> · career supported, current route has a conflict</span>}
            </p>
          )}
          {!!d.openDirections.length && <p className="mt-1 text-sm text-slate-400">Still open: {d.openDirections.map((o) => o.name).join(' · ')}</p>}
          <h2 className="mt-2 text-lg font-semibold">{a.title}</h2>
          {!!a.steps.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{a.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
        {TAB_FOR[a.type] && <button className="btn-primary px-5 py-2.5" onClick={() => go(TAB_FOR[a.type])}>Go</button>}
      </div>

      <div className="mt-4 rounded-xl bg-slate-950/50 p-4 text-sm">
        <p className="font-semibold">Why this?</p>
        {n && <p className="mt-1 text-slate-300">{n.summary}</p>}
        <ul className="mt-2 space-y-1">
          {a.reasons.map((r) => <li key={r.text} className="text-slate-300">{r.text} <span className="text-xs text-slate-500">· {r.basis}</span></li>)}
        </ul>
        {ai && n.why_this_action && <p className="mt-2 text-slate-300">{n.why_this_action}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={askAi}>{busy ? 'Explaining…' : ai ? 'Refresh explanation' : 'Explain in plain words'}</button>
          <span className="text-xs text-slate-500">
            {ai ? 'AI-written explanation of Praxio\'s decision; it cannot change the decision.' : narr?.reason ? 'AI explanation unavailable; showing Praxio\'s own reasons.' : 'Reasons come from your Praxio results.'}
          </span>
        </div>
      </div>

      <button className="mt-3 text-xs font-semibold text-indigo-300 hover:text-indigo-200" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Evidence, alternatives & what would change this →'}</button>
      {open && (
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          {!!d.dependencies.length && (
            <div>
              <p className="font-semibold">Steps this route depends on</p>
              <ul className="mt-1 space-y-1">{d.dependencies.map((x) => <li key={x.id}>{x.label}: <span className={SUPPORT_TONE[x.support]}>{x.support.replace('_', ' ')}</span>{x.approval && <span className="text-slate-500"> · approval {x.approval}</span>}</li>)}</ul>
            </div>
          )}
          {!!d.constraints.length && (
            <div>
              <p className="font-semibold">Constraints</p>
              <ul className="mt-1 space-y-1 text-slate-300">{d.constraints.map((c) => <li key={c.text}><span className={c.kind === 'hard' ? 'text-rose-300' : 'text-amber-300'}>{c.kind}</span> · {c.text}</li>)}</ul>
            </div>
          )}
          {!!d.alternatives.length && (
            <div>
              <p className="font-semibold">Other actions</p>
              <ul className="mt-1 space-y-1 text-slate-300">{d.alternatives.map((x) => <li key={x.action.type + x.action.title}>{x.action.title} <span className="text-xs text-slate-500">· {(ai && n.alternatives[x.action.type]) || x.whyNotFirst}</span></li>)}</ul>
            </div>
          )}
          {!!d.wouldChange.length && (
            <div>
              <p className="font-semibold">What would change this</p>
              <ul className="mt-1 space-y-1 text-slate-300">{d.wouldChange.map((w) => <li key={w.condition}>{w.condition} → {w.change}</li>)}</ul>
            </div>
          )}
          <div className="md:col-span-2 text-xs text-slate-500">
            Evidence completeness: {d.confidence.level}{d.confidence.missing.length ? ` (missing: ${d.confidence.missing.join(', ').replace('_', ' ')})` : ''}.
            {d.readiness && ` Readiness: ${d.readiness.level} (${d.readiness.basis.replaceAll('_', ' ')} ${d.readiness.value} vs prototype threshold ${d.readiness.threshold.value}).`}
            {' '}Rules: {d.version}, thresholds {d.thresholds.version}.
          </div>
        </div>
      )}
    </section>
  );
}
