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
2. Jobs displayed in table sorted by ai_score descending
3. User can filter by location, source, status, and min/max score
4. User can sort by any column
5. Pagination loads next page on demand

**Postcondition:** User sees paginated, filtered job list with scores and statuses

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
7. Upsert all to `jobs` (dedup on source + source_job_id)
8. Log each source's result to `scrape_runs`

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
1. Query: jobs where `ai_score >= NOTIFY_THRESHOLD` AND no row in `notifications_log`
2. For each match (isolated):
   a. Format Telegram HTML message (title, company, location, source, URL, AI reasoning)
   b. POST to Telegram Bot API
   c. On success: upsert `notifications_log` row (prevents re-send)
3. Per-match failure is logged; does not block remaining matches

---

## 3. User Story Summary

| Story ID | As a user, I want to… | So that… |
|---|---|---|
| US-01 | upload my resume | the platform knows my skills |
| US-02 | set my target role | the platform fetches and scores relevant jobs |
| US-03 | see a ranked job list | I focus on the best matches first |
| US-04 | filter by location and source | I find jobs in my preferred geography |
| US-05 | assign statuses to jobs | I track my application pipeline |
| US-06 | receive Telegram alerts | I never miss a high-match posting |
| US-07 | see which skills I'm missing | I know what to learn next |
| US-08 | add company board tokens | the scraper covers my target companies |
| US-09 | view score distributions | I understand the quality of matches over time |
| US-10 | edit extracted skills | I correct any parsing errors |
