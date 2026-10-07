import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Logo from './Logo.jsx';
import usePraxioTheme from './usePraxioTheme.js';
import './opening/opening.css';

// Real Supabase Auth (email + password): sign in, create account, reset password.
export default function AuthScreen({ initialError = '', initialNotice = '', initialTab = 'login', onBack }) {
  const [dark, flip] = usePraxioTheme();
  const [tab, setTab] = useState(initialTab); // 'login' | 'signup' | 'forgot'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const go = (id) => { setTab(id); setError(''); setNotice(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
      } else if (tab === 'signup') {
        if (form.password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (form.password !== form.confirm) throw new Error('Passwords do not match.');
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.name.trim() } },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = tab === 'login';
  const head = signIn ? ['Welcome', 'back.'] : tab === 'signup' ? ['Find your', 'position.'] : ['Reset your', 'password.'];
  const lede = signIn
    ? 'Your assessment, evidence and next move are right where you left them.'
    : tab === 'signup'
      ? 'The assessment adapts as you answer. Stop anytime and pick up where you left off.'
      : 'Enter your email and we’ll send you a link to choose a new password.';
  const input = { width: '100%', height: 54, padding: '0 18px', border: 0, borderRadius: 16, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 16, outline: 'none' };
  const label = { fontSize: 14, color: 'var(--text-2)' };
  const field = (id, text, props, extra) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><label htmlFor={id} style={label}>{text}</label>{extra}</div>
      {props.children ?? <input id={id} className="pxl-in" style={input} {...props} />}
    </div>
  );

  return (
    <div className={`pxl${dark ? ' dark' : ''}`} style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh' }}>
      <style>{'.pxl-in:focus{box-shadow:0 0 0 2px var(--accent);background:var(--surface) !important}'}</style>
      {/* orbit backdrop */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-15vw', bottom: '-35vw', width: '70vw', height: '70vw', borderRadius: '50%', border: '1px solid var(--line)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '-4vw', bottom: '-24vw', width: '48vw', height: '48vw', borderRadius: '50%', border: '1px solid var(--line)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '7vw', bottom: '-13vw', width: '26vw', height: '26vw', borderRadius: '50%', background: 'var(--accent-soft)' }} />

      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '24px clamp(20px, 4vw, 40px)' }}>
        <button type="button" onClick={onBack} aria-label="Back to Praxio" style={{ marginRight: 'auto', background: 'none', border: 0, padding: 0, color: 'var(--text)' }}><Logo height={40} /></button>
        <button type="button" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} style={{ width: 44, height: 44, borderRadius: '50%', border: 0, background: 'var(--surface)', boxShadow: 'var(--shadow)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="9" r="6.5" /><path d="M9 2.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
        </button>
        {onBack && <button type="button" onClick={onBack} style={{ minHeight: 44, padding: '0 12px', background: 'none', border: 0, color: 'var(--text-2)', fontSize: 15 }}>Back to site</button>}
      </header>

      <main style={{ position: 'relative', maxWidth: 1240, margin: '0 auto', padding: '24px clamp(20px, 4vw, 40px) 64px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 48 }}>
        <section style={{ flex: '999 1 420px', minWidth: 0 }}>
          <h1 className="disp" style={{ fontSize: 'clamp(52px, 7vw, 96px)', margin: 0 }}>{head[0]}<br /><span className="ser" style={{ color: 'var(--accent)' }}>{head[1]}</span></h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--text-2)', margin: '28px 0 0', maxWidth: 440 }}>{lede}</p>
        </section>

        <section aria-labelledby="authTitle" style={{ flex: '1 1 380px', maxWidth: 480, padding: 'clamp(24px, 4vw, 40px)', borderRadius: 36, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          {tab !== 'forgot' && (
            <div role="tablist" aria-label="Account" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4, borderRadius: 999, background: 'var(--surface-2)', position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)', transform: `translateX(${signIn ? '0%' : '100%'})`, transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }} />
              {[['login', 'Sign in'], ['signup', 'Create account']].map(([id, text]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => go(id)} style={{ position: 'relative', minHeight: 44, border: 0, background: 'transparent', borderRadius: 999, fontSize: 15, color: tab === id ? 'var(--text)' : 'var(--text-3)' }}>{text}</button>
              ))}
            </div>
          )}
          <h2 id="authTitle" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-.03em', margin: tab === 'forgot' ? 0 : '32px 0 0' }}>
            {signIn ? 'Sign in to Praxio' : tab === 'signup' ? 'Create your account' : 'Send a reset link'}
          </h2>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 24 }}>
            {tab === 'signup' && field('nm', 'Name', { type: 'text', autoComplete: 'name', placeholder: 'What should we call you?', value: form.name, onChange: set('name'), required: true })}
            {field('em', 'Email', { type: 'email', autoComplete: 'email', placeholder: 'you@example.com', value: form.email, onChange: set('email'), required: true })}
            {tab !== 'forgot' && field('pw', 'Password', {
              children: (
                <div style={{ position: 'relative' }}>
                  <input id="pw" className="pxl-in" type={showPw ? 'text' : 'password'} autoComplete={signIn ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} required style={{ ...input, paddingRight: 76 }} />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-pressed={showPw} style={{ position: 'absolute', right: 6, top: 6, height: 42, padding: '0 14px', border: 0, borderRadius: 12, background: 'transparent', color: 'var(--text-2)', fontSize: 14 }}>{showPw ? 'Hide' : 'Show'}</button>
                </div>
              ),
            }, signIn && <button type="button" onClick={() => go('forgot')} style={{ background: 'none', border: 0, padding: 0, fontSize: 14, color: 'var(--accent)' }}>Forgot?</button>)}
            {tab === 'signup' && field('cf', 'Confirm password', { type: showPw ? 'text' : 'password', autoComplete: 'new-password', value: form.confirm, onChange: set('confirm'), required: true })}

            {error && <p role="alert" style={{ margin: 0, padding: '12px 16px', borderRadius: 14, background: 'rgba(240,138,117,.12)', color: dark ? '#F08A75' : '#B23A26', fontSize: 14 }}>{error}</p>}
            {notice && <p role="status" style={{ margin: 0, padding: '12px 16px', borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--text)', fontSize: 14 }}>{notice}</p>}

            <button type="submit" className="pill" disabled={busy} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, minHeight: 56, marginTop: 6, borderRadius: 999, border: 0, background: 'var(--text)', color: 'var(--bg)', fontSize: 16, fontWeight: 500, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Please wait…' : signIn ? 'Continue' : tab === 'signup' ? 'Create account' : 'Send reset link'} {!busy && <span aria-hidden="true">→</span>}
            </button>
            {tab === 'forgot' && <button type="button" onClick={() => go('login')} style={{ background: 'none', border: 0, color: 'var(--accent)', fontSize: 15, minHeight: 44 }}>Back to sign in</button>}
          </form>
          <p style={{ margin: '20px 0 0', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Praxio never shares your record.</p>
        </section>
      </main>
    </div>
  );
}
