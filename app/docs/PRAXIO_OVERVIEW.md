# Praxio — What Exists Today

*Status snapshot of the `groq-integration` branch (repo: github.com/ganeshcv4857-web/Praxio).*

> **Praxio** (from *praxis*: theory put into practice) is a career-development system for
> engineering students: **Discover → Learn → Apply → Build → Prove → Improve**.

## 1. At a glance

| | |
|---|---|
| Modules built | 1 Career Fit · 2 Feasibility · 3 Career Development · 4 Market Intelligence · 5 Parent–Student Alignment |
| Not built yet | Final **Praxio Decision Engine** (combines all modules) |
| Frontend | React 18 + Vite 5 + Tailwind 3 (SPA, state-based navigation) |
| Backend | Supabase: Auth, Postgres + RLS, one Edge Function (`career-ai`) |
| AI | **Groq only** (`openai/gpt-oss-120b`; `gpt-oss-20b` for the chat guard), all through the `career-ai` gateway |
| Tests | 88 passing (`npm test`), production build passing |
| Supabase project | `zxfcorcveniypbexoswe`: 4 migrations applied, 1 pending; `GROQ_API_KEY` secret set |

**Core rule throughout:** deterministic Praxio code owns every score and decision (Career
Fit, Feasibility, path ranking, pass/fail, skills, points, alignment). AI only researches,
explains and drafts text, and its output is validated before use.

## 2. Architecture

```
React SPA (app/src)
 ├─ Deterministic engines (pure JS, unit-tested)
 │    scoring.js · feasibility/* · development/* · marketInsights.js · alignment/*
 ├─ Data layer  db.js → supabaseDb.js (Supabase)  |  demoDb.js (browser, no .env)
 └─ AI client   ai.js invoke() → supabase.functions.invoke('career-ai')  (user JWT)
                         │
          Supabase Edge Function  career-ai  (gateway: verifies a real signed-in user)
            modes: explain · chat · project · evaluate · market_research · alignment
                         │
                       Groq API  (key only in Supabase secrets)
```

**Storage principle:** *authoritative* records (answers, scores, progress, decisions) live
in their own tables. *Generated* content (AI or template text) lives only in
`generated_outputs`, attached on read, and can never overwrite authoritative data.

## 3. User flow

Landing → Sign up / Log in (Supabase Auth) → **Dashboard**, the home screen. It shows progress for each module and the next step.

| Sidebar tab | What it is |
|---|---|
| Dashboard | Welcome, next step, journey (Modules 1–5), shortlist, development stats |
| My matches / Career pathway | Module 1 results, explanations, roadmap per career |
| Feasibility | Module 2 form and dashboard |
| Learning path | Module 3 |
| Market | Module 4 |
| Family alignment | Module 5 |
| Ask the advisor | Groq chat with scope guardrails |
| My profile | Answers, retake |

Other behaviour:
- **Sessions** are restored after a refresh; expired sessions are signed out with a message.
- **Password reset** works end to end.
- **The assessment is resumable** ("Save & exit").

## 4. Modules

### Module 1 — Career Fit
- **Assessment:** 6 steps, 40 questions:
  - basics
  - 13 interests
  - 5 aptitude self-ratings + an 8-item quick check
  - 6 preference sliders
  - 6 traits
- **Score:** each answer becomes 0–100, then `score = Σwᵢxᵢ / Σwᵢ` over answered features, across 18 careers (`careers.js`). The shortlist is 5–8 careers.
- **Explanations:** Groq `explain` mode, citations filtered to real score drivers; template fallback.
- **Files:** `lib/features.js`, `quiz.js`, `scoring.js`, `careers.js`, `components/Onboarding.jsx`, `Results.jsx`, `CareerDetail.jsx`.

### Module 2 — Feasibility
- **Inputs:** income, total education budget, loan, family risk comfort, education preference, location, relocation, family priorities.
- **Score:** `0.35 financial + 0.20 education + 0.20 risk + 0.10 location + 0.15 family`; categories 75 / 50.
- **Career data:** a prototype cost/risk/relocation dataset for all 18 careers.
- **Files:** `lib/feasibility/{config,careerCosts,scoring}.js`, `components/feasibility/*`.

### Module 3 — Career Development
- **Pathways:** self-paced / structured / higher study / PhD, ranked by `0.25 fit + 0.25 feasibility + 0.20 budget + 0.15 study + 0.15 requirement`.
- **Catalog:** 34 curated courses, 118 modules, each module with a project template.
- **Loop:** learn → project → GitHub submission → evaluation → demonstrated skill → points.
- **Evaluation:** Groq proposes criterion scores (or an automated evidence check does); the app validates them, computes the total (40/25/20/15), decides pass (total 70+ and concept 60+), skills and points (0 / 50 / 100 / 150 / 200, improvement only).
- **Files:** `lib/development/*`, `components/development/*`.

### Module 4 — Market Intelligence
- **Research:** Groq `market_research`, two stages (browser search, then strict JSON):
  - sources come only from executed search results
  - claims without a source are dropped
  - no evidence means failure, never invented data
- **Personalization, deterministic:**
  - skill gap: demonstrated (passed projects only) vs learned (completed modules) vs missing, mapped to catalog courses
  - personal opportunities and risks, each with its basis
  - a Fit × Feasibility × Market comparison table
- **Cache:** 7-day freshness (`MARKET_CONFIG.ttlDays`); Groq is only called on Research/Refresh.
- **Files:** `career-ai/market.js`, `lib/marketIntelligence.js`, `lib/marketInsights.js`, `components/market/*`.

