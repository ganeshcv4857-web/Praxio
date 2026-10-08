import { useEffect, useMemo, useState } from 'react';
import * as db from '../lib/db.js';
import { CAREER_BY_ID } from '../lib/careers.js';
import { evaluateAll, isComplete, FACTORS } from '../lib/feasibility/scoring.js';
import { pickInputs } from './feasibility/FeasibilityWizard.jsx';
import { rankPathways } from '../lib/development/pathways.js';
import { deriveProgress, pathwayStages } from '../lib/development/learning.js';
import { COURSE_BY_ID } from '../lib/development/catalog.js';
import { ASSESSMENT_STEPS } from './Onboarding.jsx';
import { userContext } from '../lib/userContext.js';
import { drivers } from '../lib/scoring.js';
import { FEATURE_LABELS } from '../lib/features.js';
import { fitTier } from '../lib/decision/candidates.js';
import { loadDecisionBundle } from '../lib/decision/load.js';
import { decide } from '../lib/decision/engine.js';
import DecisionDetails from './decision/DecisionDetails.jsx';

// The authenticated user's home ("Your position"). Everything shown is derived from
// persisted data and the deterministic Decision Engine; nothing is invented, and
// anything Praxio doesn't know yet is shown as unknown.

const TAB_FOR = {
  confirm_stage: 'profile', complete_feasibility: 'feasibility', explore_stream: 'results', explore_careers: 'results',
  compare_degrees: 'results', prepare_entrance: 'results', trial_project: 'development', build_skill: 'development',
  complete_project: 'development', close_market_gap: 'market', pursue_certification: 'development', map_transferable_skills: 'development',
  compare_pathways: 'alignment', take_bridge_path: 'alignment', resolve_family_action: 'alignment', resolve_financing: 'feasibility',
  refresh_market: 'market', pursue_internship: 'market', apply_jobs: 'market', pursue_higher_studies: 'alignment',
};
const TAB_LABEL = { profile: 'your profile', feasibility: 'feasibility', results: 'career fit', development: 'development', market: 'market', alignment: 'family alignment' };
const TIER = { strong: ['Strong alignment', 'var(--accent)', 130], good: ['Good alignment', 'var(--accent)', 170], moderate: ['Moderate alignment', 'var(--text-2)', 215] };
const FACTOR_TONE = { good: ['var(--success)', 'Clear'], warn: ['var(--warning)', 'Partial'], bad: ['#E5735E', 'Barrier'] };
const label = (f) => FEATURE_LABELS[f] ?? f.replace(/^(int|apt|pref|tr)_/, '').replaceAll('_', ' ');

const S = {
  disp: { fontWeight: 400, letterSpacing: '-.045em', lineHeight: 1.02 },
  card: { padding: 'clamp(24px, 3vw, 36px)', borderRadius: 32, background: 'var(--surface)', boxShadow: 'var(--shadow)' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 24px', borderRadius: 999, border: 0, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 15, fontWeight: 500 },
  ghost: { minHeight: 50, padding: '0 22px', borderRadius: 999, border: 0, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 15 },
  link: { background: 'none', border: 0, padding: 0, minHeight: 44, color: 'var(--accent)', fontSize: 15, fontWeight: 500 },
  muted: { fontSize: 15, color: 'var(--text-3)' },
  chip: (bg, fg) => ({ padding: '8px 14px', borderRadius: 999, background: bg, color: fg, fontSize: 15 }),
};
const Ser = ({ children }) => <span className="ser" style={{ color: 'var(--accent)' }}>{children}</span>;
const Dot = ({ color, ring }) => <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: color, boxShadow: ring ? `inset 0 0 0 1.5px ${ring}` : undefined }} />;
const Bar = ({ pct, color }) => (
  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', marginTop: 8 }}>
    <div style={{ height: 8, borderRadius: 4, background: color, width: `${Math.max(0, Math.min(100, pct))}%`, transition: 'width .6s' }} />
  </div>
);

