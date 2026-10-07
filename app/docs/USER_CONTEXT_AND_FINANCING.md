# Stage-aware context & action-aware feasibility (Review 1 refinements)

Review 1 found that Praxio implicitly asked *"what should this engineering undergraduate
choose?"* and treated *"cost > family budget"* as *"infeasible"*. These refinements make
Praxio ask instead: **who is this person, what are they doing now, what do they want, which
actions does a path depend on, and who has to take them?**

One shared core is kept: no per-stage apps or scoring engines, and **Career Fit,
Feasibility weights, Market Intelligence and the alignment weights are unchanged**.

## 1. User context (`src/lib/userContext.js`)

| Field (`profiles`) | Values |
|---|---|
| `current_stage` | `school_10`, `school_11`, `school_12`, `undergraduate`, `postgraduate`, `graduate_unemployed`, `employed_professional`, `career_switcher` |
| `current_activity` | `school_student`, `college_student`, `working`, `unemployed`, `preparing_for_exam`, `looking_for_job`, `higher_studies`, `skill_building`, `career_switching`, `other` |
| `primary_goal` | `explore_careers`, `choose_stream`, `choose_degree`, `choose_career`, `build_skills`, `internship`, `placement`, `find_job`, `higher_studies`, `career_switch`, `upskill` |
| `school_stream` | Class 11/12 only: `pcm`, `pcb`, `pcmb`, `commerce`, `humanities`, `undecided` |
| `current_role` | Working professionals and career switchers (free text, ≤ 120 chars) |

- **Reused, not duplicated:** `branch` (field of study for UG/PG/graduates) and `year_of_study` (current students only).
- **Single source of truth:** `STAGE_PROFILES` defines, per stage, the default activity, the relevant goals, the onboarding steps, which "About you" fields are asked, and the dashboard headline/focus. `userContext(profile)` normalises any profile.
- **Existing users** (no stage) are treated as `undergraduate`, their previous behaviour.

**Stage-aware onboarding** (`components/Onboarding.jsx`):
- **Step 1** is always *"Where are you currently in your journey?"*, then activity and goal.
- **Class 10** skips the career-preference sliders (study length, coding, stability are premature at 15).
- **Class 11/12** are asked their stream.
- **UG/PG** are asked branch and year.
- **Graduates** are asked their degree field.
- **Professionals and switchers** are asked their current role.
- The interest, aptitude and trait questions are shared by all stages.

**Stage-aware interpretation** (`src/lib/stageGuidance.js` + prototype data `src/lib/careerEntry.js`). The same Career Fit score, a different "Next for you":

| Stage | Next for you |
|---|---|
| Class 10 | Which stream to take in Class 11, plus low-cost ways to explore |
| Class 11/12 | Degree options + entrance exams (and a note if their stream is not the usual route) |
| UG / PG | Skills from the career's learning track + prove them with projects (internship/placement wording for those goals) |
| Graduate | Core skills employers ask for that aren't yet *demonstrated* (Module 4 gap), else track skills |
| Professional / switcher | Transferable *demonstrated* skills (or role-based prompt), first course alongside work, transition check |

**Where it shows:** the dashboard (stage + goal + headline + focus) and each Career Matches card ("Next for you · Stage").

## 2. Action-aware financing (`src/lib/feasibility/financing.js`)

```
FINANCIAL REQUIREMENT → FUNDING MECHANISM → RESPONSIBLE PARTY → TIMING → REQUIRED ACTION → BURDEN
```

`financingPlan(cost, inputs, { relocationLevel, educationLevel })` returns:

| Field | Meaning |
|---|---|
| `status` | **funded** (paid upfront) · **financed** (gap covered by a loan the family is willing to take) · **conditional** (depends on an undecided loan or a scholarship) · **gap** (no funding source for part of it) |
| `mechanism` | `family` / `self` / `shared` / `education_loan` / `mixed` |
| `immediateGap`, `loanUsed`, `remainingGap` | Upfront shortfall, how much the loan covers, what's left uncovered (used internally; the UI stays qualitative) |
| `actions[]` | `{ id, label, party: student \| family \| student+family, requirement: required \| conditional \| optional, timing }` |
| `repayment` | `{ required, burden: low \| medium \| high, by }`, with burden = loan ÷ representative household income (thresholds 0.5 / 1.5) |
| `familyActionRequired`, `studentOnly` | Whether the path depends on the family at all |

