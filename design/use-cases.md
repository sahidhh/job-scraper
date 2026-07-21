# Use Cases

## 1. Actors

| Actor | Description |
|---|---|
| **User** | The single authenticated human operator of the platform |
| **Cron (GitHub Actions)** | Automated scheduler that runs scrape/score/notify pipelines |
| **ATS Board API** | External Greenhouse / Lever / Ashby job board APIs |
| **Public Job Board** | Wellfound feed, RemoteOK RSS, Remotive API, Himalayas API, MyCareersFuture API |
| **OpenRouter** | LLM gateway for role expansion and AI job scoring |
| **Telegram Bot API** | Notification delivery service |
| **Operator** | Person running the validate-sources script manually or via `workflow_dispatch` |

---

## 2. Use Case Catalogue

### UC-01 — Log In

**Actor:** User  
**Trigger:** User navigates to the app  
**Precondition:** User account exists in Supabase Auth  
**Main Flow:**
1. User opens `/login`
2. Enters email and password
3. Supabase Auth validates credentials and sets session cookies
4. Middleware redirects to `/dashboard`

**Alternate Flow:** Invalid credentials → error message, stays on `/login`

---

### UC-02 — View Job Dashboard

**Actor:** User  
**Trigger:** User navigates to `/dashboard`  
**Precondition:** Authenticated; at least one scrape run completed  
**Main Flow:**
1. Page fetches jobs joined with scores (active role_selection) and job_state
2. Jobs displayed in table sorted by overall_score descending (ai_score + configurable ranking
   bonuses, see UC-06b), then posted_at descending as tiebreaker
3. User can filter by location, source, status, min/max score, max experience, a free-text
   search over title/company, a "remote only" toggle (jobs tagged `remote`), and two toggles that
   are **on by default**: "can apply" (hides a non-null `ineligible_reason`, AD-50) and "good match"
   (hides jobs below `KEYWORD_THRESHOLD`, AD-51); muted companies, employment types, and keywords
   (UC-13) are always excluded
4. A stats row reports the filtered set's breakdown (AI-scored / low match / queued for AI / gave up
   after repeated AI failures), computed from the same rows the table renders so the numbers always
   reconcile. Only "queued" costs tokens on subsequent runs
5. Pagination loads next page on demand

**Postcondition:** User sees paginated, filtered job list with scores, ranking-bonus reasons, and statuses

---

### UC-03 — Change Job Status

**Actor:** User  
**Trigger:** User selects a status from the job row dropdown  
**Precondition:** Authenticated; at least one job_status row exists  
**Main Flow:**
1. User clicks status selector on a job row
2. `setJobStatusAction(jobId, statusId)` called
3. Upserts job_state row
4. Dashboard refreshes (revalidatePath)

**Alternate Flow:** Bulk status — user selects multiple rows → bulk action sets same status for all

---

### UC-04 — Upload Resume

**Actor:** User  
**Trigger:** User navigates to `/resume` and uploads a PDF or DOCX  
**Main Flow:**
1. User selects a PDF or DOCX file
2. `uploadResumeAction` receives the file, computes its sha256 content hash, and uploads it to Storage at `<hash>.<pdf|docx>`
3. If a resume with the same content_hash already exists, its cached parsed text is reused (decisions.md AD-30); otherwise pdfjs-dist (PDF) or mammoth (DOCX, including table cells) extracts full text
4. Skills matched against skills-dictionary
5. `set_active_resume` RPC atomically saves new resume (with content_hash) and deactivates previous
6. Extracted skills displayed; user can manually edit

**Alternate Flow:** Parse fails, or extracted text is empty/near-empty (e.g. a scanned PDF) → error message shown; no resume row created

---

### UC-05 — Edit Resume Skills

**Actor:** User  
**Trigger:** User edits skills on `/resume`  
**Precondition:** Active resume exists  
**Main Flow:**
1. User adds or removes skills from the list
2. `updateSkillsAction(skills[])` called
3. `resumes.skills` updated for the active resume
4. Scoring on next cron run uses updated skills

---

### UC-05a — Get and Apply AI Resume Suggestions (decisions.md AD-32/AD-33)

