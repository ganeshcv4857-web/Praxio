# Module 4 — Market Intelligence

**Question answered:** *Is this career relevant in the current market, and what does this
student need to become competitive?*

Market Intelligence adds current, source-backed market evidence to the careers Praxio has
already recommended. It **reads** Career Fit, Feasibility and demonstrated skills; it
**never changes** them.

## Data flow

```
Module 1  recommendations (Career Fit)      ─┐
Module 2  feasibility_assessments            ├─► Market page (tab "Market")
Module 3  demonstrated_skills + module progress ┘        │
                                                          │  only when the student clicks
                                                          ▼  "Research market" / "Refresh"
             src/lib/marketIntelligence.js  getMarketIntelligence()
                     └─ src/lib/ai.js invoke({ mode: 'market_research' })   (user JWT)
                          └─ career-ai gateway → Groq (search → strict JSON → validation)
                     ◄─ validated record (schema market-v2)
             stored in generated_outputs (kind market_insight, per user + career)
                                                          │
             src/lib/marketInsights.js (deterministic, no LLM)
               ├─ marketSkillGap()          market skills vs demonstrated / learned
               ├─ personalSummary()          "what this means for you"
               ├─ personalOpportunitiesThreats()
               ├─ compareCareers()           Fit × Feasibility × Market demand
               ├─ freshness()                fresh / outdated label
               └─ marketSkillTargets()       boundary for Module 3 (not consumed yet)
```

## Research record (schema `market-v2`)

Produced and validated by `supabase/functions/career-ai/market.js`.

| Area | Fields |
|---|---|
| Demand | `level` (very_high/high/moderate/low/mixed/unknown), `trend` (growing/stable/declining/mixed/unknown), `summary`, `sources` |
| Salary | `currency`, `region`, `entry_level` / `mid_level` / `senior_level` = `{ range, sources }` or `null` |
| Geography | `regions[]` = `{ region, scope: india \| global \| remote, text, sources }` |
| Skills | `core_skills[]`, `tools[]`, `emerging_skills[]` = `{ skill, text, sources }` (short skill names, for gap analysis) |
| Education | `education_expectations[]`, `alternative_pathways[]`, `exams_certifications[]` = `{ text, sources }` |
| Industry | `industries_hiring[]`, `industry_trends[]`, `opportunities[]`, `threats[]` = `{ text, sources }` |
| Meta | `sources[]` (url, title, publisher, published_at, accessed_at), `confidence`, `limitations`, `researched_at`, `expires_at`, `provider`, `model`, `schema_version` |

**Source handling:**
- URLs come only from Groq's executed search results.
- Every item must cite at least one of them or it's dropped. Unsourced salary bands become `null`; unsourced demand becomes `unknown`.
- With no verifiable evidence, research fails instead of guessing.
- The UI shows "Not found in sources" / "No evidence found" for missing fields, and `[n]` citations link to each source.

## Caching & freshness

- **TTL:** `MARKET_CONFIG.ttlDays` in `market.js`, exported to the client as `MARKET_INTELLIGENCE_TTL_DAYS`. It's the one place the TTL is set (currently 7 days).
- **Opening the page never calls Groq.** It reads cached records with `getCachedMarketIntelligence()`, a database read only.
- **Research happens only on request:** "Research market" for a career with no record, or "Refresh market intelligence".
- **Labels:** "Research updated today/N days ago", or "Market data may be outdated … Refresh". Records are always labelled *cached research, not live*.
- **Old records:** records from an earlier schema version (`schema_version ≠ market-v2`) are treated as absent and researched again.
- **On failure:** "Market intelligence temporarily unavailable." If a previous record exists, it's shown as "Showing previously researched market intelligence from <date>". Old data is never presented as current, and nothing new is stored.

## Personalization (deterministic)

| Output | Built from |
|---|---|
| Skill gap | Market `core_skills` + `tools` + `emerging_skills`, compared with **demonstrated** skills (`demonstrated_skills`, only from passed project evaluations) and **learned** skills (completed modules). Statuses: Demonstrated ✓ / Learned, not yet proven ◐ / Missing ○. Gaps are linked to catalog courses and modules that teach the skill, with the career's courses first. |
| Summary | Demand + trend, demonstrated core skills, learned-but-unproven skills, largest gap, Career Fit |
| Opportunities | Researched opportunities + personal ones: demonstrated in-demand skills; strong demand × Fit ≥ 70; "highly feasible"; remote roles when the student won't relocate |
| Risks | Researched threats + personal ones: missing core skills; weak or declining demand; regions vs relocation preference; education expectations vs the Feasibility education factor; budget barrier from Feasibility |
| Comparison | Fit = stored Module 1 score; Feasibility = Module 2 engine result; Demand = cached research only ("Not researched" otherwise) |

Every personal item states its **basis** (e.g. "your Feasibility check"), and market items keep their citations.

**Skill matching:** names are normalised (lowercase, punctuation stripped, common synonyms such as ML → machine learning and LLM engineering → llms), then matched exactly or by whole-word containment ("SQL joins" ↔ "SQL"). Partial-word false matches ("Java" vs "JavaScript") are rejected.

## Module 3 boundary

`marketSkillTargets(gap)` returns the market skills a student still needs, with the
catalog modules that teach them. Module 3 doesn't use it yet; the learning-path logic is
unchanged. The intended future loop is: market gap → learning path → project →
demonstrated skill → updated gap.

## Security

- **Server-side only:** Groq is called only from the authenticated `career-ai` gateway. It verifies a real signed-in user, so the public publishable key alone is rejected.
- **The browser never sees `GROQ_API_KEY`,** and there's no other Groq endpoint.
- **Minimal data to Groq:** only career name/summary, branch, year, location and **demonstrated** skill names. No name, answers, scores or finances.
- **Storage:** research is stored in `generated_outputs` under the existing per-user RLS.

## Limitations

- **Cost and rate:** each research costs Groq tokens, and there's no per-user rate limit yet.
- **Unverified live behaviour:** Groq's search-result format is undocumented. Verify evidence extraction on the first live run.
- **Simple matching:** skill matching is name-based, so very differently named equivalents can be missed.
- **Browser writes:** the `generated_outputs` row is written by the browser (an existing pattern).
- **No live screenshots yet:** the UI was verified in demo mode with a clearly labelled sample record; real research needs a signed-in session.
