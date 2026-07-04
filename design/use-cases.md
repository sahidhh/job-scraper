# Use Cases

## 1. Actors

| Actor | Description |
|---|---|
| **User** | The single authenticated human operator of the platform |
| **Cron (GitHub Actions)** | Automated scheduler that runs scrape/score/notify pipelines |
| **ATS Board API** | External Greenhouse / Lever / Ashby job board APIs |
| **Public Job Board** | Wellfound feed, RemoteOK RSS, MyCareersFuture API |
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
3. User can filter by location, source, status, min/max score, max experience, and a free-text
   search over title/company; muted companies (UC-13) are always excluded
4. Pagination loads next page on demand

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
**Trigger:** User navigates to `/resume` and uploads a PDF  
**Main Flow:**
1. User drags/drops or selects a PDF file
2. `uploadResumeAction` receives the file
3. pdf-parse extracts full text
4. Skills matched against skills-dictionary
5. `set_active_resume` RPC atomically saves new resume and deactivates previous
6. Extracted skills displayed; user can manually edit

**Alternate Flow:** PDF parse fails → error message shown; no resume row created

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
   b. If score ≥ KEYWORD_THRESHOLD: call OpenRouter AI score (15s timeout, 1 retry)
   c. Upsert `job_scores` row
4. AI failures leave `ai_score = null` and are retried on the next cron run

---

### UC-12 — Automated Notifications

**Actor:** Cron  
**Trigger:** Immediately after UC-11 in the same GitHub Actions job  
**Main Flow:**
1. Load notification preferences from `app_settings` (optional; absent = notify all)
2. Query: jobs where `ai_score >= NOTIFY_THRESHOLD` AND no row in `notifications_log`
3. Apply notification preferences filter (role, skill, location, experience, source include-filters; excludeCompanies/excludeKeywords mutes) if set
4. For each passing match (isolated):
   a. Format Telegram HTML message (title, company, location, source, URL, AI reasoning)
   b. POST to Telegram Bot API
   c. On success: upsert `notifications_log` row (prevents re-send)
5. Per-match failure is logged; does not block remaining matches

**Note:** Filtered-out jobs are NOT marked notified; they re-evaluate on future runs.

---

### UC-13 — Configure Notification Preferences

**Actor:** User  
**Trigger:** User navigates to `/settings` → Notifications  
**Main Flow:**
1. User fills in roles/skills/locations/sources/min-max experience (include-only filters) and/or muted companies/keywords
2. `setNotificationPreferencesAction(prefs)` called; stored as JSON in `app_settings` under key `notification_preferences`
3. Next notify cron run applies filters before sending; `excludeCompanies` is also applied to the dashboard job list (UC-02) via the same stored setting

**Alternate Flow (clear):** `setNotificationPreferencesAction(null)` removes the row; cron reverts to notify-all and the dashboard stops muting any companies

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