**Actions:**

| Action | Responsible party | Timing |
|---|---|---|
| Admission | Student | Before admission |
| Upfront payment | Whoever pays (family / you / shared) | Before admission |
| Education loan | Student + family | Before admission; usually needs a parent co-applicant |
| Loan repayment | Student + family | After study |
| Scholarship application | Student | Before admission; optional, or *conditional* if needed to close a gap |
| Relocation | Student + family | Conditional |
| Postgraduate study | Student + family | Conditional |

**Rules:**
- ₹5L with ₹2L upfront and a willing loan is **financed / mixed**, not "infeasible".
- An undecided ("maybe") loan or a scholarship is **never counted as guaranteed**; it makes the plan *conditional*.

**New inputs** (Module 2 form, `feasibility_assessments`):
- `primary_funder`: family / self / shared, default `family`
- `scholarship_interest`: no / maybe / yes, default `no`

The budget question now says *upfront, without loans*.

**Feasibility integration** (`feasibility/scoring.js`):
- Each career result gets `financing` (for the career's typical, midpoint cost).
- A **high** repayment burden raises the path's risk level by one, so existing risk model + financing burden is reflected in the risk factor.
- The cost-coverage formula and the 35/20/20/10/15 weights are unchanged.
- **UI:** each feasibility card shows "How the typical pathway would be paid for": status, a plain summary and the action table.

## 3. Parent–Student Alignment consumes actions (`src/lib/alignment/engine.js`)

The financial dimension now asks *"which financing actions does this path need from the
family, and are they willing?"* instead of *"can they afford it"*:

| Plan | Score |
|---|---|
| Funded upfront (or self-funded) | 100 |
| Financed with a willing loan | 100 − burden penalty (low 0, medium 10, high 25) |
| Conditional (undecided loan / scholarship) | 60 − burden penalty |
| Gap | ≤ 50, proportional to how much is funded |

**Family actions:** `familyActions` lists each family-involving action with **support**:
- **Supported:** upfront funding they stated; a loan they're willing to take
- **Conditional:** an undecided loan; a high-burden repayment
- **Not supported:** relocation when the family prefers proximity; postgraduate study when they prefer earlier employment; an unfunded remainder
- **Unknown:** no signal

The UI shows this as "What this path needs from your family". The other dimensions, weights, categories and paths are unchanged.

## 4. Decision Engine input bundle (`src/lib/decisionInputs.js`)

`buildDecisionInputs({ profile, recs, inputs, marketById, progress })` returns:
- `context`: stage, activity, goal, stream, role
- `skills`: demonstrated, learned, points
- one entry per career with `careerFit` (Module 1), `feasibility` (+ `financing`), `alignment` (+ `familyActions`), `market` (or `null`), `skillGap`, and `stageNextSteps`

**It computes no new scores.** It's the boundary the future Decision Engine will consume.

## 5. Database

**Migration:** `supabase/migrations/20261008000000_user_context_financing.sql`, **created, not applied**. It adds the five `profiles` columns and the two `feasibility_assessments` columns, all nullable or defaulted with CHECK constraints. No new tables.

**Until it's applied,** `saveProfile` / `saveFeasibility` detect the missing columns, warn, and save without them, so nothing breaks. The new context simply isn't persisted until the migration runs.

## 6. Tests

`tests/review1.test.mjs` covers:
- the six stage contexts
- the nine financing and action cases (family-funded, loan, mixed, scholarship, viable vs no financing, family action, student-only, repayment burden)
- the four alignment cases (supported, not supported, strong fit with conflict, strong fit aligned)
- the decision-input bundle