export default function Dashboard({ userId, profile, recs, feasibilityRow, assessmentSession, onStartAssessment, onOpenCareer, go, importOffer }) {
  const inputs = useMemo(() => pickInputs(feasibilityRow), [feasibilityRow]);
  const ctx = userContext({ ...profile, ...(assessmentSession?.draft ?? {}), current_stage: profile?.current_stage ?? assessmentSession?.draft?.current_stage });
  const m1Done = Boolean(profile?.onboarded_at) && recs.length > 0;
  const m1Active = Boolean(assessmentSession);
  const m2Done = m1Done && isComplete(inputs);
  const firstName = profile?.full_name?.trim().split(' ')[0];

  const [dev, setDev] = useState(null);
  useEffect(() => {
    if (!m1Done) return;
    db.getDevelopment(userId).then(setDev).catch((e) => console.warn('Development load failed', e));
  }, [m1Done, userId]);

  // Decision Engine: deterministic source of the next move.
  const [bundle, setBundle] = useState(null);
  useEffect(() => {
    if (!m1Done) return undefined;
    let live = true;
    loadDecisionBundle({ userId, profile, recs, inputs }).then((b) => live && setBundle(b)).catch((e) => console.warn('Decision load failed', e));
    return () => { live = false; };
  }, [m1Done, userId, profile, recs, inputs]);
  const decision = useMemo(() => (bundle ? decide(bundle) : null), [bundle]);

  const feas = useMemo(() => (m2Done ? Object.fromEntries(evaluateAll(inputs, recs).map((r) => [r.domainId, r])) : {}), [m2Done, inputs, recs]);
  const progress = useMemo(() => deriveProgress(dev), [dev]);
  const chosen = useMemo(() => {
    if (!m2Done || !dev) return null;
    const pathways = rankPathways(recs, inputs);
    return (dev.plan && pathways.find((p) => p.careerId === dev.plan.career_id && p.type === dev.plan.pathway_type)) || pathways[0];
  }, [m2Done, dev, recs, inputs]);
  const courses = chosen ? pathwayStages(chosen, progress).filter((s) => s.kind === 'course') : [];
  const modulesDone = courses.reduce((s, c) => s + c.progress.done, 0);
  const modulesTotal = courses.reduce((s, c) => s + c.progress.total, 0);
  const m3Started = Boolean(dev && (dev.plan || dev.coursePlans?.length || dev.moduleProgress?.length));
  const passed = dev?.challenges?.filter((c) => c.status === 'passed') ?? [];

  const [sel, setSel] = useState(null);
  const [dimSel, setDimSel] = useState(null);
  const [why, setWhy] = useState(false);
  const top = recs.slice(0, 5);
  const cur = top.find((r) => r.domainId === sel) ?? top[0];

  // ---- Position -------------------------------------------------------------
  const pos = !m1Done
    ? ['You’re at a', 'starting point.', m1Active ? `Your assessment is in progress (step ${assessmentSession.current_step + 1} of ${ASSESSMENT_STEPS}). Your answers so far are saved.` : `Praxio starts with who you are. For ${ctx.stageLabel.toLowerCase()}, it focuses on ${ctx.focus}.`]
    : !m2Done
      ? ['You’ve found a', 'direction.', `Your interests point toward ${CAREER_BY_ID[recs[0].domainId]?.name ?? 'a clear direction'}. What’s realistic for you is still unknown until you complete feasibility.`]
      : !m3Started
        ? ['You’re ready to', 'build.', 'Your direction is mapped and checked against your circumstances. Next, turn it into demonstrated skill.']
        : ['You’re', 'building.', `${modulesDone} of ${modulesTotal} modules learned on your path into ${CAREER_BY_ID[chosen?.careerId]?.name ?? 'your career'}, ${passed.length} project${passed.length === 1 ? '' : 's'} passed.`];
  const stepState = [m1Active || m1Done, m1Done, m2Done, m3Started, modulesTotal > 0 && modulesDone === modulesTotal];
  const currentStep = stepState.findIndex((d) => !d);
  const STEPS = [['Discovered', 'Interests captured'], ['Understood', 'Career fit mapped'], ['Validated', 'Feasibility checked'], ['Building', 'Projects & skills'], ['Ready', 'Evidence-backed']];

  // ---- Next move (Decision Engine when available) --------------------------
  let next;
  if (!m1Done) {
    next = { title: m1Active ? 'Continue your assessment.' : 'Start your career assessment.', why: [{ text: m1Active ? 'Your answers so far are saved; finishing unlocks your career map.' : 'About 10 minutes: interests, aptitude, preferences and personality. Everything else builds on it.' }], unlocks: 'Your career fit map and every module after it', cta: m1Active ? 'Continue assessment' : 'Start assessment', action: onStartAssessment };
  } else if (decision) {
    const a = decision.nextAction;
    next = { title: a.title, why: a.reasons, steps: a.steps, unlocks: decision.direction ? `${decision.direction.name} · ${decision.direction.fitTier} fit` : null, cta: `Open ${TAB_LABEL[TAB_FOR[a.type]] ?? 'it'}`, action: TAB_FOR[a.type] ? () => go(TAB_FOR[a.type]) : null };
  } else {
    next = { title: 'Working out your best next step…', why: [], cta: null };
  }

  // ---- Career map ----------------------------------------------------------
  const nodes = top.map((r, i) => {
    const tier = fitTier(r.score);
    const angle = [-28, 38, 196, 122, 284][i] * (Math.PI / 180);
    const rad = TIER[tier][2];
    return { r, tier, x: 380 + Math.cos(angle) * rad * 1.35, y: 270 + Math.sin(angle) * rad };
  });
  const curNode = nodes.find((n) => n.r.domainId === cur?.domainId);
  const d = cur ? drivers(cur) : null;
  const roadmap = cur ? CAREER_BY_ID[cur.domainId]?.roadmap : null;

  // ---- State panels --------------------------------------------------------
  const academic = bundle?.academic;
  const acadCareer = academic?.careers?.find((c) => c.careerId === cur?.domainId);
  // Missing until a record exists; self-reported vs validated from its evidence level.
  const level = academic?.status === 'evaluated' ? acadCareer?.evidenceLevel ?? null : null;
  const acadState = !level
    ? { step: 0, title: 'Not provided yet', body: 'Pathway eligibility is unknown.', icon: 'missing' }
    : acadCareer?.status === 'unknown'
      ? { step: 1, title: 'Needs review', body: 'Some academic information needs clarification.', icon: 'review' }
      : level === 'self_reported'
        ? { step: 1, title: 'Self-reported', body: 'Your record is in; it hasn’t been validated yet.', icon: 'self' }
        : { step: 2, title: 'Validated', body: 'Your academic record passed validation.', icon: 'ok' };
  const f = cur ? feas[cur.domainId] : null;
  const dims = f ? FACTORS.map(({ id, label: l }) => ({ id, label: l, status: f.factors[id].status, message: f.factors[id].message })) : [];
  const dim = dims.find((x) => x.id === dimSel) ?? dims.find((x) => x.status !== 'good') ?? dims[0];
  const mk = bundle?.careers?.find((c) => c.careerId === cur?.domainId);
  const gap = mk?.skillGap?.items?.filter((s) => s.status === 'missing') ?? [];
  const skillRows = gap.length ? mk.skillGap.items.slice(0, 4) : [];

  const ICON = {
    missing: <span style={{ width: 52, height: 52, borderRadius: '50%', border: '2px dashed var(--text-3)', flexShrink: 0 }} />,
    self: <span style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--accent)', background: 'linear-gradient(90deg, var(--accent) 50%, transparent 50%)', flexShrink: 0 }} />,
    ok: <span style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', background: 'var(--success)', color: 'var(--bg)', flexShrink: 0 }}>✓</span>,
    review: <span style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--warning)', color: 'var(--warning)', fontWeight: 600, flexShrink: 0 }}>?</span>,
  };

  return (
    <div>
      {importOffer && <div style={{ marginBottom: 24 }}>{importOffer}</div>}

      {/* ===== HERO ===== */}
      <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 48, padding: 'clamp(40px, 7vw, 88px) 0 72px' }}>
        <div style={{ flex: '999 1 480px', minWidth: 0 }}>
          <div style={S.muted}>Your position{firstName ? ` · ${firstName}` : ''} · {ctx.stageLabel}</div>
          <h1 style={{ ...S.disp, fontSize: 'clamp(52px, 7vw, 108px)', margin: '20px 0 0' }}>{pos[0]}<br /><Ser>{pos[1]}</Ser></h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--text-2)', maxWidth: 540, margin: '28px 0 0' }}>{pos[2]}</p>
          <div aria-label={`Your progress: ${STEPS[Math.max(0, currentStep === -1 ? 4 : currentStep)][0]}`} style={{ position: 'relative', marginTop: 52, maxWidth: 640 }}>
            <svg aria-hidden="true" viewBox="0 0 640 40" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 40, overflow: 'visible' }}>
              <path d="M8 28 C 120 4, 220 4, 320 20 S 520 36, 632 12" pathLength="1" style={{ fill: 'none', stroke: 'var(--line-2)', strokeWidth: 1.5 }} />
              <path d="M8 28 C 120 4, 220 4, 320 20 S 520 36, 632 12" pathLength="1" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 3, strokeLinecap: 'round', strokeDasharray: `${stepState.filter(Boolean).length / 5} 2` }} />
            </svg>
            <ol style={{ listStyle: 'none', padding: '52px 0 0', margin: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', position: 'relative' }}>
              {STEPS.map(([l, note], i) => (
                <li key={l}>
                  <div style={{ fontSize: 15, color: i === currentStep ? 'var(--accent)' : stepState[i] ? 'var(--text)' : 'var(--text-3)', fontWeight: i === currentStep ? 600 : 400 }}>{l}</div>
                  <div className="hidden sm:block" style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, paddingRight: 8 }}>{note}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside aria-labelledby="nm" style={{ ...S.card, flex: '1 1 360px', minWidth: 0, position: 'relative', overflow: 'hidden', borderRadius: 36 }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: -80, top: -80, width: 260, height: 260, borderRadius: '50%', background: 'var(--accent-soft)' }} />
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 14, fontWeight: 500 }}>
            <span style={{ position: 'relative', width: 8, height: 8 }}><span className="halo" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} /><span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} /></span>
            Your next move
          </div>
          <h2 id="nm" style={{ position: 'relative', fontSize: 32, fontWeight: 500, lineHeight: 1.15, letterSpacing: '-.03em', margin: '24px 0 0' }}>{next.title}</h2>
          {next.why[0] && <p style={{ position: 'relative', margin: '14px 0 0', color: 'var(--text-2)', lineHeight: 1.55 }}>{next.why[0].text}</p>}
          {next.unlocks && <div style={{ position: 'relative', marginTop: 20, padding: '16px 18px', borderRadius: 18, background: 'var(--surface-2)', fontSize: 15, lineHeight: 1.5 }}><span style={{ color: 'var(--text-3)' }}>{m1Done ? 'Direction' : 'Unlocks'}</span><br />{next.unlocks}</div>}
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 26 }}>
            {next.action && <button type="button" className="pill" onClick={next.action} style={S.pill}>{next.cta} <span aria-hidden="true">→</span></button>}
            {(next.why.length > 1 || next.steps?.length || (m1Done && decision)) && <button type="button" className="pill" onClick={() => setWhy(!why)} aria-expanded={why} style={S.ghost}>Why this first?</button>}
          </div>
          {why && (
            <div style={{ position: 'relative', marginTop: 20, fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6 }}>
              {next.why.map((r) => <p key={r.text} style={{ margin: '0 0 8px' }}>{r.text}{r.basis && <span style={{ color: 'var(--text-3)', fontSize: 13 }}> · {r.basis}</span>}</p>)}
              {next.steps?.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{next.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
              {m1Done && decision && <DecisionDetails userId={userId} decision={decision} />}
            </div>
          )}
        </aside>
      </section>

      {/* ===== WHAT FITS YOU ===== */}
      <section style={{ padding: '48px 0 64px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <h2 style={{ ...S.disp, fontSize: 'clamp(40px, 4.4vw, 64px)', margin: 0 }}>What <Ser>fits</Ser> you</h2>
          <p style={{ color: 'var(--text-2)', maxWidth: 400, margin: 0, lineHeight: 1.55 }}>Closer to you means stronger alignment with your answers. Choose a direction to see why.</p>
        </div>
        {!m1Done ? (
          <div style={{ ...S.card, marginTop: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 19, margin: 0 }}>Your career map appears after the assessment.</p>
            <p style={{ ...S.muted, margin: '8px 0 20px' }}>Praxio won’t guess what fits before it knows you.</p>
            <button type="button" className="pill" onClick={onStartAssessment} style={S.pill}>{m1Active ? 'Continue assessment' : 'Start assessment'} →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, marginTop: 40, alignItems: 'center' }}>
            <div style={{ flex: '999 1 520px', minWidth: 0, position: 'relative', height: 540 }} className="hidden md:block">
              {[520, 320].map((s) => <div key={s} aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: s, height: s, margin: `${-s / 2}px 0 0 ${-s / 2}px`, borderRadius: '50%', border: '1px solid var(--line)' }} />)}
              <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: 180, height: 180, margin: '-90px 0 0 -90px', borderRadius: '50%', background: 'var(--accent-soft)' }} />
              <svg viewBox="0 0 760 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                {nodes.map((n) => <line key={n.r.domainId} x1="380" y1="270" x2={n.x} y2={n.y} style={{ stroke: n === curNode ? 'var(--accent)' : 'var(--line-2)', strokeWidth: n === curNode ? 2 : 1, transition: 'stroke .3s' }} />)}
              </svg>
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 76, height: 76, margin: '-38px 0 0 -38px' }}>
                <div className="halo" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>you</div>
              </div>
              {nodes.map((n) => {
                const on = n === curNode;
                return (
                  <button key={n.r.domainId} type="button" onClick={() => setSel(n.r.domainId)} onMouseEnter={() => setSel(n.r.domainId)} aria-pressed={on}
                    style={{ position: 'absolute', left: `${(n.x / 760) * 100}%`, top: `${(n.y / 540) * 100}%`, transform: 'translate(-50%,-50%)', display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 18px', borderRadius: 999, border: 0, background: on ? 'var(--text)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--text)', boxShadow: 'var(--shadow)', fontSize: 15, whiteSpace: 'nowrap', transition: 'background .3s, color .3s' }}>
                    <Dot color={n.tier === 'moderate' ? (on ? 'var(--bg)' : 'var(--text-2)') : 'var(--accent)'} />{CAREER_BY_ID[n.r.domainId]?.name ?? n.r.domainId}
                  </button>
                );
              })}
            </div>
            {/* mobile: swipeable chips */}
            <div className="no-scrollbar flex md:hidden" style={{ gap: 8, overflowX: 'auto', width: '100%', paddingBottom: 6 }}>
              {nodes.map((n) => (
                <button key={n.r.domainId} type="button" onClick={() => setSel(n.r.domainId)} aria-pressed={n === curNode} style={{ flex: '0 0 auto', minHeight: 46, padding: '0 18px', borderRadius: 999, border: 0, background: n === curNode ? 'var(--text)' : 'var(--surface)', color: n === curNode ? 'var(--bg)' : 'var(--text)', boxShadow: 'var(--shadow)', fontSize: 15 }}>{CAREER_BY_ID[n.r.domainId]?.name}</button>
              ))}
            </div>

            {cur && curNode && (
              <article aria-live="polite" style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)', fontSize: 14 }}><Dot color={TIER[curNode.tier][1]} />{TIER[curNode.tier][0]}</div>
                <h3 style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-.035em', margin: '20px 0 0' }}>{CAREER_BY_ID[cur.domainId]?.name}</h3>
                {d.strengths.length > 0 && (<>
                  <div style={{ ...S.muted, fontSize: 14, marginTop: 28 }}>Why it fits</div>
                  <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>{d.strengths.map((s) => <li key={s.feature} style={S.chip('var(--accent-soft)', 'var(--text)')}>{label(s.feature)}</li>)}</ul>
                </>)}
                {roadmap && (<>
                  <div style={{ ...S.muted, fontSize: 14, marginTop: 24 }}>What to develop</div>
                  <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {roadmap.phases[0].items.slice(0, 3).map((x) => <li key={x} style={S.chip('var(--surface-2)', 'var(--text-2)')}>{x}</li>)}
                  </ul>
                </>)}
                <button type="button" className="pill" onClick={() => onOpenCareer?.(cur.domainId)} style={{ ...S.pill, marginTop: 32, background: 'var(--text)', color: 'var(--bg)' }}>Explore this path →</button>
              </article>
            )}
          </div>
        )}
      </section>

      {/* ===== STATE PANELS ===== */}
      <section aria-label="Where things stand" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', paddingTop: 24 }}>
        <div style={{ ...S.card, flex: '1 1 320px', minWidth: 0 }}>
          <div style={S.muted}>Academic evidence</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
            {ICON[acadState.icon]}
            <div><div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.02em' }}>{acadState.title}</div><div style={{ color: 'var(--text-2)', fontSize: 15, marginTop: 2 }}>{acadState.body}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 28 }}>{[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= acadState.step ? (acadState.step === 0 ? 'var(--text-3)' : 'var(--accent)') : 'var(--line)' }} />)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}><span>Missing</span><span>Self-reported</span><span>Validated</span></div>
          <button type="button" className="pill" onClick={() => go('academic')} style={{ ...S.pill, marginTop: 28, minHeight: 48 }}>{acadState.step === 0 ? 'Add your record' : 'View record'} →</button>
          {acadState.step > 0 && <button type="button" onClick={() => go('pathways')} style={{ marginLeft: 16, marginTop: 28, background: 'none', border: 0, padding: 0, color: 'var(--text-2)', fontSize: 15, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 }}>Pathways this opens</button>}
        </div>

        <div style={{ ...S.card, flex: '1 1 320px', minWidth: 0 }} className="md:mt-10">
          <div style={S.muted}>Feasibility{cur && f ? ` · ${CAREER_BY_ID[cur.domainId]?.name}` : ''}</div>
          {!f ? (
            <>
              <p style={{ margin: '16px 0 0', color: 'var(--text-2)', lineHeight: 1.5 }}>{m1Done ? 'Unknown until you tell Praxio about budget, location, family and time.' : 'Available after your assessment.'}</p>
              {m1Done && <button type="button" className="pill" onClick={() => go('feasibility')} style={{ ...S.pill, marginTop: 20, minHeight: 48 }}>Check feasibility →</button>}
            </>
          ) : (
            <>
              <p style={{ margin: '16px 0 0', color: 'var(--text-2)', lineHeight: 1.5 }}>Five dimensions, never one score. Tap one.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
                {dims.map((x) => (
                  <button key={x.id} type="button" onClick={() => setDimSel(x.id)} aria-expanded={dim?.id === x.id} style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 16px', borderRadius: 16, border: 0, background: dim?.id === x.id ? 'var(--surface-2)' : 'transparent', color: 'var(--text)', fontSize: 16 }}>
                    <span>{x.label}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: FACTOR_TONE[x.status][0] }}><Dot color={FACTOR_TONE[x.status][0]} />{FACTOR_TONE[x.status][1]}</span>
                  </button>
                ))}
              </div>
              {dim && <p style={{ margin: '14px 0 0', padding: '16px 18px', borderRadius: 18, background: 'var(--surface-2)', fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}><span style={{ color: 'var(--text)', fontWeight: 500 }}>{dim.label}.</span> {dim.message}</p>}
              <button type="button" onClick={() => go('feasibility')} style={{ ...S.link, marginTop: 8 }}>View options →</button>
            </>
          )}
        </div>

        <div style={{ ...S.card, flex: '1 1 320px', minWidth: 0 }}>
          <div style={S.muted}>Market signal</div>
          {!mk?.market ? (
            <>
              <p style={{ margin: '16px 0 0', color: 'var(--text-2)', lineHeight: 1.5 }}>{m1Done ? 'No market research for this direction yet. Praxio only shows researched, sourced signals.' : 'Available after your assessment.'}</p>
              {m1Done && <button type="button" className="pill" onClick={() => go('market')} style={{ ...S.pill, marginTop: 20, minHeight: 48 }}>Open market intelligence →</button>}
            </>
          ) : (
            <>
              <p style={{ margin: '16px 0 0', color: 'var(--text-2)', lineHeight: 1.5 }}>What the outside world suggests for {CAREER_BY_ID[cur.domainId]?.name.toLowerCase()}.</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}><span>Demand</span><span style={{ fontSize: 14, color: 'var(--text-2)', textTransform: 'capitalize' }}>{mk.market.demand?.level ?? 'Unknown'}{mk.market.demand?.trend ? ` · ${mk.market.demand.trend}` : ''}</span></div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {skillRows.map((s) => <li key={s.skill} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{s.skill}</span><span style={{ fontSize: 14, color: s.status === 'demonstrated' ? 'var(--success)' : s.status === 'learned' ? 'var(--text-2)' : 'var(--warning)', textTransform: 'capitalize' }}>{s.status}</span></li>)}
              </ul>
              {gap[0] && (
                <div style={{ marginTop: 20, padding: 20, borderRadius: 22, background: 'var(--accent-soft)' }}>
                  <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 500 }}>Your gap</div>
                  <div style={{ marginTop: 6, lineHeight: 1.5 }}>{gap[0].skill} is in demand for this direction, and you have no evidence of it yet.</div>
                  <button type="button" onClick={() => go('market')} style={{ ...S.link, marginTop: 4 }}>Close the gap →</button>
                </div>
              )}
              {!mk.market.fresh && <p style={{ ...S.muted, fontSize: 13, margin: '12px 0 0' }}>Research is out of date; refresh it in Market.</p>}
            </>
          )}
        </div>
      </section>

      {/* ===== DEVELOPMENT ===== */}
      <section style={{ padding: '112px 0 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <h2 style={{ ...S.disp, fontSize: 'clamp(40px, 4.4vw, 64px)', margin: 0 }}>Learned isn’t <Ser>shown.</Ser></h2>
          <p style={{ color: 'var(--text-2)', maxWidth: 420, margin: 0, lineHeight: 1.55 }}>Praxio tracks what you’ve studied separately from what you’ve demonstrated. Only demonstrated skills count as evidence.</p>
        </div>
        {!courses.length ? (
          <div style={{ ...S.card, marginTop: 40 }}>
            <p style={{ margin: 0, fontSize: 18 }}>{m2Done ? 'Your learning path is ready to start.' : 'Your learning path appears once feasibility is complete.'}</p>
            <button type="button" className="pill" onClick={() => go(m2Done ? 'development' : m1Done ? 'feasibility' : 'dashboard')} style={{ ...S.pill, marginTop: 18 }} disabled={!m1Done}>{m2Done ? 'Plan your learning' : 'Check feasibility'} →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, marginTop: 48 }}>
            {courses.slice(0, 3).map((c) => {
              const course = COURSE_BY_ID[c.courseId];
              const shown = passed.filter((x) => x.course_id === c.courseId).length;
              const open = dev?.challenges?.find((x) => x.course_id === c.courseId && x.status !== 'passed');
              return (
                <div key={c.courseId} style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}><h3 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{course?.title}</h3><span style={{ ...S.muted, fontSize: 14, whiteSpace: 'nowrap' }}>{c.progress.done ? `${c.progress.done} of ${c.progress.total} modules` : 'Not started'}</span></div>
                  <div style={{ marginTop: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-2)' }}><span>Learning</span><span>{c.progress.done} of {c.progress.total} modules</span></div><Bar pct={c.progress.pct} color="var(--text-3)" /></div>
                  <div style={{ marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-2)' }}><span>Demonstrated</span><span>{shown ? `${shown} project${shown === 1 ? '' : 's'} passed` : 'None yet'}</span></div><Bar pct={c.progress.total ? (shown / c.progress.total) * 100 : 0} color="var(--accent)" /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 15 }}>
                    <span style={S.muted}>Project: {open ? (open.status === 'needs_improvement' ? 'needs improvement' : 'open') : shown ? 'passed' : 'not started'}</span>
                    <button type="button" onClick={() => go('development')} style={S.link}>{open ? 'Build project' : c.status === 'done' ? 'Review' : 'Continue'} →</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== CLOSING ===== */}
      {next.action && (
        <section aria-label="Next move" style={{ marginTop: 112, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '32px 40px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 'clamp(22px, 2.6vw, 34px)', letterSpacing: '-.03em' }}>Next: <Ser>{next.title.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}.</Ser></div>
          <button type="button" className="pill" onClick={next.action} style={S.pill}>{next.cta} →</button>
        </section>
      )}
    </div>
  );
}
