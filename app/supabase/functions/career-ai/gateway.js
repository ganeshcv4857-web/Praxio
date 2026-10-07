// Which provider (and therefore which secret) each career-ai mode needs.
// Plain JS so it can be unit-tested; the gateway checks keys per mode, so a missing
// Gemini key no longer blocks Groq modes and vice versa.
export const MODE_PROVIDERS = Object.freeze({
  explain: 'gemini',
  chat: 'gemini',
  project: 'gemini',
  evaluate: 'gemini',
  market_research: 'groq',
});

export const PROVIDER_SECRET = Object.freeze({ gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' });

/** null if the mode can run, otherwise { status, body } for the gateway to return. */
export function checkMode(mode, env) {
  const provider = MODE_PROVIDERS[mode];
  if (!provider) return { status: 400, body: { error: `unknown mode: ${mode}` } };
  const secret = PROVIDER_SECRET[provider];
  if (env[secret]) return null;
  return provider === 'groq'
    ? { status: 503, body: { error: 'Market intelligence temporarily unavailable.', code: 'not_configured' } }
    : { status: 500, body: { error: `${secret} is not set for this function` } };
}
