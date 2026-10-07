# Praxio AI Gateway (`career-ai`) & Groq Market Intelligence

> The research record is now **schema `market-v2`** (named skills/tools, regions with scope, demand trend, certifications, pathways, industries). The Market Intelligence module built on it is documented in [MARKET_INTELLIGENCE.md](MARKET_INTELLIGENCE.md).

## Why Groq

Praxio's deterministic engines (Career Fit, Feasibility, pathway ranking, evaluation
decisions) say what fits a student and what is realistic. They cannot know what the job
market looks like *today*. Groq adds a research layer: `openai/gpt-oss-120b` with Groq's
built-in **browser search** gathers current, source-backed market intelligence, which later
modules (SWOT, the PRISM decision engine) will reason over. Groq never changes a Praxio score.

## Architecture

```
React components
   └─ src/lib/marketIntelligence.js     (context, cache, re-validation)
        └─ src/lib/ai.js  invoke()       (supabase.functions.invoke — sends the user's JWT)
             └─ Edge Function career-ai  (JWT-verified gateway, keys in secrets)
                  ├─ explain | chat | project | evaluate  → Gemini   (unchanged)
                  └─ market_research                      → Groq
                       ├─ stage 1: gpt-oss-120b + browser_search  → notes + executed search results
                       ├─ evidence = URLs from executed tool results ONLY
                       ├─ stage 2: gpt-oss-120b + strict json_schema (no tools) → claims citing evidence ids
                       └─ validateMarketResearch() → validated record
   result → generated_outputs (kind 'market_insight', subject 'career', expires_at)
```

Two stages are required because Groq's browser search cannot be combined with structured
outputs in a single request.

| File | Role |
|---|---|
| `supabase/functions/career-ai/index.ts` | Gateway: routing, per-mode key checks, request size limit, error mapping |
| `supabase/functions/career-ai/gateway.js` | Mode → provider → secret map (`checkMode`) |
| `supabase/functions/career-ai/market.js` | Context whitelist, prompts, schema, evidence extraction, Groq calls, validation. Plain JS, shared with the client and tests |
| `src/lib/marketIntelligence.js` | `buildMarketContext`, `getMarketIntelligence` (cache-or-research) |
| `tests/market.test.mjs` | Validation, failure and routing tests (fake Groq; no key needed) |

## `market_research` mode

Request:
```json
{
  "mode": "market_research",
  "context": {
    "career":  { "id": "data-science", "name": "Data Scientist", "summary": "..." },
    "student": { "branch": "Computer Science / IT", "year": 2, "location": "India" },
    "skills":  ["Python", "SQL"]
  }
}
```
`feasibility` / `career_fit` may be sent but are **ignored**: they aren't needed for market
research and are never forwarded to the model. The gateway whitelists only the fields above.

Success (`200`): `{ "research": MarketRecord }`

```jsonc
{
  "career": "Data Scientist",
  "market": {
    "demand":  { "level": "very_high|high|moderate|low|mixed|unknown", "summary": "...", "sources": [1] },
    "salary":  { "currency": "INR", "region": "India",
                 "entry_level": { "range": "₹6–12 LPA", "sources": [2] } | null,
                 "mid_level":  ... | null, "senior_level": ... | null },
    "regions": [{ "text": "...", "sources": [1] }],
    "core_skills": [...], "emerging_skills": [...], "education_expectations": [...],
    "industry_trends": [...], "opportunities": [...], "threats": [...]
  },
  "sources": [{ "id": 1, "title": "...", "url": "https://...", "publisher": "...",
                "published_at": "2026-08-01" | null, "accessed_at": "<ISO>" }],
  "confidence": 0-100,
  "limitations": "...",
  "researched_at": "<ISO>", "expires_at": "<ISO, +7 days>",
  "provider": "groq", "model": "openai/gpt-oss-120b"
}
```
Every claim carries `sources` (ids into `sources[]`) so each statement is traceable.

Failure: `{ "error": "Market intelligence temporarily unavailable.", "code": "..." }`

| code | HTTP | Meaning |
|---|---|---|
| `not_configured` | 503 | `GROQ_API_KEY` not set |
| `bad_request` | 400 | `context.career.name` missing |
| `upstream` | 502 | Groq HTTP error / network failure / rate limit |
| `timeout` | 502 | Research (90 s) or structuring (45 s) timed out |
| `no_evidence` | 502 | Search returned no verifiable sources, or no claim cited one |
| `invalid_output` | 502 | Model JSON invalid, missing fields, bad enum, confidence not an integer 0–100, or > 60 KB |

## Anti-fabrication rules (enforced in code)

1. Source URLs come **only** from the search tool's executed results, never from model text. Private/local addresses are discarded.
2. Claims must cite at least one real evidence id: unsourced claims are dropped; unsourced salary bands become `null`; unsourced demand becomes `unknown`.
3. No evidence means a failure, never an answer from model memory.
4. `confidence` must be an integer 0–100 and is capped by evidence: `min(model, 30 + 15 × sources used)`.
5. On failure the client returns `status: 'unavailable'` (optionally a clearly-marked `stale` record). It never substitutes invented data.

## Storage & freshness

No new table: results are generated content and go in the existing `generated_outputs` table:
`kind='market_insight'`, `subject_type='career'`, `subject_key=<career id>`, `content` = record,
`sources`, `confidence` (stored 0–1), `generator='groq'`, `model`, `context_version='market-v1'`,
`expires_at` (= `researched_at` + 7 days). The same RLS applies (users read/insert only their own
rows). `getMarketIntelligence` reuses a fresh, re-validated record and researches again when it's
stale or when `force: true`.

**Market data never writes to authoritative tables.** Career Fit, Feasibility, pass/fail,
skills and points are untouched.

## Configuration

Set the secret on the Supabase project, never in the frontend:
```bash
npx.cmd supabase secrets set GROQ_API_KEY=gsk_your_key
```
```bash
npx.cmd supabase functions deploy career-ai
```
Optional: `GROQ_MODEL` (default `openai/gpt-oss-120b`).
**Never** create a `VITE_GROQ…` variable or put the key in any `.env` committed to git.

## Security model

- **Auth:** the function is deployed with JWT verification (Supabase default), so only signed-in Praxio users can call it.
- **Secrets:** `GROQ_API_KEY` and `GEMINI_API_KEY` exist only as function secrets. Each mode checks only its own provider's key.
- **Data minimisation:** only career name/summary, branch, year, location and demonstrated skill names are sent to Groq. No name, assessment answers, scores or family finances.
- **Abuse limits:** requests over 256 KB are rejected; outputs are size-capped and truncated per field.
- **Logging:** failures log only the error class and a short detail, never the key, prompts or student context.

## Limitations

- **Unverified Groq response shape:** Groq doesn't document the exact structure of browser-search results. Evidence extraction walks the tool output generically; verify it on the first live call.
- **No per-user rate limit or quota yet.** Each research call costs Groq tokens.
- **Writes come from the browser:** the client writes `generated_outputs`. The intended next step is for the gateway to write them with the service role.
- **Not wired into the UI yet.** The capability exists end to end through `getMarketIntelligence()`.
