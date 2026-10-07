import { useEffect, useState } from 'react';

// Public pages follow the device theme unless the person picked one (saved per browser).
const THEME_KEY = 'praxio-theme';

export default function usePraxioTheme() {
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
