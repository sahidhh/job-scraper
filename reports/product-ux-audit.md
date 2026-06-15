# Product / UX Audit — Job Intelligence Platform

Scope: read-only review of the user-facing flow across the intended journey
**Upload Resume → Select Roles → Scrape Jobs → Score Jobs → Receive Notifications → View Dashboard**,
with emphasis on how the app communicates pipeline/scoring status given that
`ai_score` is currently `NULL` for (effectively) all jobs.

No code was modified. All file:line references point at the current state of the repo.

---

## Summary

The app is functionally wired end-to-end (resume → roles → dashboard → settings), and the navigation
shell (`AppShell`/`MobileNav`) makes the four sections easy to reach. However, the experience is built
around a "happy path" where scraping, scoring, and notifications all complete normally. Given the
current backend state (`ai_score` is `NULL` for ~all jobs), the user-facing surface has three
systemic problems:

1. **No persistent pipeline/system status anywhere.** There is no "last scraped: X, Y jobs scored, Z
   pending AI review" summary. The only signals are buried inline banners on the dashboard and a
   manually-triggered GitHub Actions link in Settings.
2. **Ambiguous/alarming microcopy when AI scoring hasn't run.** The row-expansion fallback
   "No AI reasoning available yet." (`src/components/dashboard/JobRow.tsx:50`) reads like an error or
   missing-data condition rather than "scoring is pending," and it will be shown for **every job, every
   time it's expanded**, since `ai_score`/`ai_reasoning` are null platform-wide right now.
3. **No "what happens next" guidance after completing a step.** Resume upload, role confirmation, and
   the Settings "trigger a scrape" instructions all complete without telling the user when/whether to
   check the Dashboard, how long scoring takes, or what a "good" score looks like.

The single most user-visible issue tied to the backend `ai_score = NULL` state is the dashboard's
"Jobs have been scraped but not scored yet" banner (`src/app/(protected)/dashboard/page.tsx:97`) —
this is actually a reasonably good message, but it can become **stale/misleading** because it's an
all-or-nothing check (`jobs.every((job) => job.aiScore === null)`): the moment even ONE job gets an
`ai_score`, the banner disappears for the whole table even though most other jobs are still
`ai_score: null` and will silently fall back to keyword score with no per-row indication.

---

## Journey Map

### Step 0 — Entry point (`/`, `/login`)

- **File:** `src/app/page.tsx`
  - Root route is a server-side `redirect("/dashboard")` (`src/app/page.tsx:4`). No landing/marketing
    page, no onboarding.
- **File:** `src/app/(auth)/login/page.tsx`
  - Title: "Sign in", description: "Job Intelligence Platform" (lines 9-10). Delegates to
    `LoginForm`. No explanation of what the product does or what to do after signing in.
- **What's missing:** A first-time user who signs in lands directly on `/dashboard` (via the
  `(protected)` layout → redirect from `/`). If they have no resume, no role selection, and no jobs,
  the dashboard gives a single line of guidance (see Step 3) but there's no onboarding checklist
  ("1. Upload resume → 2. Select roles → 3. Wait for scrape/score → 4. View matches").

---

### Step 1 — Resume Upload (`/resume`)

- **File:** `src/app/(protected)/resume/page.tsx`
  - Heading: "Resume" / "Upload your resume to extract skills used for job scoring." (lines 15-18)
  - Renders `ResumeUploadCard`, and conditionally a "Skills" card if a resume already exists
    (lines 21-33).
- **File:** `src/components/resume/ResumeUploadCard.tsx`
  - Card title "Resume", description "Upload a PDF resume to extract skills for job scoring."
    (lines 32-33).
  - Upload button shows "Uploading..." while pending, "Upload" otherwise (line 42).
  - On success, the form just resets (`formRef.current?.reset()`, line 22) — **no success message,
    no confirmation toast, no indication that skills were extracted** or where to see them.
  - On error, shows `result.error` in red text (line 45) — generic error surface, fine.
- **File:** `src/components/resume/SkillsEditor.tsx`
  - Only rendered if `resume` exists (i.e., after at least one successful upload + page reload).
  - If `items.length === 0`: "No skills extracted yet." (line 47) — reasonable, but doesn't explain
    *why* (e.g., parsing failed vs. resume has no recognizable skills vs. dictionary mismatch).
  - Allows manual add/remove of skills with inline error text (line 79).

