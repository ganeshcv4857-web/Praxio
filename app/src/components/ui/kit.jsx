import { useState } from 'react';

// Shared building blocks for the module pages: answer first, detail on demand.
// Colours come from the Praxio theme (Tailwind palette → theme variables).

/** Page header: small eyebrow, big title with one italic accent word, one-line lede, actions. */
export function PageHead({ eyebrow, title, accent, lede, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-8 pt-6">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="text-sm text-slate-500">{eyebrow}</p>}
        <h1 className="mt-3 text-[clamp(36px,4.6vw,60px)] font-normal leading-[1.02] tracking-[-0.045em]">
          {title} {accent && <span className="ser text-indigo-300">{accent}</span>}
        </h1>
        {lede && <p className="mt-4 text-[17px] leading-relaxed text-slate-400">{lede}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export const Btn = ({ kind = 'primary', className = '', ...p }) => (
  <button
    type="button"
    className={`pill inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
      kind === 'primary' ? 'bg-indigo-500 text-on-accent' : kind === 'ghost' ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'px-0 text-indigo-300 hover:text-slate-100'
    } ${className}`}
    {...p}
  />
);

/** Rounded surface. */
export const Panel = ({ className = '', children, ...p }) => (
  <section className={`rounded-[28px] bg-slate-900 p-6 shadow-[var(--shadow)] sm:p-8 ${className}`} {...p}>{children}</section>
);

/** Small status chip with a dot. tone: good | warn | bad | info | muted */
const TONES = {
  good: 'bg-emerald-500/10 text-emerald-300',
  warn: 'bg-amber-500/10 text-amber-300',
  bad: 'bg-rose-500/10 text-rose-300',
  info: 'bg-indigo-500/10 text-indigo-300',
  muted: 'bg-slate-800 text-slate-400',
};
const DOT = { good: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-rose-400', info: 'bg-indigo-400', muted: 'bg-slate-500' };
export function Status({ tone = 'muted', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium ${TONES[tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />{children}
    </span>
  );
}

/**
 * The core pattern: a compact row that expands in place.
 * `title` + `meta` (right side) are always visible; `children` only when opened.
 */
export function Row({ title, sub, meta, defaultOpen = false, open: controlled, onToggle, children }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const toggle = () => (onToggle ? onToggle(!open) : setOwn(!open));
  return (
    <li className={`rounded-3xl transition ${open ? 'bg-slate-900 shadow-[var(--shadow)]' : 'hover:bg-slate-900/60'}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-medium">{title}</div>
          {sub && <div className="mt-0.5 truncate text-sm text-slate-400">{sub}</div>}
        </div>
        {meta && <div className="hidden shrink-0 items-center gap-3 sm:flex">{meta}</div>}
        <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-400 transition ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <div className="px-5 pb-6 sm:px-6">
          {meta && <div className="mb-4 flex flex-wrap gap-2 sm:hidden">{meta}</div>}
          {children}
        </div>
      )}
    </li>
  );
}

export const Rows = ({ children }) => <ul className="flex flex-col gap-1">{children}</ul>;

/** Collapsed-by-default supporting section ("How this is calculated", "Your answers"). */
export function More({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-800 pt-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[44px] items-center gap-2 text-sm text-slate-400 hover:text-slate-100">
        <span className={`transition ${open ? 'rotate-90' : ''}`}>›</span>{label}
      </button>
      {open && <div className="pb-2 pt-2 text-sm leading-relaxed text-slate-400">{children}</div>}
    </div>
  );
}

/** Thin labelled bar. */
export function Meter({ label, value, right, tone = 'bg-indigo-400' }) {
  return (
    <div>
      <div className="flex justify-between text-sm text-slate-400"><span>{label}</span><span className="tabular-nums text-slate-200">{right}</span></div>
      <div className="mt-2 h-2 rounded-full bg-slate-800"><div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

/** One-line summary strip of counts. */
export const Summary = ({ children }) => <div className="mb-6 flex flex-wrap items-center gap-2">{children}</div>;

/** A key fact inside an expanded row. */
export const Fact = ({ label, children }) => (
  <div>
    <div className="text-[13px] text-slate-500">{label}</div>
    <div className="mt-1 text-[15px] leading-relaxed text-slate-200">{children}</div>
  </div>
);
