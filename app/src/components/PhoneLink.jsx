import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase.js';
import { formatLinkCode, linkPayload } from '../../supabase/functions/_shared/deviceLink.js';

// "Connect your phone": a QR code + typed code that signs the Praxio mobile app in as the
// current user. Codes come from the device-link edge function (5 minutes, single use).
export default function PhoneLink({ onClose, dark }) {
  const [link, setLink] = useState(null); // { code, expires_at }
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const create = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await supabase.functions.invoke('device-link', { body: { action: 'create' } });
      if (e) {
        let msg = 'Could not create a code. Please try again.';
        try { msg = (await e.context?.json())?.error ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      setLink(data);
      setQr(await QRCode.toDataURL(linkPayload(data.code, window.location.origin), {
        margin: 1, width: 440, errorCorrectionLevel: 'M',
        color: { dark: dark ? '#F1EEE8' : '#1C1B19', light: dark ? '#1F1F1E' : '#FFFFFF' },
      }));
    } catch (e) {
      setLink(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [dark]);

  useEffect(() => { create(); }, [create]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = link ? Math.max(0, Math.round((new Date(link.expires_at).getTime() - now) / 1000)) : 0;
  const expired = Boolean(link) && left === 0;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="phone-link-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[32px] bg-slate-900 p-8 shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="phone-link-title" className="text-[28px] font-normal leading-tight tracking-[-0.03em]">Connect your <span className="ser text-indigo-300">phone.</span></h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300 hover:text-slate-100">✕</button>
        </div>
        <p className="mt-3 text-[15px] text-slate-400">Scan this with your phone’s camera or with the Praxio app, or type the code in the app.</p>

        <div className="mt-6 grid place-items-center">
          {busy && !link && <div className="grid h-[220px] w-[220px] place-items-center rounded-3xl bg-slate-800 text-sm text-slate-400">Making a code…</div>}
          {link && !expired && <img src={qr} alt="QR code to connect your phone" width={220} height={220} className="rounded-3xl" />}
          {expired && <div className="grid h-[220px] w-[220px] place-items-center rounded-3xl bg-slate-800 p-6 text-center text-sm text-slate-400">This code expired.</div>}
          {error && <p role="alert" className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
        </div>

        {link && !expired && (
          <div className="mt-6 text-center">
            <div className="text-sm text-slate-500">Or type this code</div>
            <div className="mt-1 select-all font-semibold tabular-nums tracking-[0.18em] text-slate-100" style={{ fontSize: 34 }}>{formatLinkCode(link.code)}</div>
            <div className="mt-2 text-sm text-slate-500" aria-live="polite">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · works once</div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <button type="button" disabled={busy} onClick={create} className="pill min-h-[46px] rounded-full bg-slate-800 px-5 text-[15px] text-slate-100 hover:bg-slate-700 disabled:opacity-50">
            {busy ? 'Making a code…' : 'New code'}
          </button>
        </div>
      </div>
    </div>
  );
}
