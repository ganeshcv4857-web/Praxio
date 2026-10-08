import Logo from './Logo.jsx';
import usePraxioTheme from './usePraxioTheme.js';
import { appLink, formatLinkCode, parseLinkPayload } from '../../supabase/functions/_shared/deviceLink.js';
import './opening/opening.css';

// /link?code=XXXX: where a phone lands after scanning the "Connect your phone" QR with its own
// camera. It never redeems the code itself; it opens the Praxio app (installed builds) or shows
// the code to type into the app.
export default function LinkHandoff() {
  const [dark] = usePraxioTheme();
  const code = parseLinkPayload(typeof window !== 'undefined' ? window.location.search : '');

  return (
    <div className={`pxl${dark ? ' dark' : ''}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '24px 24px 0' }}><Logo height={38} /></header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, maxWidth: 520, width: '100%', margin: '0 auto', padding: 24 }}>
        {code ? (
          <>
            <h1 className="disp" style={{ fontSize: 'clamp(40px, 11vw, 64px)', margin: 0 }}>Connect your <span className="ser" style={{ color: 'var(--accent)' }}>phone.</span></h1>
            <a href={appLink(code)} className="pill" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 58, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', textDecoration: 'none', fontSize: 17, fontWeight: 500 }}>
              Open the Praxio app →
            </a>
            <div style={{ padding: 24, borderRadius: 28, background: 'var(--surface)', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: 'var(--text-3)' }}>Or type this code in the app</div>
              <div style={{ marginTop: 8, fontSize: 'clamp(26px, 8.5vw, 40px)', fontWeight: 600, letterSpacing: '0.12em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatLinkCode(code)}</div>
              <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-3)' }}>Codes last 5 minutes and work once.</div>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-2)' }}>
              In the Praxio app, choose <strong style={{ color: 'var(--text)' }}>Connect your phone</strong>, then scan the QR code on your
              computer or type the code above.
            </p>
          </>
        ) : (
          <>
            <h1 className="disp" style={{ fontSize: 'clamp(36px, 10vw, 56px)', margin: 0 }}>This link has <span className="ser" style={{ color: 'var(--accent)' }}>expired.</span></h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--text-2)' }}>
              Make a new code on the Praxio website: account menu → Connect your phone.
            </p>
            <a href="/" style={{ fontSize: 16 }}>Go to Praxio →</a>
          </>
        )}
      </main>
    </div>
  );
}
