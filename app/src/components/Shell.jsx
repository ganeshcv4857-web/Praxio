import { useState } from 'react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'results', label: 'My matches', icon: '◎' },
  { id: 'career', label: 'Career pathway', icon: '↗' },
  { id: 'feasibility', label: 'Feasibility', icon: '⚖' },
  { id: 'development', label: 'Learning path', icon: '▲' },
  { id: 'advisor', label: 'Ask the advisor', icon: '✦' },
  { id: 'profile', label: 'My profile', icon: '◐' },
];

// App shell: sidebar on desktop, slide-down menu on mobile.
export default function Shell({ activeTab, setActiveTab, profile, onSignOut, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (id) => { setActiveTab(id); setMenuOpen(false); };

  const navList = (
    <nav className="space-y-1">
      {NAV.map((n) => (
        <button
          key={n.id}
          onClick={() => go(n.id)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
            activeTab === n.id ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
          }`}
        >
          <span className="w-4 text-center">{n.icon}</span>
          {n.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800 p-4 md:flex">
        <div className="mb-8 px-3 text-xl font-extrabold tracking-tight">Praxio</div>
        {navList}
        <div className="mt-auto border-t border-slate-800 px-3 pt-4">
          <p className="truncate text-sm font-medium">{profile?.full_name}</p>
          <button onClick={onSignOut} className="mt-1 text-xs text-slate-500 hover:text-slate-200">Log out</button>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 md:hidden">
        <span className="text-lg font-extrabold">Praxio</span>
        <button className="btn-ghost px-3 py-1" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>Menu</button>
      </header>
      {menuOpen && (
        <div className="border-b border-slate-800 p-4 md:hidden">
          {navList}
          <button onClick={onSignOut} className="mt-3 px-3 text-xs text-slate-500">Log out</button>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
