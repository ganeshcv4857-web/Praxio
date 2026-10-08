import { useState } from 'react';
import Logo from './Logo.jsx';
import usePraxioTheme from './usePraxioTheme.js';
import PhoneLink from './PhoneLink.jsx';
import { isConfigured } from '../lib/supabase.js';
import './opening/opening.css';

const NAV = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'results', label: 'Career fit' },
  { id: 'feasibility', label: 'Feasibility' },
  { id: 'development', label: 'Development' },
  { id: 'market', label: 'Market' },
  { id: 'alignment', label: 'Family' },
  { id: 'advisor', label: 'Advisor' },
];
const MOBILE = ['dashboard', 'results', 'development', 'market'];
const LABEL = Object.fromEntries([...NAV, { id: 'career', label: 'Career pathway' }, { id: 'profile', label: 'My profile' }, { id: 'academic', label: 'Academic record' }, { id: 'pathways', label: 'Pathways' }].map((n) => [n.id, n.label]));

// App shell: floating pill nav (desktop), bottom pill nav (mobile).
export default function Shell({ activeTab, setActiveTab, profile, onSignOut, children }) {
  const [dark, flip] = usePraxioTheme();
  const [menu, setMenu] = useState(false);
  const [phone, setPhone] = useState(false);
  const go = (id) => { setActiveTab(id); setMenu(false); };
  const initials = (profile?.full_name ?? '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'you';
  const tabBtn = (n, compact) => {
    const on = activeTab === n.id || (n.id === 'results' && activeTab === 'career');
    return (
      <button key={n.id} type="button" onClick={() => go(n.id)} aria-current={on ? 'page' : undefined}
        style={{ padding: compact ? 0 : '0 16px', minHeight: compact ? 48 : 44, borderRadius: 999, border: 0, background: on ? (compact ? 'var(--accent)' : 'var(--surface-2)') : 'transparent', color: on ? (compact ? 'var(--on-accent)' : 'var(--text)') : 'var(--text-2)', fontSize: compact ? 13 : 15, fontWeight: on && compact ? 500 : 400, whiteSpace: 'nowrap' }}>
        {n.label}
      </button>
    );
  };

  return (
    <div className={`pxl${dark ? ' dark' : ''}`} style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '16px clamp(16px, 3vw, 32px) 120px' }}>
        <nav aria-label="Praxio" style={{ position: 'sticky', top: 16, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 8px 24px', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <button type="button" onClick={() => go('dashboard')} aria-label="Overview" style={{ marginRight: 'auto', background: 'none', border: 0, padding: 0, color: 'var(--text)' }}><Logo height={36} /></button>
          <div className="hidden lg:flex" style={{ gap: 2 }}>{NAV.map((n) => tabBtn(n))}</div>
          <span className="lg:hidden" style={{ fontSize: 14, color: 'var(--text-2)', marginRight: 6 }}>{LABEL[activeTab]}</span>
          {(
            <button type="button" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} style={{ width: 44, height: 44, marginLeft: 6, borderRadius: '50%', border: 0, background: 'var(--surface-2)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="9" r="6.5" /><path d="M9 2.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Your account" style={{ width: 44, height: 44, marginLeft: 4, borderRadius: '50%', border: 0, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600 }}>{initials}</button>
            {menu && (
              <div style={{ position: 'absolute', right: 0, top: 54, minWidth: 220, padding: 8, borderRadius: 20, background: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
                {profile?.full_name && <p style={{ margin: 0, padding: '8px 12px', fontSize: 14, color: 'var(--text-3)' }}>{profile.full_name}</p>}
                {[...NAV.filter((n) => !MOBILE.includes(n.id)), { id: 'academic', label: 'Academic record' }, { id: 'pathways', label: 'Pathways' }, { id: 'profile', label: 'My profile' }].map((n) => (
                  <button key={n.id} type="button" onClick={() => go(n.id)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: 0, background: activeTab === n.id ? 'var(--surface-2)' : 'transparent', color: 'var(--text)', fontSize: 15 }}>{n.label}</button>
                ))}
                {isConfigured && (
                  <button type="button" onClick={() => { setMenu(false); setPhone(true); }} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: 0, background: 'transparent', color: 'var(--text)', fontSize: 15 }}>Connect your phone</button>
                )}
                <button type="button" onClick={onSignOut} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: 0, background: 'transparent', color: 'var(--text-2)', fontSize: 15 }}>Log out</button>
              </div>
            )}
          </div>
        </nav>

        <main style={{ paddingTop: 24 }}>{children}</main>
      </div>

      <nav aria-label="Sections" className="grid lg:hidden" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 20, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', padding: 6, borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
        {MOBILE.map((id) => tabBtn({ id, label: { dashboard: 'Home', results: 'Fit', development: 'Grow', market: 'Market' }[id] }, true))}
      </nav>
      {phone && <PhoneLink dark={dark} onClose={() => setPhone(false)} />}
    </div>
  );
}
