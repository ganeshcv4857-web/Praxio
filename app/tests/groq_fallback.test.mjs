import { test } from 'node:test';
import assert from 'node:assert/strict';

const { groqJson, MarketResearchError } = await import('../supabase/functions/career-ai/market.js');

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const schema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

test('strict-schema parse failure retries once in JSON mode', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.response_format.type);
    return calls.length === 1
      ? reply(400, { error: { message: "Parsing failed. The model generated output that could not be parsed. See 'failed_generation'" } })
      : reply(200, { choices: [{ message: { content: '{"ok":true}' } }] });
  };
  const { data } = await groqJson({ apiKey: 'k', system: 's', user: 'u', name: 'x', schema, fetchImpl });
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(calls, ['json_schema', 'json_object']);
});

test('other errors are not retried', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return reply(401, { error: { message: 'Invalid API Key' } }); };
  await assert.rejects(groqJson({ apiKey: 'k', system: 's', user: 'u', name: 'x', schema, fetchImpl }), MarketResearchError);
  assert.equal(n, 1);
});

test('a rate/daily-limit 429 retries once on the fallback model', async () => {
  const { MARKET_CONFIG } = await import('../supabase/functions/career-ai/market.js');
  const models = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    models.push(body.model);
    return body.model === MARKET_CONFIG.model
      ? reply(429, { error: { message: 'Rate limit reached ... tokens per day (TPD)' } })
      : reply(200, { choices: [{ message: { content: '{"ok":true}' } }] });
  };
  const { data } = await groqJson({ apiKey: 'k', system: 's', user: 'u', name: 'x', schema, fetchImpl });
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(models, [MARKET_CONFIG.model, MARKET_CONFIG.fallbackModel]);
});

test('if the fallback model is also limited, the error surfaces (no loop)', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return reply(429, { error: { message: 'Rate limit reached' } }); };
  await assert.rejects(groqJson({ apiKey: 'k', system: 's', user: 'u', name: 'x', schema, fetchImpl }), MarketResearchError);
  assert.equal(n, 2);
});
