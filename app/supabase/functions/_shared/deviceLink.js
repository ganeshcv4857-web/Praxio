// Phone pairing codes, shared by the device-link edge function, the website (shows the code
// and QR) and the mobile app (reads them). Plain ES module: runs in Deno, browsers, Node and
// React Native.
//
// A code is 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as
// XXXX-XXXX. It is valid for LINK_TTL_SECONDS and can be used once. Only its SHA-256 hash is
// stored.

export const LINK_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;
export const LINK_TTL_SECONDS = 300;
export const LINK_SCHEME = 'praxio://link?code=';

/** Random code using rejection sampling, so every character is equally likely. */
export function generateLinkCode(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const max = 256 - (256 % LINK_ALPHABET.length);
  let out = '';
  while (out.length < LINK_CODE_LENGTH) {
    for (const b of randomBytes(16)) {
      if (b < max && out.length < LINK_CODE_LENGTH) out += LINK_ALPHABET[b % LINK_ALPHABET.length];
    }
  }
  return out;
}

/** Uppercase and drop spaces/dashes; null if the result can't be a valid code. */
export function normalizeLinkCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== LINK_CODE_LENGTH || [...s].some((ch) => !LINK_ALPHABET.includes(ch))) return null;
  return s;
}

export const formatLinkCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Deep link that opens the installed Praxio app and pairs it. */
export const appLink = (code) => `${LINK_SCHEME}${code}`;

/**
 * What the QR code encodes. With the website's origin it is an ordinary https link, so any
 * phone camera can open it (the /link page then hands off to the app or shows the code to
 * type); the in-app scanner reads the code from either form.
 */
export const linkPayload = (code, origin) => (origin ? `${origin.replace(/\/+$/, '')}/link?code=${code}` : appLink(code));

/** Code from a scanned QR (praxio://link?code=…) or from typed text; null if neither. */
export function parseLinkPayload(text) {
  if (typeof text !== 'string') return null;
  const m = /[?&]code=([A-Za-z0-9-]+)/.exec(text);
  return normalizeLinkCode(m ? m[1] : text);
}

/** Hex SHA-256 (Web Crypto: Deno, browsers, Node 18+). */
export async function hashLinkCode(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
