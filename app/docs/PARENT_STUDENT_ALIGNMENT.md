# Module 5 — Parent–Student Alignment

**Question answered:** *How well does the student's desired career path fit the family's
expectations, finances, risk comfort and practical preferences, and which route keeps as
much of the student's goal as possible?*

This isn't "which side wins". It finds the differences, explains them, and proposes routes
that bridge them. **No new questions are asked:** everything comes from Modules 1–4.

## Where the data comes from

| Position | Source (existing) |
|---|---|
| Student's career aspiration | Module 1 `recommendations` (Career Fit per career) |
| Student's risk appetite | Module 1 `tr_risk` + `pref_novelty` (= 100 − `pref_stability`) |
| Student's own values | Module 1 `pref_stability`, `tr_risk`; Module 2 `relocation` |
| Student's study willingness | Module 2 `education_preference` ("How much additional education are you comfortable pursuing?") |
| Student's relocation | Module 2 `relocation` |
| Family budget | Module 2 `education_budget` + `loan_willingness` (via `studentCapacity`) |
| Family risk comfort | Module 2 `risk_tolerance` (low-income adjustment reused from Module 2) |
| Family priorities | Module 2 `family_priorities` |
| Family location stance | **Inferred:** "Location proximity" → prefers staying close; otherwise *unknown* |
| Family education stance | **Inferred:** "Prestige" → open to higher studies; "Job security"/"Financial stability" → prefers earlier employment; otherwise *unknown* |
| Path cost / education level / risk | Module 3 pathways (`buildPathways`) + `CAREER_COSTS` |
| Market evidence | Module 4 cached record (evidence only, never scored) |

## Score (deterministic, `src/lib/alignment/engine.js`)

Weights are in `src/lib/alignment/config.js`. **They are initial engineered values, not scientifically validated.**

| Dimension | Weight | Score |
|---|---|---|
| Career direction | 25% | 20 + 80 × (share of family career priorities the career typically offers). Location proximity is excluded here because Location scores it. |
| Education cost | 25% | 100 if path cost ≤ budget + loan, else 100 × funding ÷ cost |
| Financial risk | 20% | Path risk (career risk, +1 for a PhD route) vs. family comfort: a gap of 0 / 1 / 2+ levels scores 100 / 55 / 20 |
| Location | 10% | Only if the family prefers staying close: career relocation need 0 / 1 / 2 scores 100 / 55 / 20 |
| Length of education | 10% | Family open to higher study → 100. Prefers earlier employment → path postgraduate level 0 / 1 / 2+ scores 100 / 55 / 20 |
| Shared values | 10% | Each comparable family priority vs. the student's own preference: match 100 / partial 60 / mismatch 20, averaged |

- **Overall:** `score = Σ wᵢ·sᵢ / Σ wᵢ` over **known** dimensions. Unknown dimensions are excluded and reported. `coverage` is the share of weight with data; below 0.5 the result is **tentative**.
- **Categories:** 80+ Strong Alignment · 60–79 Moderate · 40–59 Significant Conflict · 0–39 High Conflict.
- **Per dimension:**
  - **status:** aligned 75+, partial 50–74, conflict below 50, unknown when there's no data
  - **severity:** none 75+, low 55+, medium 35+, high below that
  - each also carries the student position, the family position, a reason, its basis, and any market evidence

## Career-specific evaluation

Alignment is computed per **career and pathway**. The career's headline score uses its
**direct path**: the cheapest route that meets the career's usual education level. So the
same family can be strongly aligned with Software Engineering and in significant conflict with
Quantitative Finance. `alignShortlist()` returns this for the whole shortlist; it's the
structure the future Decision Engine will consume.

## Compromise paths (deterministic, each re-scored)

| Path | How it's chosen |
|---|---|
| **Direct** | Standard route into the career |
| **Balanced** | Same career, the alternative Module 3 route with the best alignment (shown only if it improves on Direct) |
| **Lower-risk** | Start in another shortlisted career that shares at least 2 track courses, then transition. Shown only if it beats both. |

Each path reports the alignment score *if chosen*, what it **preserves**, what it **eases**
(dimensions improving by 15+ points), its **trade-offs**, cost and complexity.

**Recommended resolution:** the best path that keeps the student's career, if it reaches 60 or more. Otherwise the lower-risk bridge.

## AI (Groq) — explanations only

- **Gateway mode:** `alignment` in `career-ai`. Prompt, schema and validation are in `supabase/functions/career-ai/alignment.js`.
- **What the model receives:** the engine's result in qualitative form. **Raw family finances are never sent.**
- **What it writes:** summary, why it matters, per-difference and per-path explanations, recommendation note and conversation starters.
- **It can't change any number:**
  - its output schema has **no score fields**
  - dimension and path ids are restricted to the analysis
  - the output is validated before display
- **When it runs:** only when the student clicks "Get personalised guidance". Results are cached in `generated_outputs` (`kind='reasoning'`) against a hash of the analysis, so any change to the data invalidates them.
- **If it fails:** a deterministic narrative is shown, labelled "Praxio's standard summary".

## Storage

- **No new table.** Alignment is a pure function of saved data, recalculated like Module 2's results, so storing it would duplicate feasibility data and could go stale.
- **Only the AI narrative is stored,** under the existing `generated_outputs` RLS.

## Privacy

Family amounts are never displayed. The UI shows qualitative statements ("Education budget:
covers this path with an education loan"). Pathway costs come from the career data, not family data.

## UI

The **Family alignment** tab shows:
- the alignment of each shortlisted career
- the selected career's score and coverage
- "Where you already align"
- "Things to talk through together", with severity labelled *Small difference / Worth discussing / Important to resolve*
- the possible paths
- the recommended compromise
- questions to discuss together

The weights are disclosed at the bottom.

## Limitations

- **Inferred family stances:** location and education stances are inferred from family priorities; there's no direct question.
- **No separate parent input:** the student enters the family's answers.
- **Unvalidated values:** weights, thresholds and bridge rules are prototype values.
- **AI narrative not yet run live** against Groq: the gateway mode needs the function redeployed.
