# Praxio — career development for engineering students


> Discover → Learn → Apply → Build → Prove → Improve. Identity, persistence and data architecture: [docs/DATA_ARCHITECTURE.md](docs/DATA_ARCHITECTURE.md).
Profile the student → recommend 5–8 career domains with a suitability score →
explain each recommendation from the student's own answers → show a pathway.

Stack: React 18 + Tailwind (Vite), Supabase (Auth, Postgres + RLS, Edge Functions), Gemini.
Built new; borrows only the app-shell layout, the AI-chat pattern and the weighted-scoring
idea from ScholarSync (MIT).

## How it works

| Piece | Where |
| --- | --- |
| Onboarding (basics, interests, aptitude self-rating + 8-question check, preferences, traits) | `src/components/Onboarding.jsx` |
| Feature model — every answer normalised to 0–100 | `src/lib/features.js` |
| Career catalog — 18 domains, each with a weight vector and a roadmap | `src/lib/careers.js` |
| Career Suitability Score — normalised weighted sum, per-feature breakdown, 5–8 shortlist | `src/lib/scoring.js` |
| Explanations + advisor chat (Gemini, server-side) | `supabase/functions/career-ai/index.ts` |
| Grounding context sent to the model | `src/lib/ai.js` → `buildContext` |
| Schema + RLS | `supabase/migrations/` |

**Scoring.** `score = Σ wᵢ·xᵢ / Σ wᵢ` over the features the student actually answered.
Nothing is defaulted, floored or capped. Missing answers lower `coverage`, and a match is
shown as tentative when coverage is below 70%. The breakdown (value × weight = contribution)
appears on each career page and is what the explanation must cite.

**Explanations.** The edge function sends the student's answers and each domain's top
drivers and gaps to Gemini with a JSON `responseSchema`. It drops any explanation for a domain
that wasn't requested, and any citation (`grounded_on`) that isn't one of that domain's real
drivers. If Gemini is unavailable, the UI shows a deterministic, score-based fallback
labelled as such.

**Tuning.** Edit weights in `careers.js` and bump `CATALOG_VERSION`. Stored
recommendations record the version they were scored with. `npm test` checks that weights
only reference known features and that the reference profiles still rank sensibly.

## Module 2: Career Feasibility

Answers "can this student realistically pursue these careers?" for every Module 1
recommendation. The Career Fit score is never changed. Feasibility is a separate score.

| Piece | Where |
| --- | --- |
| Weights, thresholds, answer options (edit here) | `src/lib/feasibility/config.js` |
| Prototype cost/duration/risk dataset per career | `src/lib/feasibility/careerCosts.js` |
| Deterministic engine + explanations | `src/lib/feasibility/scoring.js` |
| Wizard, dashboard, comparison | `src/components/feasibility/` |
| Table `feasibility_assessments` | `supabase/migrations/20261007010000_feasibility.sql` |

`feasibility = 0.35·financial + 0.20·education + 0.20·risk + 0.10·location + 0.15·family`,
scored as 🟢 ≥ 75, 🟡 ≥ 50, 🔴 < 50. No LLM is involved. Results are recalculated from the
stored inputs on every load.

## Module 3: Career Development

Best career path → learning path → module → practical project → GitHub submission →
evaluation → reward points → demonstrated skill. Completing a module = **learned**.
Passing its project (≥ 70, with concept application ≥ 60) = **demonstrated**.

| Piece | Where |
| --- | --- |
| All rules: path weights, budget caps, difficulty, evaluation weights, pass mark, reward tiers | `src/lib/development/config.js` |
| Curated course catalog (34 courses, every module has a project template), programmes, career tracks | `src/lib/development/catalog.js` |
| Pathway building + Overall Path Score | `src/lib/development/pathways.js` |
| Progress, learned skills, course ranking | `src/lib/development/learning.js` |
| Project templates, difficulty, safe AI customisation | `src/lib/development/projects.js` |
| Score validation, weighted total, demonstrated skills, rewards, automated check | `src/lib/development/evaluation.js` |
| Flows (complete module, submit & evaluate) | `src/lib/development/service.js` |
| UI | `src/components/development/` |
| Tables | `supabase/migrations/20261007020000_career_development.sql` |

`pathScore = 0.25·fit + 0.25·feasibility + 0.20·budget + 0.15·study + 0.15·requirement`.
The budget comes from Module 2's `education_budget` + loan answer; there's no new budget question.
Gemini (`career-ai` modes `project` and `evaluate`) only tailors project wording and proposes
per-criterion scores. The app validates them and computes the total, pass/fail, skills and points.
Without Gemini, projects use templates and evaluations use a labelled automated evidence check
(README + repo metadata + explanation).

## Setup

1. Create a Supabase project. Under **Auth → URL configuration**, set the site URL to your dev/prod URL.
2. Apply the schema, using either the SQL editor (paste `supabase/migrations/*.sql`) or the CLI:
   ```bash
   supabase link --project-ref YOUR-REF
   supabase db push
   ```
3. Deploy the AI function and set its secret (get a key from Google AI Studio):
   ```bash
   supabase secrets set GEMINI_API_KEY=your-key
   supabase functions deploy career-ai
   ```
   Optional: `supabase secrets set GEMINI_MODELS=model-a,model-b` overrides the fallback order.
4. Configure and run the frontend:
   ```bash
   cp .env.example .env   # fill in URL + anon key
   npm install
   npm run dev
   ```

## Known gaps / next steps

- Password-reset emails link back to the app, but there's no "set new password" screen yet (handle the `PASSWORD_RECOVERY` auth event).
- Catalog weights are hand-set. Validate them with real students and counsellors before trusting the rankings.
- No rate limiting on `career-ai` yet. Add a per-user quota before a public launch.
