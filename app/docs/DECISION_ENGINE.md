# Praxio Decision Engine

Answers: *given where this person is, what they want, what is feasible, what the market asks
for, what their family can support and what they have actually demonstrated, what is the most
useful NEXT ACTION right now?* It is **not** "pick the career with the highest score".

```
loadDecisionBundle()   src/lib/decision/load.js     I/O only: profile, recs, Module 2 row, Module 3 rows,
                                                    cached market records (cache-only, never researches)
  → buildDecisionInputs()  src/lib/decisionInputs.js  bundles existing module outputs; computes no scores
  → decide()               src/lib/decision/engine.js pure, deterministic, tier-based
  → getDecisionNarrative() src/lib/decision/narrative.js  optional Groq explanation (mode 'decision')
```

## Three separate things

| | Meaning | Source |
|---|---|---|
| **Career direction** | a career worth developing toward (or none yet) | Career Fit tier + Module 5 *career-direction* dimension |
| **Route (pathway)** | how to get there; its financing and family steps | Module 5 paths + Module 2 financing per path |
| **Next action** | what to do now | stage + evidence + dependencies |

A route conflict is never reported as a career conflict. If the current route needs an
unsupported step and another route is viable, the action is `compare_pathways`. If no direct
route works but a shared-skills bridge does, it is `take_bridge_path`.

## Modes

- `commit`: one direction is developed (the career committed to in Career Development, or a clear Career Fit lead).
- `keep_open`: **a successful decision**, not a failure. Used for Class 10, the "explore careers" goal, no career at the "good" fit tier, or careers tied within the tie band. The action produces evidence (explore streams, compare degrees, a trial project in each direction).
- `no_viable_path`: every well-fitting career's routes are blocked. The action resolves the blocking step; the career is not rejected.

## Tier-based ranking (no weighted sum)

Candidates are ordered by **tier** → **stage order** (with the goal's actions promoted *within*
the stage's set) → larger core-skill gap → market demand → Career Fit → career id.

1. `evidence`: complete the assessment, confirm the stage (legacy profiles), complete feasibility (Class 12 and later)
2. `dependency`: a blocking dependency on the chosen route (undecided loan, scholarship, unsupported family step, route switch)
3. `stage`: the stage's own actions (table in `config.js`, `STAGE_ACTIONS`)
4. `later`: non-urgent items (check market research, confirm a later family step)

Feasibility, alignment and pathway scores already overlap (feasibility contains a family factor,
alignment a financial one, path score includes Career Fit). They are read as categories and
statuses, never summed again.

## Prototype thresholds (`config.js`, versioned, not validated)

| Constant | Value | Used for |
|---|---|---|
| `tieBand` | 5 Career Fit points | tie → keep_open |
| `jobReadyCoreReadiness` | 50% of market core skills demonstrated | apply-for-jobs gate |
| `jobReadyDemonstratedSkills` | 2 demonstrated track skills | apply gate without market data |
| `internshipDemonstratedSkills` | 1 demonstrated relevant skill | internship gate |
| `fitTiers` | strong 75 / good 55 | reuses Module 3's Career Fit wording |

Every decision returns `thresholds` (with `version`) and a `trace` naming the rule and threshold
behind each step. Gated actions are listed with the value vs threshold, and `wouldChange` says
what would unlock them.

## Evidence rules

- Skills: only **demonstrated** skills (passed, evaluated projects) count toward readiness. Completed modules are "learned, not proven" and lead to `complete_project`.
- Loans: modelled as an *application/approval* dependency on the borrower. Approval is always `unknown`. No family co-signer is assumed.
- Family support stays exactly as Module 5 states it (`supported` / `conditional` / `not_supported` / `unknown`). Unknown is never upgraded.
- Market: cache only. Stale data is used and flagged; missing data is `unknown`. The engine only *suggests* opening Market Intelligence.
- Class 10–12: Module 3 pathways (post-B.Tech) are not applied; stage actions use degree, exam and stream entry routes.
- Missing modules appear in `confidence.missing` (evidence completeness, not a prediction of success).

## Groq

Explanation only (`supabase/functions/career-ai/decision.js`). The context has no family money
amounts. The schema has no score, action or ranking fields. Alternative notes are restricted to
the decision's own alternatives, and the validator drops anything else. Results are cached in
`generated_outputs` (`kind='reasoning'`, `subject_type='user'`, `subject_key='decision'`) and keyed
to a hash of the decision. If Groq is unavailable, a deterministic explanation is shown.

## Storage

No database changes and no decision history table. Decisions are recomputed from stored
inputs, so they are reproducible.

## Tests

`tests/decision.test.mjs` (node:test) covers determinism, invariants (no mutation of Career Fit,
feasibility, financing, alignment, skills, points or evaluations), every stage, readiness gates,
ties, fit vs market, route vs career conflicts, loans, burden, missing and stale data, legacy
profiles and the explanation guardrails.