**What's confusing / missing:**
- After uploading, the page does not auto-refresh/re-render to show the new Skills card — the user
  must reload or navigate away and back (the success path only resets the form, it doesn't trigger
  a server-data refresh of `resume`). A first-time user has no on-screen confirmation that the
  upload "worked" beyond the button reverting to "Upload".
- No link/CTA from this page to "Next step: select roles" — the user must know to click "Roles" in
  the nav themselves.
- No indication of *what* skills extraction is used for beyond the one-line description (e.g., "these
  skills drive your keyword + AI match score").

---

### Step 2 — Role Selection (`/roles`)

- **File:** `src/app/(protected)/roles/page.tsx`
  - Heading: "Role selection" / "Enter a primary role to see related roles, then confirm to set the
    active selection used for scoring." (lines 13-16). This description is actually decent — it tells
    the user the goal.
- **File:** `src/components/roles/RoleSelectorForm.tsx`
  - User types a role, clicks "Expand" (button label toggles to "Expanding..." while pending, line 81).
  - On success, shows `ExpandedRolesCard` with toggleable related-role badges.
  - On confirm, success state shows:
    > "Saved! This is now your active role selection." (line 98)
    > with a button "View matching jobs →" linking to `/dashboard` (lines 99-101).
  - This is one of the **better** transition messages in the app — it both confirms success and gives
    a clear next action.
- **File:** `src/components/roles/ExpandedRolesCard.tsx`
  - Description: "{From the saved role map. | Generated by AI for this role.} Click a role to include
    or exclude it from your selection." (lines 29-32) — clear.
  - Confirm button: "Active selection" / "Saving..." / "Use this selection" (line 58) — clear
    tri-state.

**What's confusing / missing:**
- No mention of *when* this role selection will start affecting the dashboard (i.e., that it depends
  on the next scrape+score run, which happens via an external GitHub Actions pipeline). A user who
  clicks "View matching jobs →" immediately after confirming will likely land on an empty or
  "not scored yet" dashboard with no link back explaining *why* it's empty (see Step 3).
- If `expandRoleAction` fails (line 42: `setError(result.error)`), the error is shown but there's no
  guidance on retry or what a transient vs. permanent failure looks like (this calls an AI role
  expansion provider, which can fail).

---

### Step 3 — Dashboard (`/dashboard`)

- **File:** `src/app/(protected)/dashboard/page.tsx`
  - Header subtitle is conditional (lines 47-51):
    - No active role selection: **"Set up a role selection to see matching jobs."** + a "Choose a
      role" button linking to `/roles` (lines 57-59). Good, clear CTA.
    - Active role selection: `Showing matches for "{primaryRole}".` — purely descriptive, no pipeline
      status.
  - `DashboardJobs` (lines 65-104) renders, in order:
    1. **Companies empty-state** (lines 79-88): "No companies configured yet — add some in Settings
       so the scraper has somewhere to look." + "Go to Settings →" button. Good, actionable.
    2. **Jobs empty-state** (lines 89-99), with three mutually exclusive branches:
       - `jobs.length === 0 && scrapeRuns.length === 0`:
         > "No jobs scraped yet. The scrape pipeline runs via GitHub Actions — see Settings for
         > details." (line 92)
       - `jobs.length === 0 && scrapeRuns.length > 0`:
         > "No matching jobs yet for this role selection. Jobs are added by the next scheduled scrape
         > run." (line 93)
       - `jobs.length > 0 && jobs.every((job) => job.aiScore === null)`:
         > "Jobs have been scraped but not scored yet. Scoring runs automatically after each scrape."
         > (line 97)
    3. `FilterBar` + `JobsTable` always render below these banners (even when the "no jobs" banner is
       shown, `FilterBar`/`JobsTable` still render with an empty table — see `JobsTable.tsx:22-28`,
       "No jobs match the current filters.").

**This is the most important screen for the current backend issue.** Given `ai_score` is `NULL` for
~all jobs:

- If a role selection has matching jobs at all, branch 3 fires: **"Jobs have been scraped but not
  scored yet. Scoring runs automatically after each scrape."** This is actually a *reasonable*,
  non-alarming message — it correctly frames the situation as pending, not broken, and doesn't blame
  the user.
- **However**, this banner uses `jobs.every(...)` (line 95) — an **all-or-nothing** condition. The
  moment a single job in the result set gets `ai_score` set (e.g., a partial backend fix, or a job that
  happens to get scored), this banner disappears entirely, even though the vast majority of jobs are
  still `ai_score: null`. At that point the user sees a plain table with mixed scored/unscored rows and
  no banner — i.e., **the most likely real-world state (partially scored) has zero status messaging**.
- There is **no overall pipeline status** anywhere on this page: no "last scraped: <timestamp>", no "X
  of Y jobs scored", no link to the scrape-run history. The user has to go to Settings to find
  `ScrapeRunsList` to learn anything about when scraping last ran.
- `FilterBar` (`src/components/dashboard/FilterBar.tsx`) includes a "Min AI score" numeric filter
  (lines 52-61, placeholder "Min AI score", range 0–1). If a user enters any value here while
  `ai_score` is null for all jobs, `findForDashboard`'s `minAiScore` filter
  (`src/features/jobs/infrastructure/SupabaseJobRepository.ts:193-196`) does
  `mapped.filter((job) => job.aiScore !== null && job.aiScore >= threshold)` — **this returns zero
  jobs**, and the resulting empty table just shows `JobsTable`'s generic "No jobs match the current
  filters." (`JobsTable.tsx:25`). A user experimenting with this filter would reasonably conclude
  "there are no good matches" rather than "AI scoring hasn't run yet, so this filter can't work."

---

### Step 3b — Job Row detail (`JobsTable` / `JobRow`)

- **File:** `src/components/dashboard/JobsTable.tsx`
  - Columns: Title, Company, Location, Source, Score, Link (lines 10-15).
  - Empty state: "No jobs match the current filters." (line 25).
- **File:** `src/components/dashboard/JobRow.tsx`
  - `formatScore` (lines 9-11):
    ```ts
    function formatScore(score: number | null): string {
      return score === null ? "—" : `${Math.round(score * 100)}%`;
    }
    ```
  - Score cell (line 40): `formatScore(job.aiScore ?? job.keywordScore)`.
    - If `aiScore` is non-null, shows AI score as a percentage.
    - If `aiScore` is null but `keywordScore` is non-null, **silently falls back to the keyword score
      percentage** — with no label distinguishing "AI score" from "keyword score". A user sees, e.g.,
      "60%" with no way to know whether that's an AI judgment or a simple keyword match ratio.
    - If both are null, shows "—" (an em dash, no tooltip/explanation).
  - Expandable detail row (lines 47-53): clicking the title chevron toggles a row showing
    `job.aiReasoning ?? "No AI reasoning available yet."` (line 50).

---

### Step 4 — Settings (`/settings`)

- **File:** `src/app/(protected)/settings/page.tsx`
  - Heading: "Settings" / "Manage companies, scrape history, and scoring thresholds." (lines 32-33).
  - **Companies card** (lines 36-48): table + "Add company" dialog. Empty state: "No companies yet."
    (`CompaniesTable.tsx:47`).
  - **ThresholdsCard** (`src/components/settings/ThresholdsCard.tsx`):
    - Title "Scoring thresholds", description "Configured via environment variables (scoring.md §5)."
      (lines 12-13).
    - Shows `KEYWORD_THRESHOLD` and `NOTIFY_THRESHOLD` values read-only (lines 16-23). References an
      internal doc (`scoring.md §5`) that an end user has no access to/context for.
  - **"Recent scrape runs" card** (lines 52-72):
    - Static info box (lines 57-69):
      > "The scrape → score → notify pipeline runs via GitHub Actions, not from this app. Trigger it
      > manually from the repository's Actions tab (workflow_dispatch)."
      with an external link to `https://github.com/sahidhh/job-scraper/actions`.
    - This is the **only place in the UI** that explains how the pipeline is triggered, and it
      requires the end user to have GitHub repo access and understand `workflow_dispatch` — this is
      developer-facing language in a user-facing settings screen.
    - `ScrapeRunsList` (`src/components/settings/ScrapeRunsList.tsx`) shows a table: Source, Status
      (`success`/`partial`/`failed` badges), Jobs found, Run at, Error. Empty state: "No scrape runs
      yet." (line 38). This table shows **scrape** status only — there's no equivalent "scoring run"
      status table, so a user cannot tell from the UI whether/when the scoring stage ran or failed for
      a given scrape run.
  - **"Recent notifications" card** (lines 74-81):
    - `NotificationsLogList` (`src/components/settings/NotificationsLogList.tsx`): table of
      Job/Company/Source/Sent at. Empty state: "No notifications sent yet." (line 31).
    - Given notifications are blocked by `ai_score IS NULL` (per
      `src/features/notifications/domain/NotificationRepository.ts:5-7`,
      "ai_score IS NULL never qualifies"), this list will be **permanently empty** under the current
      backend state, and "No notifications sent yet." gives no indication that this is *expected*
      right now (vs. "notifications are configured but nothing has matched yet").

---

### Navigation / Wayfinding

- **File:** `src/components/layout/AppShell.tsx` and `src/components/layout/MobileNav.tsx`
  - Both render the same `NAV_ITEMS` (`src/components/layout/navItems.ts:3-8`): Dashboard, Roles,
    Resume, Settings — in that order.
  - The nav order (Dashboard first) doesn't match the intended onboarding journey (Resume → Roles →
    Dashboard → Settings). A brand-new user lands on Dashboard first (per the root redirect), sees
    minimal guidance, and must self-discover that Resume/Roles need to be set up first via the
    "Set up a role selection..." prompt (dashboard) — but there's no analogous prompt nudging them to
    Resume first.
  - There is no visual indicator anywhere (badge, progress bar, checklist) of onboarding completeness
    — e.g., "Resume: ✅ uploaded", "Roles: ⚠ not selected", "Jobs: pending scoring".