**Actor:** User  
**Trigger:** `suggestResumeImprovementsAction(targetRole)` (no UI wired up yet — `design/limitations.md` §2.5)  
**Precondition:** Active resume exists  
**Main Flow:**
1. Active resume's `parsedText` is chunked (not truncated — jobhunt bug #2) and each chunk is sent to the configured LLM (`LLM_PROVIDER`: `openrouter` default, same key as job scoring, decisions.md AD-42; `gemini`/`anthropic` direct optional) asking for concrete, non-fabricated improvement suggestions
2. Suggestions from every chunk are merged, ids renumbered, and persisted as one new `resume_suggestions` row scoped to the exact resume version they were generated against
3. User reviews suggestions and chooses a subset, then calls `applyResumeSuggestionsAction(suggestionSetId, chosenIds)`
4. The chosen suggestions are applied to each chunk of the resume text by the LLM (never fabricating experience) and the rewritten chunks are concatenated
5. A brand NEW resume version is created via the existing `set_active_resume` path (`content_hash = null` — no backing uploaded file) — the prior version's text is never overwritten
6. The suggestion set is marked applied, pointing at the new resume version

**Alternate Flow:** The suggestion set doesn't exist, was generated against a resume version that has since been superseded, no suggestions were chosen, or the LLM call fails → error returned, no resume version created

---

### UC-06 — Set Target Role

**Actor:** User  
**Trigger:** User navigates to `/roles` and enters a role  
**Main Flow:**
1. User types primary_role (e.g., "Backend Engineer")
2. `expandRoleAction(primaryRole)` called
3. Check role_expansion_map cache (seeded + AI-generated entries)
4. **Cache hit:** return expanded_roles
5. **Cache miss:** call OpenRouter → generate related roles → cache in role_expansion_map
6. `setActiveRoleSelectionAction` atomically creates new role_selection, deactivates previous

**Postcondition:** New role_selection is active; next scrape/score run uses expanded_roles

---

### UC-06a — Select Role Pack

**Actor:** User  
**Trigger:** User navigates to `/roles` and clicks a Role Pack  
**Precondition:** Authenticated; role packs seeded in database  
**Main Flow:**
1. Page loads available packs from `role_packs` + `role_pack_roles`
2. User clicks "Use pack" on a pack card
3. `activateRolePackAction(packId)` called
4. Pack's roles loaded from `role_pack_roles` (sorted by `sort_order`)
5. `set_active_role_selection` RPC atomically creates new role_selection, deactivates previous
6. Dashboard and `/roles` revalidated

**Postcondition:** New role_selection is active with pack name as primary_role and pack roles as expanded_roles; scrape/score/notify pipelines unaffected

**Alternate Flow:** User still able to expand and confirm a custom role via UC-06 (both flows coexist)

---

### UC-06b — Configure Ranking Preferences

**Actor:** User
**Trigger:** User navigates to `/settings` → Ranking
**Main Flow:**
1. User lists preferred companies, toggles "prefer remote", and/or adjusts bonus amounts
2. `setRankingPreferencesAction(prefs)` called; stored as JSON in `app_settings` under `ranking_preferences`
3. Next `score.ts` run computes `overall_score = ai_score + bonuses` per job (`computeOverallScore.ts`) and dashboard sorts by it

**Alternate Flow (clear):** `setRankingPreferencesAction(null)` removes the row; ranking reverts to aiScore-only (bonuses default to zero)

**Postcondition:** Jobs from preferred companies, remote postings (if preferred), and jobs with a disclosed salary rank slightly higher; the dashboard shows why next to the score

---

### UC-07 — Configure Company Board Tokens

**Actor:** User  
**Trigger:** User navigates to `/settings` → Company Config  
**Main Flow:**
1. User enters company name, selects source (greenhouse/lever/ashby), enters board_token
2. `setCompanyAction` upserts the company row
3. Company now included in next scrape run

**Alternate Flow (delete):** User clicks delete → `deleteCompanyAction` sets `active = false`; company excluded from future scrapes

---

### UC-08 — View Analytics

**Actor:** User  
**Trigger:** User navigates to `/analytics`  
**Main Flow:**
1. Page calls analytics compute functions (read-only, no external calls)
2. Displays: jobs over time (line chart), jobs by source (bar chart), score histogram, status breakdown (pie)

---

### UC-09 — View Skill Insights

**Actor:** User  
**Trigger:** User navigates to `/insights`  
**Main Flow:**
1. `computeSkillGaps()` — skills present in matched jobs but missing from resume
2. `computeSkillDemand()` — most-requested skills across all matched jobs
3. Charts displayed for both

