import { useState } from 'react';
import { getDecisionNarrative } from '../../lib/decision/narrative.js';

// "Why this first?" detail for the Decision Engine: alternatives, constraints, what would
// change the decision, and evidence completeness. The AI button only explains; it can't
// change the decision (engine.js is deterministic).

const head = { margin: '18px 0 6px', fontSize: 13, color: 'var(--text-3)' };
const item = { margin: '0 0 6px' };
const human = (s) => String(s).replaceAll('_', ' ');

export default function DecisionDetails({ userId, decision: d }) {
  const [narr, setNarr] = useState(null);
  const [busy, setBusy] = useState(false);
  const n = narr?.narrative;
  const ai = narr?.status === 'ai' || narr?.status === 'cached';
  const ask = async () => {
    setBusy(true);
    try { setNarr(await getDecisionNarrative({ userId, decision: d, request: true })); } catch { setNarr({ reason: 'failed' }); }
    setBusy(false);
  };

  return (
    <div>
      {ai && n?.summary && <p style={{ ...item, color: 'var(--text)' }}>{n.summary}{n.why_this_action ? ` ${n.why_this_action}` : ''}</p>}
      {d.constraints.length > 0 && (
        <>
          <div style={head}>Constraints</div>
          {d.constraints.map((c) => <p key={c.text} style={item}><span style={{ color: c.kind === 'hard' ? 'var(--danger, #c0392b)' : 'var(--warning)' }}>{c.kind === 'hard' ? 'Blocking' : 'Watch'}</span> · {c.text}</p>)}
        </>
      )}
      {d.alternatives.length > 0 && (
        <>
          <div style={head}>Why not something else first</div>
          {d.alternatives.map((x) => <p key={x.action.type + x.action.title} style={item}>{x.action.title} <span style={{ color: 'var(--text-3)', fontSize: 13 }}>· {(ai && n?.alternatives?.[x.action.type]) || x.whyNotFirst}</span></p>)}
        </>
      )}
      {d.wouldChange.length > 0 && (
        <>
          <div style={head}>What would change this</div>
          {d.wouldChange.map((w) => <p key={w.condition} style={item}>{w.condition} → {w.change}</p>)}
        </>
      )}
      <p style={{ margin: '18px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
        Evidence: {d.confidence.level}{d.confidence.missing.length ? ` · missing ${d.confidence.missing.map(human).join(', ')}` : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button type="button" className="pill" onClick={ask} disabled={busy} style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text)', fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Explaining…' : ai ? 'Refresh explanation' : 'Explain in plain words'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {ai ? 'AI-written; it can’t change Praxio’s decision.' : narr ? 'Explanation unavailable right now; these are Praxio’s own reasons.' : 'Reasons come from your Praxio results.'}
        </span>
      </div>
    </div>
  );
}