---

## "No AI reasoning available yet." Deep Dive

> Note: the brief referenced the phrase "No AI response available yet" — the actual string in the
> codebase is **"No AI reasoning available yet."** (singular location, verified via repo-wide grep for
> `aiReasoning`/`ai_score`/"No AI").

### Exact location

- **File:** `src/components/dashboard/JobRow.tsx`
- **Line 50:**
  ```tsx
  {job.aiReasoning ?? "No AI reasoning available yet."}
  ```
- This sits inside the expandable detail row (lines 47-53), which only renders when the user clicks
  the chevron/title button on a job row (`open` state toggled at line 22).

### Exact trigger condition

- `job.aiReasoning` is `null`. Tracing the data flow:
  - `JobWithScore.aiReasoning: string | null` (`src/features/jobs/domain/types.ts:52`).
  - Populated in `toJobWithScore`: `aiReasoning: score?.ai_reasoning ?? null`
    (`src/features/jobs/infrastructure/SupabaseJobRepository.ts:40`).
  - `ai_reasoning` is a column on `job_scores`, set only when stage-2 AI scoring succeeds
    (`src/features/scoring/application/scoreJob.ts:33-40`: `aiReasoning` stays `null` unless the
    `aiScoreProvider.score()` call returns a non-null result).
  - **Net condition:** `job_scores.ai_reasoning IS NULL`, which is true whenever
    `job_scores.ai_score IS NULL` (they're set together — see `scoreJob.ts:39-40` and
    `SupabaseScoreRepository.ts:15-16`), AND also true if there is no `job_scores` row at all for that
    `(job, role_selection)` pair (left join → `score` is `undefined` → `?? null`).
  - So: **"No AI reasoning available yet." appears whenever `ai_score`/`ai_reasoning` are null for that
    job+role-selection** — i.e., stage-2 AI scoring never ran, is still pending, or failed/returned
    null (the AI provider "never throws" per `OpenRouterAiScoreProvider.ts:41-43`, it just leaves
    `aiScore`/`aiReasoning` null on failure).