### Module 5 — Parent–Student Alignment
- **Score:** six dimensions (career direction 25, cost 25, risk 20, location 10, education length 10, shared values 10), using only existing data. Family location and education stances are *inferred* from priorities; when unknown they're excluded and coverage is reported.
- **Categories:** 80 / 60 / 40. Per dimension: status, severity, student and family positions, reason, market evidence.
- **Paths, each re-scored:** Direct / Balanced / Lower-risk bridge, plus a recommended compromise.
- **AI explanations:** Groq `alignment` mode, explanation-only (no score fields), cached by input hash; deterministic fallback.
- **Privacy:** family amounts are never displayed.
- **Files:** `lib/alignment/*`, `career-ai/alignment.js`, `components/alignment/*`.

### Advisor chat
- **Model:** Groq `chat`, grounded on the student's profile and shortlist.
- **Guardrails:** a classifier (gpt-oss-20b) refuses off-topic messages ("Sorry, that's out of context…"); greetings, career, technical, learning and planning are allowed. The scope rules are repeated in the advisor's instructions.

## 5. AI gateway (`supabase/functions/career-ai`)

| Mode | Purpose | Output validated by |
|---|---|---|
| `explain` | Career explanations | citation filter |
| `chat` | Advisor (guarded) | classifier + prompt rules |
| `project` | Tailor a project's wording | `applyCustomisation` (requirements fixed) |
| `evaluate` | Propose evaluation scores | `validateScores` + app-computed total |
| `market_research` | Source-backed market research | `validateMarketResearch` |
| `alignment` | Alignment explanations | `validateNarrative` |

**Security:**
- **Auth:** JWT verification, plus a check that the caller is a *real user* (the public key alone is rejected with 401).
- **Limits:** 256 KB request cap.
- **Logging:** never logs keys, prompts or student data.
- **Data sent to Groq:** the minimum needed per mode.

**Files:** `index.ts` (routing), `gateway.js` (mode → provider), `market.js`, `advisor.js`, `alignment.js`.

## 6. Database (Supabase Postgres, all tables RLS: `user_id = auth.uid()`)

| Group | Tables |
|---|---|
| Identity / M1 | `profiles`, `assessment_sessions`, `recommendations`, `chat_sessions`, `chat_messages` |
| M2 | `feasibility_assessments` |
| M3 | `development_plans`, `student_course_plans`, `course_module_progress`, `project_challenges`, `project_submissions`, `project_evaluations`, `demonstrated_skills`, `reward_transactions` |
| Generated | `generated_outputs`: explanations, project tailoring, evaluation feedback, market research (`market_insight`), alignment narratives (`reasoning`) |

**Migrations:**

| File | Status |
|---|---|
| `20261007000000_init.sql` | ✅ applied |
| `20261007010000_feasibility.sql` | ✅ applied |
| `20261007020000_career_development.sql` | ✅ applied |
| `20261007030000_praxio_foundation.sql` | ✅ applied |
| `20261007040000_groq_provider.sql` | ⏳ **pending** (allows `evaluator = 'groq'`) |

Modules 4 and 5 needed no new tables.

## 7. Repository layout

```
D:\DataQuest
├─ LICENSE (MIT), .gitignore
└─ app/
   ├─ src/  App.jsx, components/{feasibility,development,market,alignment}/, lib/{feasibility,development,alignment}/
   ├─ supabase/  migrations/ (5), functions/career-ai/
   ├─ public/brand/praxio-logo.webp
   ├─ tests/  scoring, feasibility, development, foundation, market, market_intelligence, alignment
   └─ docs/   DATA_ARCHITECTURE, AI_GATEWAY, MARKET_INTELLIGENCE, PARENT_STUDENT_ALIGNMENT, PRAXIO_OVERVIEW
```

## 8. Git

| Branch | Contains |
|---|---|
| `main` (pushed) | Modules 1–3 + auth / persistence foundation |
| `groq-integration` (local, **not pushed**) | Groq gateway, market research, user check, all-Groq switch, advisor guardrails, logo, Module 4, Module 5 |

## 9. Running it

```bash
cd D:\DataQuest\app
```
```bash
npm run dev -- --port 5174
```
```bash
npm test
```

Configuration:
- **Frontend:** `app/.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Without it the app runs in **demo mode** (browser storage, no AI).
- **Server secrets:** `GROQ_API_KEY` (set), optional `GROQ_MODEL`.

## 10. Pending / known limitations

**Pending:**
1. **Run migration `20261007040000_groq_provider.sql`** in the SQL Editor, then redeploy `career-ai`. The deployed function predates the all-Groq switch, market v2 and alignment.
2. **Push `groq-integration`** to GitHub and merge it when ready.
3. **First live checks:** sign-up/login, Groq market research (search-result format unverified), project evaluation and alignment narratives.

**Known limitations:**
- **Scores and points are written by the browser.** RLS checks ownership, not values, so these writes should move server-side before production.
- **Data:** course, cost and market reference data are prototype estimates, and the weights in every module are unvalidated starting values.
- **GitHub:** read without a token (60 requests an hour per IP).
- **Navigation:** no URL routing; the Module 2 form isn't resumable.
- **UI:** the dark theme still uses indigo accents, not the brand colours; the logo is shown as-is pending a UI pass.

## 11. Next planned

**Praxio Decision Engine:** combines Career Fit + Feasibility + Market Intelligence +
Parent–Student Alignment (plus demonstrated skills) into a final, explainable recommendation.
The modules already expose structured outputs for it:
- `rankCareers` / `evaluateAll` (Modules 1–2)
- `rankPathways` (Module 3)
- `marketSkillGap` / `compareCareers` (Module 4)
- `alignShortlist` (Module 5)