---

### UC-10 — Automated Job Scrape

**Actor:** Cron  
**Trigger:** GitHub Actions cron (every 2 hours) or `workflow_dispatch`  
**Main Flow:**
1. For each active company (greenhouse/lever/ashby): fetch postings via ATS board API
2. Fetch from Wellfound, RemoteOK, MyCareersFuture
3. Normalize all to `RawJob[]`
4. Apply role keyword filter (expanded_roles of active role_selection, if any)
5. `tagLocations()` infers location_tags from location_raw
6. Drop jobs with empty location_tags
7. For each job not already known by (source, source_job_id): compute its fingerprint and check it against existing jobs from any source; a match is recorded to `job_duplicates` and skipped instead of inserted (AD-16)
8. Upsert the rest to `jobs` (dedup on source + source_job_id)
9. Log each source's result, including duplicates skipped, to `scrape_runs`

---

### UC-11 — Automated Job Scoring

**Actor:** Cron  
**Trigger:** Immediately after UC-10 in the same GitHub Actions job  
**Main Flow:**
1. Load active resume and active role_selection
2. Query: jobs matching expanded_roles without a score for active role_selection
3. For each job:
   a. `computeKeywordScore(resume.skills, job description + title)`
   b. If score ≥ KEYWORD_THRESHOLD: check eligibility -- the verdict stored at ingest
      (`jobs.ineligible_reason`, AD-50), falling back to `classifyEligibility(job)` for rows
      predating that column. Hard-excludes a remote job geo-locked to a region the candidate
      fails, or an onsite job with an explicit no-sponsorship/authorization signal (candidate
      needs sponsorship for any onsite role); an eligible job then gets the OpenRouter AI score
      call (15s timeout, 1 retry), whose system prompt carries the candidate's constraints
      (location/sponsorship, experience, primary/secondary stack) so seniority/stack mismatches
      and sponsorship-silent onsite postings score below "strong"
   c. Upsert `job_scores` row
4. AI failures and hard-excluded jobs both leave `ai_score = null`; AI failures are retried on the
   next cron run, hard-excluded jobs are not -- step 2's query filters on `ineligible_reason IS NULL`,
   so they never re-enter the queue at all (before AD-50 they were re-fetched and re-written forever)
5. An AI failure is retried at most `MAX_AI_RETRIES` times (default 3, AD-51): each retry is a real
   paid API call -- the only skip reason that is -- so `retry_count >= MAX_AI_RETRIES` joins the
   done-set and the job is reported as "gave up" rather than retried indefinitely

---

### UC-12 — Automated Notifications

**Actor:** Cron  
**Trigger:** Immediately after UC-11 in the same GitHub Actions job  
**Main Flow:**
1. Load notification preferences from `app_settings` (optional; absent = notify all)
2. Query: jobs where `ai_score >= NOTIFY_THRESHOLD` AND no row in `notifications_log`
3. Apply notification preferences filter (include: role, skill, location, experience, source; exclude: blocked companies, excluded employment types, muted keywords) if set
4. For each passing match (isolated):
   a. Format Telegram HTML message (title, company, location, source, URL, AI reasoning), including "why this job" highlight badges (remote, urgent hiring, salary range, employment type) derived from `extractJobAttributes.ts`/`extractSalary.ts`
   b. POST to Telegram Bot API
   c. On success: upsert `notifications_log` row (prevents re-send)
5. Per-match failure is logged; does not block remaining matches

**Note:** Filtered-out jobs are NOT marked notified; they re-evaluate on future runs.

---

### UC-13 — Configure Notification Preferences

**Actor:** User  
**Trigger:** User edits the "Notification filters" card on `/settings/notifications`  
**Main Flow:**
1. User edits comma-separated fields (roles, skills, locations, sources, blocked companies, excluded employment types, muted keywords) and min/max experience
2. Client validates enum fields (locations/sources/employment types) against the known vocab before submitting
3. `setNotificationPreferencesAction(prefs)` validates the shape server-side (`validateNotificationPreferences`) and upserts
4. Preferences stored as JSON in `app_settings` under key `notification_preferences`
5. Next notify cron run applies filters before sending; `blockedCompanies`/`excludeEmploymentTypes`/`excludeKeywords` are also applied to the dashboard job list (UC-02) via the same stored setting