### Frequency given current backend state

- Since `ai_score` is currently `NULL` for ~all jobs platform-wide, **every job row, when expanded,
  will show "No AI reasoning available yet."** — i.e., 100% of expand interactions hit this fallback
  right now. There is no job in the current state that would show real AI reasoning text.
- Combined with the Score column (`formatScore(job.aiScore ?? job.keywordScore)`,
  `JobRow.tsx:40`), which falls back to `keywordScore` (a real, non-null number for matched jobs),
  users will see a **non-"—" percentage in the Score column** (the keyword score) but then expand the
  row and see **"No AI reasoning available yet."** — a confusing mismatch: "there's a score, but no
  explanation for it."

### Is the wording confusing/alarming/misleading?

- **Not alarming** (no error styling, no red text, no icon implying failure) — that's good.
- **But misleading/confusing** in two ways:
  1. **"yet"** implies imminent arrival ("it'll be here soon"), but for a user with no visibility into
     the backend, there's no way to know if "yet" means "in the next few minutes" or "indefinitely,
     because of an unresolved upstream issue." Given the backend issue is currently blocking, "yet"
     overpromises.
  2. It reads as **per-job missing data** ("this job doesn't have AI reasoning"), when the actual
     situation is **platform-wide pipeline state** ("AI scoring hasn't completed for any job"). A
     per-row message can't communicate a systemic/global condition, so each user discovers the
     "problem" independently, job-by-job, with no way to learn it's universal.
  3. There's no visual differentiation between "AI scoring is pending" vs. "AI scoring ran but found
     nothing noteworthy to say" vs. "AI scoring failed for this specific job" — all three collapse to
     the same string.

