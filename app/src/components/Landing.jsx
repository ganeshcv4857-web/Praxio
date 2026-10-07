import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import './opening/opening.css';

// Public "How it works" page: what Praxio is, then sign up / log in (or enter the local demo).
// Shares the opening's theme tokens and follows the device theme unless the person chose one.
const THEME_KEY = 'praxio-theme';

const QUESTIONS = [
  ['Where am I?', 'Your current stage, in plain words, with no progress bar pretending to know more than it does.'],
  ['What fits me?', 'Directions that match your interests and strengths, each with the reasons attached.'],
  ['What is actually possible?', 'Pathways open to you, needing clarification, or blocked, checked against your marks and your family’s budget.'],
  ['What am I missing?', 'What you have learned versus what you have shown, set against what the market is asking for.'],
  ['What should I do next?', 'One action, ranked first for a stated reason. Then the next.'],
];

const ORBIT = [
  { name: 'Software', x: 50, y: 4, dot: 'var(--accent)' },
  { name: 'Data', x: 94, y: 50, dot: 'var(--text-2)' },
  { name: 'Product', x: 50, y: 96, dot: 'var(--text-3)' },
  { name: 'AI & ML', x: 8, y: 50, dot: 'var(--accent)' },
];

const EVIDENCE = [
  { title: 'Missing', body: 'Not provided yet. We tell you what adding it unlocks.', icon: <span style={{ display: 'block', width: 36, height: 36, borderRadius: '50%', border: '2px dashed var(--text-3)' }} /> },
  { title: 'Self-reported', body: 'You told us. Used, and labelled as yours.', icon: <span style={{ display: 'block', width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--accent)', background: 'linear-gradient(90deg, var(--accent) 50%, transparent 50%)' }} /> },
  { title: 'Validated', body: 'Checked and confirmed. Counts at full weight.', icon: <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', background: 'var(--success)', color: 'var(--bg)' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span> },
  { title: 'Needs review', body: 'Something doesn’t add up. We ask before using it.', icon: <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--warning)', color: 'var(--warning)', fontWeight: 600 }}>?</span> },
];

const STEPS = [
  ['i.', 'Assess', 'Adaptive questions about you, your interests and your situation.'],
  ['ii.', 'Map', 'Career fit and feasibility, explained dimension by dimension.'],
  ['iii.', 'Validate', 'Add marks and evidence to unlock real eligibility.'],
  ['iv.', 'Build', 'Close gaps with projects that prove the skill.'],
];

function useTheme() {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null;
  const [sysDark, setSysDark] = useState(Boolean(mq?.matches));
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } });
  useEffect(() => {
    if (!mq) return undefined;
    const on = (e) => setSysDark(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [mq]);
  const dark = (theme === 'light' || theme === 'dark' ? theme : sysDark ? 'dark' : 'light') === 'dark';
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    setTheme(next);
  };
  return [dark, flip];
}

export default function Landing({ onSignUp, onLogIn, onHome, demo }) {
  const [dark, flip] = useTheme();
  const [open, setOpen] = useState(4);
  const start = demo ? 'Enter the demo' : 'Start your assessment';
  const navLink = { padding: '0 14px', minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--text-2)', textDecoration: 'none', fontSize: 15 };

  return (
    <div className={`pxl${dark ? ' dark' : ''}`}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 24px 64px' }}>
        <nav aria-label="Site" style={{ position: 'sticky', top: 16, zIndex: 5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 8px 8px 24px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <button type="button" onClick={onHome} aria-label="Back to the start" style={{ marginRight: 'auto', background: 'none', border: 0, padding: 0, color: 'var(--text)' }}><Logo height={38} /></button>
          <a href="#how" style={navLink}>How it works</a>
          <a href="#evidence" style={navLink}>Evidence</a>
          <button type="button" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} style={{ width: 44, height: 44, borderRadius: '50%', border: 0, background: 'var(--surface-2)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="9" r="6.5" /><path d="M9 2.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
          </button>
          {!demo && <button type="button" onClick={onLogIn} style={{ ...navLink, color: 'var(--text)', background: 'none', border: 0 }}>Sign in</button>}
          <button type="button" className="pill" onClick={onSignUp} style={{ padding: '0 20px', minHeight: 44, borderRadius: 999, border: 0, background: 'var(--text)', color: 'var(--bg)', fontSize: 15, fontWeight: 500 }}>Get started</button>
        </nav>

        {/* hero */}
        <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 48, padding: '96px 0 88px' }}>
          <div style={{ flex: '999 1 480px', minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />Career intelligence for students
            </div>
            <h1 className="disp" style={{ fontSize: 'clamp(52px, 7.4vw, 112px)', margin: '32px 0 0' }}>
              Know where<br />you <span className="ser" style={{ color: 'var(--accent)' }}>stand.</span><br /><span style={{ color: 'var(--text-3)' }}>Then move.</span>
            </h1>
            <p style={{ fontSize: 20, lineHeight: 1.55, color: 'var(--text-2)', maxWidth: 520, margin: '32px 0 0' }}>
              Praxio reads your interests, marks and circumstances, then shows you what fits, what&rsquo;s actually possible, and the one thing to do next.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginTop: 40 }}>
              <button type="button" className="pill" onClick={onSignUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 30px', borderRadius: 999, border: 0, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 17, fontWeight: 500 }}>{start} <span aria-hidden="true">→</span></button>
              {!demo && <button type="button" onClick={onLogIn} style={{ fontSize: 16, minHeight: 44, background: 'none', border: 0, color: 'var(--accent)' }}>I have an account</button>}
            </div>
            {demo && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--warning)' }}>Demo mode: no Supabase configured, so data is kept only in this browser.</p>}
          </div>
          <figure aria-label="Illustrative career landscape" style={{ flex: '1 1 380px', minWidth: 0, margin: 0, position: 'relative', aspectRatio: '1 / 1', maxWidth: 500 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid var(--line)' }} />
            <div style={{ position: 'absolute', inset: '16%', borderRadius: '50%', border: '1px solid var(--line)' }} />
            <div style={{ position: 'absolute', inset: '32%', borderRadius: '50%', background: 'var(--accent-soft)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, margin: '-36px 0 0 -36px' }}>
              <div className="halo" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>you</div>
            </div>
            <div className="orbit" style={{ position: 'absolute', inset: 0 }}>
              {ORBIT.map((d) => (
                <div key={d.name} style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className="orbit-r" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)', fontSize: 14, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.dot }} />{d.name}
                  </div>
                </div>
              ))}
            </div>
            <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: -36, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Illustration · your real map comes from your answers</figcaption>
          </figure>
        </section>

        {/* five questions */}
        <section id="how" style={{ display: 'flex', flexWrap: 'wrap', gap: 56, padding: '88px 0' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 className="disp" style={{ fontSize: 'clamp(40px, 4.4vw, 64px)', margin: 0, position: 'sticky', top: 120 }}>Five questions,<br /><span className="ser" style={{ color: 'var(--accent)' }}>in order.</span></h2>
          </div>
          <ol style={{ flex: '999 1 520px', minWidth: 0, listStyle: 'none', padding: 0, margin: 0 }}>
            {QUESTIONS.map(([title, body], i) => {
              const isOpen = open === i;
              return (
                <li key={title} style={{ borderTop: '1px solid var(--line)' }}>
                  <button type="button" className="row" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} style={{ width: '100%', border: 0, background: 'transparent', color: 'var(--text)', textAlign: 'left', padding: '26px 0', display: 'flex', alignItems: 'baseline', gap: 24 }}>
                    <span className="ser" style={{ fontSize: 28, color: 'var(--text-3)', width: 40, flexShrink: 0 }}>0{i + 1}</span>
                    <span className="rowtitle" style={{ flex: 1, fontSize: 'clamp(24px, 2.6vw, 38px)', letterSpacing: '-.03em', transition: 'color .25s' }}>{title}</span>
                    <span aria-hidden="true" style={{ fontSize: 24, color: 'var(--text-3)', transform: `rotate(${isOpen ? 45 : 0}deg)`, transition: 'transform .3s' }}>+</span>
                  </button>
                  {isOpen && <p style={{ margin: '-6px 0 26px 64px', maxWidth: 540, fontSize: 17, lineHeight: 1.6, color: 'var(--text-2)' }}>{body}</p>}
                </li>
              );
            })}
          </ol>
        </section>

        {/* evidence */}
        <section id="evidence" style={{ padding: '88px 0' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
            <h2 className="disp" style={{ fontSize: 'clamp(44px, 6vw, 92px)', margin: 0 }}>Praxio doesn&rsquo;t <span className="ser" style={{ color: 'var(--accent)' }}>guess.</span></h2>
            <p style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--text-2)', margin: '28px auto 0', maxWidth: 560 }}>Every fact carries its source. What you&rsquo;ve told us looks different from what&rsquo;s been checked, and anything unknown says so.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 56 }}>
            {EVIDENCE.map((e, i) => (
              <div key={e.title} style={{ flex: '1 1 220px', maxWidth: 280, padding: 28, borderRadius: 28, background: 'var(--surface)', boxShadow: 'var(--shadow)', transform: i % 2 ? 'translateY(24px)' : 'none' }}>
                {e.icon}
                <div style={{ fontSize: 19, fontWeight: 500, marginTop: 24 }}>{e.title}</div>
                <p style={{ margin: '8px 0 0', color: 'var(--text-2)', lineHeight: 1.5 }}>{e.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* journey */}
        <section style={{ padding: '112px 0 56px' }}>
          <h2 className="disp" style={{ fontSize: 'clamp(40px, 4.4vw, 64px)', margin: 0, maxWidth: 680 }}>From first answers to <span className="ser" style={{ color: 'var(--accent)' }}>real evidence.</span></h2>
          <div style={{ position: 'relative', marginTop: 56 }}>
            <svg aria-hidden="true" viewBox="0 0 1200 160" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 160, overflow: 'visible' }}>
              <path d="M0 130 C 280 150, 380 20, 600 60 S 980 140, 1200 30" style={{ fill: 'none', stroke: 'var(--line-2)', strokeWidth: 1.5 }} />
              <path d="M0 130 C 280 150, 380 20, 600 60" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 3, strokeLinecap: 'round' }} />
            </svg>
            <ol style={{ listStyle: 'none', margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, position: 'relative', padding: '180px 0 0' }}>
              {STEPS.map(([n, title, body]) => (
                <li key={title}>
                  <div className="ser" style={{ fontSize: 22, color: 'var(--text-3)' }}>{n}</div>
                  <div style={{ fontSize: 26, letterSpacing: '-.03em', marginTop: 8 }}>{title}</div>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-2)', lineHeight: 1.55 }}>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* closer */}
        <section style={{ marginTop: 88, padding: '88px 24px', borderRadius: 40, background: 'var(--surface)', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
          <h2 className="disp" style={{ fontSize: 'clamp(44px, 6.4vw, 100px)', margin: 0 }}>Ready when <span className="ser" style={{ color: 'var(--accent)' }}>you are.</span></h2>
          <p style={{ fontSize: 18, color: 'var(--text-2)', margin: '24px 0 0' }}>The assessment adapts as you answer. Stop anytime and come back.</p>
          <button type="button" className="pill" onClick={onSignUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 32px', marginTop: 40, borderRadius: 999, border: 0, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 17, fontWeight: 500 }}>{start} <span aria-hidden="true">→</span></button>
        </section>

        <footer style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, padding: '40px 8px 0', color: 'var(--text-3)', fontSize: 14 }}>
          <span>praxio. — from praxis: theory, put into practice</span>
          <button type="button" onClick={onHome} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: 14 }}>Replay the intro</button>
        </footer>
      </div>
    </div>
  );
}
