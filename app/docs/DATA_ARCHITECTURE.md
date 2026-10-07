# Praxio — Identity, Persistence & Data Architecture

Status: **migrations written, not yet applied to any Supabase project.** Everything
below was exercised in demo mode (browser storage) and by the automated tests.

## 1. Principles

- **Root identity:** `auth.users.id` → `public.profiles.id`. Every user-owned row
  carries `user_id` (or is the profile itself) referencing `profiles(id) ON DELETE CASCADE`.
- **Database-enforced isolation:** RLS is enabled on every user-owned table; each policy
  is `user_id = auth.uid()` (profiles: `id = auth.uid()`). Child tables additionally check
  that the parent row belongs to the same user. An anonymous request has `auth.uid() = null`
  and sees nothing.
- **Relational, not a blob:** one table per concept; JSON only for naturally nested
  answer sets (e.g. 13 interest ratings) and score breakdowns.
- **Authoritative vs generated:** Praxio's own records (answers, deterministic scores,
  progress, decisions) are separate from generated content (AI or template text), which
  lives only in `generated_outputs`. Generated content is attached on read and can never
  overwrite authoritative data.
- **Catalogs in code:** careers, feasibility cost data, courses and project templates are
  versioned in `src/lib/**` (rows store catalog ids + version), so the deterministic engines
  and the data they ran on are reproducible.

## 2. Authentication flow

```
Landing ─► Sign up / Log in (Supabase Auth, email + password)
             │  signUp(): password handled by Supabase (never stored by Praxio);
             │  trigger handle_new_user() creates the profiles row.
             ▼
        onAuthStateChange
          INITIAL_SESSION  → session restored from storage after refresh → load user → Dashboard
          SIGNED_IN        → load user → Dashboard (reload only if the user changed)
          TOKEN_REFRESHED  → nothing to do (supabase-js refreshes automatically)
          SIGNED_OUT       → clear in-memory data → Log in (with "session ended" notice
                             unless the user logged out themselves)
          PASSWORD_RECOVERY→ "Choose a new password" screen (updateUser) → Dashboard
        Any API call rejected for an invalid/expired JWT (PGRST301/401) →
          notifySessionExpired() → local sign-out → Log in with "session expired".
```

Protected screens: every in-app screen renders only when a session exists (or in demo
mode). Data access is protected independently by RLS.

## 3. Tables

### Identity & Module 1 — Career Fit
| Table | Kind | Key columns | Relationships / constraints |
|---|---|---|---|
| `profiles` | Authoritative | `id`, `full_name`, `branch`, `year_of_study`, `interests`, `aptitude`, `aptitude_quiz`, `preferences`, `traits`, `onboarded_at` | PK = `auth.users(id)` (cascade). Committed assessment answers. |
| `assessment_sessions` | Authoritative | `status` (in_progress/completed/abandoned), `current_step`, `draft`, `quiz_answers` (raw), `catalog_version`, `started_at`, `completed_at` | `user_id → profiles`. Partial unique index: one `in_progress` per user. Drafts are committed to `profiles` only on completion. |
| `recommendations` | Authoritative | `domain_id`, `rank`, `score`, `breakdown`, `catalog_version` | `user_id → auth.users`; unique (user, domain). Deterministic Career Fit only. |
| `chat_sessions`, `chat_messages` | Conversation log | `title`, `focus_domain`; `role`, `content` | Messages → session (cascade); insert requires owning the session. |

### Module 2 — Feasibility
| Table | Kind | Key columns | Notes |
|---|---|---|---|
| `feasibility_assessments` | Authoritative | `income_band`, `education_budget`, `loan_willingness`, `risk_tolerance`, `education_preference`, `location_preference`, `relocation`, `family_priorities`, `results`, `config_version` | PK `user_id → profiles`. All option ids CHECK-constrained. `results` is a deterministic cache; scores are reproducible from inputs + version. |

### Module 3 — Career Development
| Table | Kind | Notes |
|---|---|---|
| `development_plans` | Authoritative | PK `user_id`; followed `career_id` + `pathway_type`. |
| `student_course_plans` | Authoritative | Started courses; unique (user, course). |
| `course_module_progress` | Authoritative | Learned modules; unique (user, course, module). |
| `project_challenges` | Authoritative | Assigned project in **template** wording; unique (user, course, module). |
| `project_submissions` | Authoritative | `challenge_id → project_challenges` (cascade); GitHub URL CHECK; must own the challenge. |
| `project_evaluations` | Authoritative decision | Validated criterion scores, app-computed `total_score`, `passed`, `points_awarded`, `demonstrated_skills`, `evaluator`; unique per submission; must own the submission. |
| `demonstrated_skills` | Authoritative | Unique (user, skill); best score kept. |
| `reward_transactions` | Authoritative ledger | Points per project improvement. |