**Alternate Flow (clear):** Clearing every field and saving calls `setNotificationPreferencesAction(null)`, which removes the row; cron reverts to notify-all and the dashboard stops muting any companies/employment types/keywords

---

### UC-14 — Validate ATS Board Tokens

**Actor:** Operator (User or GitHub Actions `workflow_dispatch`)
**Trigger:** Manual run of `npm run validate-sources` or the `validate-sources.yml` workflow
**Precondition:** At least one active company with a board_token is configured
**Main Flow:**
1. Script loads all active companies via `SupabaseCompanyRepository.listActive()`
2. `validateSources()` maps each company to its matching `SourceValidator`
3. Boards are probed concurrently via `probeBoard()` (GET, 10s timeout, no retry)
4. Results are grouped by source and printed with status icons and HTTP codes
5. Summary counts are printed; exit code 1 if any boards are broken

**Postcondition:** Operator sees which board tokens are healthy and which need to be removed or updated

**Alternate Flow:** No companies configured → script reports "0 boards" and exits cleanly

---

### UC-15 — View Source Quality Analytics

**Actor:** Operator  
**Trigger:** Manual run of `npx tsx scripts/source-analytics.ts`  
**Precondition:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the environment  
**Main Flow:**
1. Script queries `scrape_runs` for the last 30 days
2. Computes per-source metrics: runs, found, kept, keep rate, inserted, updated, 30-day average found per run
3. Prints a formatted table to stdout
4. Flags low performers (keep rate < 10% or avg found < 5)
5. Exits with code 0

**Postcondition:** Operator sees which sources are producing usable jobs and which are underperforming

**Alternate Flow:** No scrape runs in the last 30 days → prints "No data available" and exits 0

---

### UC-16 — Run Production Verification

**Actor:** Operator (User or GitHub Actions `workflow_dispatch`)
**Trigger:** Manual run of `npm run verify:production` / `npm run diagnostics`, or the `verify-production.yml` workflow
**Precondition:** None — every check degrades to a `warning` rather than throwing when its required credentials/data are unavailable
**Main Flow:**
1. Script attempts to build a Supabase service client (falls back to `null` if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset)
2. Builds 26 checks across four categories (infrastructure, application, external services, data quality) — reusing `getSourceHealthReport`/`getScoringQueueReport` rather than re-deriving their logic
3. `runChecks()` executes them sequentially, timing each and catching any thrown error as a `fail`
4. `computeHealthScore()` aggregates results into a 0–100 score and a `ready`/`needs_attention`/`not_ready` verdict (any critical-severity failure forces `not_ready`)
5. Console report is always printed; `--format=all` (the `verify:production` default) additionally writes `verification-reports/latest.md` and `latest.json`
6. Process exits `1` only if the verdict is `not_ready`

---

### UC-17 — Fetch Jobs From a Static Careers URL (merge-workspace Phase 5)

**Actor:** Operator
**Trigger:** Manual run of `npm run scrape:careers-url -- <careers-page-url>`
**Precondition:** An active role selection exists (same precondition `scrape.ts` has); the target page is a public, static-HTML careers page (JS-rendered pages are not supported); `OPENROUTER_API_KEY` is configured for `llmClient.ts`'s default provider (decisions.md AD-42), or `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` if `LLM_PROVIDER` is switched away from the default
**Main Flow:**
1. Script fetches the given URL and strips it to plain text (`stripHtml`, script/style content removed)
2. Text is chunked (`chunkText`) and each chunk is sent to `LlmCareersPageExtractor`, which asks the configured LLM to extract listed job postings as JSON
3. Extracted items are mapped to `RawJob`, with a deterministic sha256-derived `sourceJobId` from `(url, title)` standing in for the stable ID a real ATS API would provide
4. The same `tagLocations` → `hasAllowedLocation` → `ingestJobs` pipeline `scrape.ts` uses processes the results (location filtering, cross-source dedup, upsert)
5. One `scrape_runs` row is recorded for `source = 'careers_url'`, same shape as every other source's run log

**Postcondition:** Jobs found on the page and matching the active role selection's location targets are ingested; console output and the `scrape_runs` row report found/kept/inserted/updated counts

**Alternate Flow (empty page):** If the page has no extractable text (e.g. entirely JS-rendered) or the LLM finds no postings, the run completes with `found: 0` rather than failing

**Alternate Flow (fetch failure):** A non-2xx response from the target URL fails the run with `status = 'failed'` and a classified `failureCategory`, same as any other source's failure path

