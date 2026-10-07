// Which provider (and therefore which secret) each career-ai mode needs.
// All modes run on Groq; the map stays so a provider can be swapped per mode later.
export const MODE_PROVIDERS = Object.freeze({
  explain: 'groq',
  chat: 'groq',
  project: 'groq',
  evaluate: 'groq',
  market_research: 'groq',
  alignment: 'groq',
  decision: 'groq',
});

export const PROVIDER_SECRET = Object.freeze({ groq: 'GROQ_API_KEY' });

// Providers a mode may fall back to when its primary provider has no key configured.
export const MODE_FALLBACKS = Object.freeze({});

/** First configured provider for a mode (primary, then fallbacks), or null. */
export function resolveProvider(mode, env) {
  const primary = MODE_PROVIDERS[mode];
  if (!primary) return null;
  return [primary, ...(MODE_FALLBACKS[mode] ?? [])].find((p) => env[PROVIDER_SECRET[p]]) ?? null;
}

/** null if the mode can run, otherwise { status, body } for the gateway to return. */
export function checkMode(mode, env) {
  const provider = MODE_PROVIDERS[mode];
  if (!provider) return { status: 400, body: { error: `unknown mode: ${mode}` } };
  const secret = PROVIDER_SECRET[provider];
  if (resolveProvider(mode, env)) return null;
  return mode === 'market_research'
    ? { status: 503, body: { error: 'Market intelligence temporarily unavailable.', code: 'not_configured' } }
    : provider === 'groq'
    ? { status: 503, body: { error: mode === 'chat' ? 'The AI advisor is not configured yet.' : 'AI is not configured yet.', code: 'not_configured' } }
    : { status: 500, body: { error: `${secret} is not set for this function` } };
}

/**
 * Require a real signed-in user. Supabase's verify_jwt also accepts the project's public
 * publishable/anon key, which anyone visiting the site has, so the gateway asks Supabase
 * Auth who the bearer token belongs to. Returns the user id, or null to reject (401).
 */
export async function requireUser(authorization, { supabaseUrl, apiKey, fetchImpl = fetch }) {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  if (!token || !supabaseUrl || !apiKey) return null;
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: apiKey } });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === 'string' && user.id ? user.id : null;
  } catch {
    return null;
  }
}
