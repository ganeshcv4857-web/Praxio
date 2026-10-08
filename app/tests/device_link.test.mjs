import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  LINK_ALPHABET, LINK_CODE_LENGTH, generateLinkCode, normalizeLinkCode, formatLinkCode, linkPayload, parseLinkPayload, hashLinkCode,
} = await import('../supabase/functions/_shared/deviceLink.js');

test('codes are 8 characters from the look-alike-free alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateLinkCode();
    assert.equal(c.length, LINK_CODE_LENGTH);
    assert.ok([...c].every((ch) => LINK_ALPHABET.includes(ch)), c);
  }
  assert.ok(!/[01OIL]/.test(LINK_ALPHABET));
});

test('generation never biases toward early alphabet letters (rejection sampling)', () => {
  // Bytes at or above the rejection threshold are skipped, not wrapped.
  const max = 256 - (256 % LINK_ALPHABET.length);
  let call = 0;
  const bytes = () => { call++; return new Uint8Array(16).fill(call === 1 ? max : 0); };
  assert.equal(generateLinkCode(bytes), 'A'.repeat(LINK_CODE_LENGTH));
  assert.equal(call, 2);
});

test('typed codes are forgiving about case, spaces and dashes; wrong ones are rejected', () => {
  assert.equal(normalizeLinkCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeLinkCode(' ab cd ef gh '), 'ABCDEFGH');
  assert.equal(normalizeLinkCode('ABCD-EFG'), null);
  assert.equal(normalizeLinkCode('ABCD-EFG0'), null); // 0 is never in a code
  assert.equal(normalizeLinkCode(null), null);
  assert.equal(formatLinkCode('ABCDEFGH'), 'ABCD-EFGH');
});

test('QR payloads round-trip, and plain codes parse too', () => {
  const code = generateLinkCode();
  assert.equal(parseLinkPayload(linkPayload(code)), code);
  // Website QR: an https link any phone camera can open, still readable by the app.
  const web = linkPayload(code, 'https://praxio-chi.vercel.app/');
  assert.equal(web, `https://praxio-chi.vercel.app/link?code=${code}`);
  assert.equal(parseLinkPayload(web), code);
  assert.equal(parseLinkPayload(formatLinkCode(code).toLowerCase()), code);
  assert.equal(parseLinkPayload('https://example.com/?nothing=1'), null);
});

test('hashes are stable hex SHA-256 and never the code itself', async () => {
  const h = await hashLinkCode('ABCDEFGH');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashLinkCode('ABCDEFGH'));
  assert.notEqual(h, await hashLinkCode('ABCDEFGJ'));
});
