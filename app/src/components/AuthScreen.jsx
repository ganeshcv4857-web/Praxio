import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Logo from './Logo.jsx';

// Real Supabase Auth (email + password). Tabs mirror the original login/signup/forgot flow.
export default function AuthScreen({ initialError = '', initialNotice = '', initialTab = 'login', onBack }) {
  const [tab, setTab] = useState(initialTab); // 'login' | 'signup' | 'forgot'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo height={72} className="mx-auto" />
          <p className="mt-2 text-sm text-slate-400">Discover → Learn → Apply → Build → Prove → Improve</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1 text-sm">
            {[['login', 'Sign in'], ['signup', 'Create account']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTab(id); setError(''); setNotice(''); }}
                className={`flex-1 rounded-lg py-1.5 font-semibold ${tab === id ? 'bg-slate-950 text-white' : 'text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'signup' && (
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={set('name')} required />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
          </div>
          {tab !== 'forgot' && (
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={set('password')}
                required
              />
            </div>
          )}
          {tab === 'signup' && (
            <div>
              <label className="label">Confirm password</label>
              <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : tab === 'login' ? 'Sign in' : tab === 'signup' ? 'Create account' : 'Send reset link'}
          </button>

          <button
            type="button"
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
            onClick={() => { setTab(tab === 'forgot' ? 'login' : 'forgot'); setError(''); setNotice(''); }}
          >
            {tab === 'forgot' ? 'Back to sign in' : 'Forgot your password?'}
          </button>
        </form>
        {onBack && (
          <button type="button" onClick={onBack} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300">← Back to Praxio</button>
        )}
      </div>
    </div>
  );
}