### Recommendation (concrete)

1. **Reword the per-row fallback** to something that (a) doesn't imply imminent completion when it may
   not be, and (b) signals "pending/in-progress" rather than "missing":
   - Replace `"No AI reasoning available yet."` with **`"AI review pending for this job."`** or
     **`"Pending AI review — keyword match score shown above."`** — the latter explicitly ties back to
     the visible score so the user understands *what* number they're looking at.
2. **Differentiate the Score column** when falling back to keyword score. Currently
   `formatScore(job.aiScore ?? job.keywordScore)` (`JobRow.tsx:40`) renders an unlabeled percentage
   regardless of which score is shown. Recommend:
   - When `aiScore === null` and `keywordScore !== null`, render something like
     `"60% (keyword match)"` or add a small badge/icon (e.g., a muted "KW" badge vs. an "AI" badge)
     next to the percentage, so users immediately understand the score's provenance and don't mistake
     a keyword match for an AI judgment.
3. **Surface pipeline status at the dashboard level**, not just per-row (see Dashboard
   Recommendations below) — e.g., a banner stating "AI scoring is pending for N of M jobs" makes the
   per-row "Pending AI review" message contextualized rather than mysterious.
4. If hiding is preferred over rewording: only render the expandable detail row's content area when
   there's *something* to show (either `aiReasoning` or a non-null `keywordScore` breakdown) — but
   outright hiding the row removes the (already weak) signal that the row is interactive/expandable,
   so a rewording approach is preferable to hiding entirely.

---

## Recommendations (prioritized)

1. **(High) Add a dashboard-level pipeline status summary.** Above or alongside the existing banners
   in `src/app/(protected)/dashboard/page.tsx` (around lines 89-99), add a persistent status line such
   as: "Last scrape: {scrapeRuns[0].runAt} • {jobs.length} jobs matched • {countWithAiScore} scored by
   AI • {countNull} pending AI review." This requires no new data sources beyond what's already fetched
   (`jobs`, `scrapeRuns` are already loaded in `DashboardJobs`, lines 71-75) — it's a presentation
   change using existing data.

2. **(High) Fix the all-or-nothing "not scored yet" banner condition.** `jobs.every((job) =>
   job.aiScore === null)` (`dashboard/page.tsx:95`) should be replaced with a count-based message that
   works for partial states too, e.g., "N of M jobs are pending AI review" shown whenever `N > 0`,
   independent of whether `N === M`.

3. **(High) Reword "No AI reasoning available yet."** (`JobRow.tsx:50`) per the Deep Dive
   recommendation above — avoid "yet" framing, and tie the message back to the visible keyword-based
   score so users understand what they're looking at.

