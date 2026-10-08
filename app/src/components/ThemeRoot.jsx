import usePraxioTheme from './usePraxioTheme.js';
import './opening/opening.css';

// Applies the Praxio theme (device default, or the person's choice) to screens shown
// outside the app shell: the assessment, password reset and loading states.
export default function ThemeRoot({ children }) {
  const [dark] = usePraxioTheme();
  return <div className={`pxl${dark ? ' dark' : ''}`} style={{ minHeight: '100vh' }}>{children}</div>;
}