### Generated content (Groq-ready)
| Table | Notes |
|---|---|
| `generated_outputs` | `kind` (career_explanation, project_customisation, evaluation_feedback; reserved: market_insight, course_suggestion, reasoning), `subject_type` + `subject_id` / `subject_key`, `content`, `generator` (gemini/groq/deterministic), `model`, `sources`, `confidence`, `context_version`, `created_at`, `expires_at`. **Append-only for users** (select/insert/delete policies, no update): newer rows supersede older ones; history is kept. |

### Indexes (beyond PKs/uniques)
`assessment_sessions(user_id, started_at desc)`, partial unique `assessment_sessions(user_id) where in_progress`,
`generated_outputs(user_id, subject_type, subject_id, kind, created_at desc)`,
`generated_outputs(user_id, subject_type, subject_key, kind, created_at desc)`,
`recommendations(user_id, rank)`, `chat_sessions(user_id, created_at desc)`,
`chat_messages(session_id, created_at)`, and per-user indexes on all Module 3 tables.

## 4. Migrations (apply in order)

| File | Contents |
|---|---|
| `20261007000000_init.sql` | profiles, recommendations, chat; RLS; new-user trigger |
| `20261007010000_feasibility.sql` | feasibility_assessments |
| `20261007020000_career_development.sql` | Module 3 tables |
| `20261007030000_praxio_foundation.sql` | assessment_sessions, generated_outputs; **backfills** existing explanations / evaluation narrative / AI challenge wording into generated_outputs, then drops those columns |

Apply:
```bash
supabase link --project-ref YOUR-REF
supabase db push            # applies all pending migrations in order
supabase functions deploy career-ai
supabase secrets set GEMINI_API_KEY=...
```
Then set the frontend env (`app/.env`) and run `npm run dev`.

## 5. Environment variables

| Variable | Where | Exposed to browser? |
|---|---|---|
| `VITE_SUPABASE_URL` | `app/.env` | Yes (public by design) |
| `VITE_SUPABASE_ANON_KEY` | `app/.env` | Yes (public; all access gated by RLS) |
| `GEMINI_API_KEY` | Supabase function secret | **No** |
| `GEMINI_MODELS` (optional) | Supabase function secret | No |
| `GROQ_API_KEY` | Supabase function secret only (used by `market_research`) | **No — never add a `VITE_` prefix** |
| `GROQ_MODEL` (optional) | Supabase function secret | No |

`.env` files are git-ignored; `app/.env.example` lists the frontend variables.

## 6. Mapping: previous state → persistent schema

| Data | Before | Now |
|---|---|---|
| Unfinished assessment (step, answers, raw quiz responses) | React memory only, lost on refresh | `assessment_sessions` (`current_step`, `draft`, `quiz_answers`) |
| Completed answers, aptitude results | `profiles` | `profiles` (unchanged) + completed `assessment_sessions` row as history/metadata |
| Career Fit shortlist | `recommendations` incl. `explanation` | `recommendations` (scores only) + `generated_outputs` (`career_explanation`, subject = recommendation id) |
| Module 2 answers & results | `feasibility_assessments` | unchanged |
| Path choice, courses, modules | Module 3 tables | unchanged |
| Project wording | `project_challenges.title/description` overwritten by AI when tailored | template wording in `project_challenges`; AI tailoring in `generated_outputs` (`project_customisation`) |
| Evaluation narrative | `project_evaluations.feedback/strengths/improvements` | `generated_outputs` (`evaluation_feedback`); evaluation row keeps the decision |
| Demo-mode data | `localStorage['app_demo_db_v1']` | Unchanged in demo mode. With Supabase configured, the dashboard offers a one-time **import** (answers, feasibility answers, path, courses, learned modules; scores recomputed; evaluations/points/skills not imported) |
| UI navigation state | React state | still React state (by design); the dashboard re-derives "where you are" from persisted data |

## 7. Groq layer

The first Groq capability, **market intelligence research**, is implemented. See [AI_GATEWAY.md](AI_GATEWAY.md).
Its results are stored as `generated_outputs` rows (`kind = market_insight`); no new table was needed.

### Original readiness notes

- One table (`generated_outputs`) already models what Groq will produce: typed `kind`,
  subject linkage, provenance (`generator`, `model`), evidence (`sources`), freshness
  (`created_at`, `expires_at`), `confidence`, and `context_version`.
- AI calls are already funnelled through one server function (`supabase/functions/career-ai`).
  The Groq layer should replace/extend that single entry point and, ideally, write
  `generated_outputs` itself with the service role — after which the client
  `insert own generated outputs` policy can be dropped.
- Deterministic engines remain authoritative and are pure functions over Praxio data, so
  Groq can read their outputs as trusted inputs.

## 8. Known gaps

- Scores, evaluations and reward rows are still inserted by the browser; RLS checks
  ownership, not values. Moving evaluation/reward writes server-side is the main
  hardening step before production.
- Module 2's wizard has no draft persistence (3 short steps).
- Navigation is state-based (no URLs).