**Postcondition:** Operator sees a full Ready/Needs Attention/Not Ready assessment with per-check detail and actionable recommendations

**Alternate Flow:** No live Supabase project configured (e.g. a fresh checkout) → every credential-dependent check reports `warning: Skipped — ...` instead of crashing; the run still completes and produces a report

---

### UC-17 — Draft, Review, and Send a Job Application (merge-workspace Phase 4, decisions.md AD-34)

**Actor:** User  
**Trigger:** User clicks the mail icon on a job row/card on `/dashboard`  
**Precondition:** Active resume exists  
**Main Flow:**
1. `getApplicationForJobAction(jobId, "email")` checks for an existing `(job_id, kind)` application row
2. If none exists (or the existing one is `dismissed`), user clicks "Generate draft" → `draftApplicationAction(jobId, kind)` calls `LlmApplicationDraftProvider` with the job's title/company/location/description (truncated to 4000 chars) and the active resume's text (truncated to 8000 chars — same caps jobhunt's `apply.py` used, AD-23 precedent), asking for a truthful, non-fabricated subject/body
3. Draft is persisted (upsert on `(job_id, kind)`, status `draft`), pre-filled with the job's `contact_email` as recipient if one was extracted at ingest
4. User reviews the draft in the dialog, optionally edits subject/body and saves (`updateApplicationContentAction`)
5. User clicks "Open in mail client" → a `mailto:` link (`buildMailtoLink.ts`) opens their own mail client with the draft prefilled; `markApplicationSentAction(id)` records `status = sent`, `sent_at = now()`

**Alternate Flow (dismiss):** User clicks "Dismiss" instead of sending → `markApplicationDismissedAction(id)` sets `status = dismissed`; the job can be redrafted later, generating a fresh draft over the same row

**Alternate Flow (already sent):** Redrafting an application whose `status` is already `sent` is rejected — a sent application is a permanent record of what was actually sent

**Postcondition:** No message is ever sent by the app itself — every send is the user's own action in their own mail client (scope.md's "Auto-apply / auto-send" exclusion)

---

### UC-18 — Pending Draft Applications Reminder (merge-workspace Phase 4)

**Actor:** Cron  
**Trigger:** End of `scripts/notify.ts`, immediately after UC-12's job-match digest  
**Main Flow:**
1. Query every `applications` row with `status = 'draft'`, joined with its job's title/company
2. If any exist, format a short HTML reminder (`formatPendingDraftsReminder.ts`, same message style as the job digest) and send it via the same `TelegramSender` port UC-12 already uses — no new notification channel
3. If none exist, nothing is sent

**Note:** Stateless by design — the reminder reflects the current pending-draft count on every run, so it naturally stops repeating once every draft is sent or dismissed (UC-17); there is no separate "already reminded" tracking.

---


## 3. User Story Summary

| Story ID | As a user, I want to… | So that… |
|---|---|---|
| US-01 | upload my resume | the platform knows my skills |
| US-02 | set my target role (custom or via role pack) | the platform fetches and scores relevant jobs |
| US-03 | see a ranked job list | I focus on the best matches first |
| US-04 | filter by location and source | I find jobs in my preferred geography |
| US-05 | assign statuses to jobs | I track my application pipeline |
| US-06 | receive Telegram alerts | I never miss a high-match posting |
| US-07 | see which skills I'm missing | I know what to learn next |
| US-08 | add company board tokens | the scraper covers my target companies |
| US-09 | view score distributions | I understand the quality of matches over time |
| US-10 | edit extracted skills | I correct any parsing errors |
| US-11 | configure notification filters | I only receive alerts for jobs matching my criteria |
| US-12 | block companies/agencies and exclude employment types (internship/contract/etc.) from alerts | I stop seeing postings I'd never apply to |
| US-13 | see why a job was surfaced (remote, urgent, salary, employment type badges) at a glance in Telegram | I can triage without opening the dashboard |
| US-14 | get an AI-drafted, reviewable application for a job, then send it from my own mail client | I apply faster without the platform sending anything on my behalf |
| US-15 | get reminded in Telegram when I have draft applications sitting unreviewed | I don't forget to follow up on jobs I meant to apply to |
| US-16 | point the platform at one company's careers page and have it pull in the roles listed there | I can cover a company that isn't on any supported ATS/aggregator without a full new source integration |