4. **(Medium) Label the Score column's source (AI vs. keyword).** `formatScore(job.aiScore ??
   job.keywordScore)` (`JobRow.tsx:40`) currently produces an ambiguous percentage. Add a visible
   "AI" / "Keyword" badge or suffix so users can calibrate trust in the number.

5. **(Medium) Make the "Min AI score" filter aware of pending AI scoring.** When `filters.minAiScore`
   is set and `findForDashboard` returns zero rows because all `aiScore` values are null
   (`SupabaseJobRepository.ts:193-196`), the dashboard should distinguish "no jobs meet this AI score
   threshold yet because AI scoring hasn't run" from "no jobs are good matches." Consider disabling/
   hiding the "Min AI score" filter (or showing a tooltip) when zero jobs in the current result set
   have a non-null `aiScore`.

6. **(Medium) Add a post-action confirmation + "what's next" on Resume upload.** After a successful
   upload (`ResumeUploadCard.tsx:21-22`), show an inline success message (e.g., "Resume uploaded —
   skills extracted below.") and consider auto-revalidating so the `SkillsEditor` card appears without
   a manual page reload. Add a "Next: select your target roles →" link to `/roles`.

7. **(Medium) Add an onboarding/status checklist for first-time users.** Since the dashboard already
   special-cases "no role selection" (lines 48-51, 57-59), extend this to a small checklist
   (Resume uploaded? Roles selected? Jobs scraped? Jobs scored?) so new users have a single place to
   see what's done and what's next, rather than discovering steps by clicking through nav items.

8. **(Low) Soften/translate the "Recent notifications: No notifications sent yet."** message
   (`NotificationsLogList.tsx:30-31`) when AI scoring is globally pending — e.g., append a note like
   "Notifications require AI-scored jobs above the notify threshold; none are scored yet." so the
   empty state isn't mistaken for "notifications aren't configured" or "nothing matched."

9. **(Low) De-jargon the Settings pipeline-trigger explanation.** The "Recent scrape runs" card
   (`settings/page.tsx:57-69`) references `workflow_dispatch` and links directly to the GitHub Actions
   tab — appropriate for a developer/admin user, but if non-technical users reach Settings, consider a
   plainer one-line summary ("Scraping and scoring run automatically on a schedule; an admin can also
   trigger them manually.") with the GitHub link as secondary/optional detail.

10. **(Low) Add a "scoring run" status alongside "scrape run" status in Settings.** `ScrapeRunsList`
    (`ScrapeRunsList.tsx`) only reflects scrape status (`success`/`partial`/`failed`). There's no
    equivalent visibility into whether the scoring stage ran/failed for a given scrape — useful for
    diagnosing exactly the kind of "ai_score stuck null" situation this audit is reviewing, without
    requiring backend/log access.

---

## File Reference Index

| Area | File | Key lines |
|---|---|---|
| Entry redirect | `src/app/page.tsx` | 4 |
| Login | `src/app/(auth)/login/page.tsx` | 9-10 |
| Protected layout | `src/app/(protected)/layout.tsx` | 6-15 |
| Nav shell | `src/components/layout/AppShell.tsx` | 11-29 |
| Mobile nav | `src/components/layout/MobileNav.tsx` | 25-34 |
| Nav items | `src/components/layout/navItems.ts` | 3-8 |
| Resume page | `src/app/(protected)/resume/page.tsx` | 15-33 |
| Resume upload | `src/components/resume/ResumeUploadCard.tsx` | 21-26, 32-33, 41-45 |
| Skills editor | `src/components/resume/SkillsEditor.tsx` | 47, 79 |
| Roles page | `src/app/(protected)/roles/page.tsx` | 13-16 |
| Role selector form | `src/components/roles/RoleSelectorForm.tsx` | 81, 98-101 |
| Expanded roles card | `src/components/roles/ExpandedRolesCard.tsx` | 29-32, 58 |
| Dashboard page | `src/app/(protected)/dashboard/page.tsx` | 47-51, 79-99 |
| Jobs table | `src/components/dashboard/JobsTable.tsx` | 10-15, 25 |
| Job row (score + reasoning) | `src/components/dashboard/JobRow.tsx` | 9-11, 40, 47-53 |
| Filter bar | `src/components/dashboard/FilterBar.tsx` | 52-61 |
| Settings page | `src/app/(protected)/settings/page.tsx` | 32-33, 57-69 |
| Thresholds card | `src/components/settings/ThresholdsCard.tsx` | 12-13, 16-23 |
| Notifications log | `src/components/settings/NotificationsLogList.tsx` | 30-31 |
| Scrape runs list | `src/components/settings/ScrapeRunsList.tsx` | 38 |
| Companies table | `src/components/settings/CompaniesTable.tsx` | 47 |
| Job repository (score join) | `src/features/jobs/infrastructure/SupabaseJobRepository.ts` | 34-42, 171-198 |
| Notification gating on ai_score | `src/features/notifications/domain/NotificationRepository.ts` | 5-7 |
| Scoring (ai null on failure) | `src/features/scoring/application/scoreJob.ts` | 33-40 |
