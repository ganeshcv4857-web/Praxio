// device-link: pair the Praxio mobile app with a website session using a short code or QR.
//
//   POST { action: 'create' }        signed-in website user  -> { code, expires_at }
//   POST { action: 'redeem', code }  the phone (anon key)    -> { token_hash }
//
// The phone exchanges token_hash for its own session with supabase.auth.verifyOtp
// ({ token_hash, type: 'magiclink' }). Codes are random, 5-minute, single-use and stored only as
// SHA-256 hashes (public.device_link_codes, service role only). No email is sent and no
// password ever reaches the phone.

import { requireUser } from '../career-ai/gateway.js';
import { LINK_TTL_SECONDS, generateLinkCode, hashLinkCode, normalizeLinkCode } from '../_shared/deviceLink.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

const BAD_CODE = 'That code is wrong or has expired. Make a new one on the website.';

async function create(req: Request) {
  const userId = await requireUser(req.headers.get('Authorization'), { supabaseUrl: SUPABASE_URL, apiKey: ANON_KEY });
  if (!userId) return json({ error: 'Sign in on the website first.' }, 401);

  // One live code per person: making a new one retires the old.
  await admin(`/rest/v1/device_link_codes?user_id=eq.${userId}&used_at=is.null`, { method: 'DELETE' });

  const code = generateLinkCode();
  const expires_at = new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString();
  const res = await admin('/rest/v1/device_link_codes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, code_hash: await hashLinkCode(code), expires_at }),
  });
  if (!res.ok) return json({ error: 'Could not create a code. Please try again.' }, 500);
  return json({ code, expires_at });
}

async function redeem(raw: unknown) {
  const code = normalizeLinkCode(typeof raw === 'string' ? raw : '');
  if (!code) return json({ error: BAD_CODE }, 400);

  // Consume atomically: one UPDATE that only matches an unused, unexpired code.
  const now = new Date().toISOString();
  const hash = await hashLinkCode(code);
  const used = await admin(
    `/rest/v1/device_link_codes?code_hash=eq.${hash}&used_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=user_id`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_at: now }) },
  );
  const rows = used.ok ? await used.json() : [];
  const userId = rows?.[0]?.user_id;
  if (!userId) return json({ error: BAD_CODE }, 400);

  const userRes = await admin(`/auth/v1/admin/users/${userId}`);
  const user = userRes.ok ? await userRes.json() : null;
  if (!user?.email) return json({ error: 'This account can’t be linked to a phone yet.' }, 400);

  // A magic-link token for this user, handed straight to the phone (nothing is emailed).
  const linkRes = await admin('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email: user.email }),
  });
  const link = linkRes.ok ? await linkRes.json() : null;
  const token_hash = link?.hashed_token ?? link?.properties?.hashed_token;
  if (!token_hash) return json({ error: 'Could not sign the phone in. Please make a new code.' }, 500);
  return json({ token_hash });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Phone linking is not configured.' }, 500);
  let body: { action?: string; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    if (body.action === 'create') return await create(req);
    if (body.action === 'redeem') return await redeem(body.code);
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('device-link failed', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
