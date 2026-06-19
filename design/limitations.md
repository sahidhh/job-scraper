# Limitations

## 1. Data & Coverage

### 1.1 Job Source Coverage
Only six sources are integrated (Greenhouse, Lever, Ashby, Wellfound, RemoteOK, MyCareersFuture). Major platforms like LinkedIn, Indeed, Glassdoor, and Naukri are not supported because they either have no public API, require authentication, or prohibit scraping in their ToS.

### 1.2 Wellfound Dependency
The Wellfound adapter requires a custom feed URL (`WELLFOUND_FEED_URL`) because Wellfound has no documented public API. If the URL is not configured, the adapter logs `[wellfound] invalid configuration` and returns zero results. Set `WELLFOUND_DISABLED=true` to opt out explicitly (suppresses the warning). Users without a Wellfound feed receive no Wellfound data. See `docs/sources/wellfound.md` for setup instructions.

### 1.3 Scrape Cadence
Jobs are fetched every 2 hours. New postings may be up to 2 hours old before appearing in the dashboard. There is no webhook or push mechanism from any ATS source.

### 1.4 Geographic Coverage
Location tagging is hardcoded to four tags: India, Singapore, UAE, Remote. Jobs from other geographies are dropped during filtering. Expanding to new regions requires a database migration (extending the `location_tag` enum) and code changes.

### 1.5 Historical Job Data
Only jobs seen after the platform was set up are stored. There is no backfill of historical postings from ATS sources.

### 1.6 Job Expiration
Jobs not seen in recent scrapes are soft-deactivated after `JOB_EXPIRATION_DAYS` (default 14). Inactive jobs are excluded from the dashboard, scoring, and notifications but are never deleted. Jobs may reactivate automatically if they reappear on the source board (upsert sets `is_active = true` and refreshes `last_seen_at`).

---

## 2. Resume & Skill Extraction

### 2.1 PDF Only
Only PDF resumes are supported. DOCX, plain text, HTML, or other formats are not accepted.

### 2.2 Skill Dictionary Dependency
Skills are matched against a fixed canonical dictionary (`skillsDictionary.ts`). Skills not in the dictionary are not detected, even if clearly stated in the resume. Users can manually add skills after upload.

### 2.3 No Semantic Matching
Skill extraction uses exact or near-exact string matching against the dictionary — not semantic embeddings or NLP. "Node.js" and "NodeJS" may or may not both match depending on dictionary normalization.

### 2.4 Single Active Resume
Only one resume can be active at a time. Switching resumes invalidates all existing scores for the new active role (scores are role_selection-scoped, so they remain, but skill-based keyword scores become stale until the next scoring run).

---

## 3. Scoring

### 3.1 Keyword Score Is Approximate
The keyword stage counts skill overlap between resume skills and job description tokens — it does not understand context (e.g., "experience with React is preferred" vs "must have 5 years React").

### 3.2 AI Score Latency
The AI scoring stage adds 1–15 seconds per job (OpenRouter call). Scoring thousands of jobs can take tens of minutes. There is no parallel/batch AI scoring — jobs are scored sequentially.

### 3.3 AI Score Nullability
If the OpenRouter call fails (timeout, 5xx, or invalid response), `ai_score` is left null. The job appears in the dashboard but without an AI score. The next cron run will attempt rescoring automatically.

### 3.4 AI Model Dependency
Scoring quality depends entirely on the configured `OPENROUTER_MODEL`. Changing the model may alter score distributions and require re-scoring existing jobs (no automatic re-score on model change).

### 3.5 No Score Invalidation on Resume Change
Existing `job_scores` rows are not deleted when a new resume is activated. The new resume's skills will affect only newly scored jobs. The user must understand that old scores reflect the previous resume.

---

## 4. Notifications

### 4.1 One-Time Guarantee Only
The `notifications_log` table prevents duplicate sends for jobs already notified. However, if a Telegram send fails permanently (bot blocked, chat deleted), the job is never retried — it must be manually cleared from `notifications_log`.

### 4.2 Telegram Rate Limits
The Telegram Bot API enforces rate limits (approximately 30 messages/second globally, 20 messages/minute per chat). Large batches of high-scoring jobs may experience queuing delays. The platform respects `retry_after` headers (capped at 30s).

### 4.3 No Notification Categories or Filters
All jobs above `NOTIFY_THRESHOLD` are notified. There is no per-source, per-company, or per-location notification filter beyond the threshold score.

---

## 5. Role Expansion

### 5.1 Cache Miss Latency
If the user's chosen role has no entry in `role_expansion_map`, an OpenRouter call is made synchronously during the role-setting action. This adds 5–15 seconds to the UI response.

### 5.2 AI Expansion Quality
The quality of expanded roles depends on the LLM. For niche or ambiguous roles, the expansion may be too broad or too narrow, affecting scrape and scoring breadth.

### 5.3 Single Active Role
Only one role selection is active at a time. The platform does not support multi-role job hunting (e.g., searching for "Backend Engineer" and "DevOps Engineer" simultaneously).

---

## 6. Infrastructure

### 6.1 Single-User Only
There are no per-user data partitions (no `user_id` columns). All data is shared under one Supabase project. Running a second instance for a second user would require a separate Supabase project and deployment.

### 6.2 Supabase Dependency
The platform is tightly coupled to Supabase (Postgres, Auth, Storage). There is no abstraction layer to swap in a different managed database or storage provider without significant refactoring.

### 6.3 No Self-Hosted Cron
Cron jobs are managed by GitHub Actions. Teams or individuals without access to GitHub Actions (or equivalent CI runner) cannot run the background pipelines.

### 6.4 Cold Start Latency
Vercel serverless functions experience cold starts, which can add 1–3 seconds to the first request after a period of inactivity.

### 6.5 Service Role Key Exposure Risk
If `SUPABASE_SERVICE_ROLE_KEY` is ever accidentally added to Vercel env vars (instead of GitHub Actions secrets only), it could be exposed in Next.js server bundles. The CI boundary check (`check:service-role-boundary`) mitigates this for app/ code, but Vercel env var configuration must be managed carefully.

---

## 7. Analytics & Insights

### 7.1 In-Memory Computation
All analytics (score histograms, skill gaps, job counts) are computed in the application layer from raw data fetched from the database — not via aggregation queries or materialized views. For large datasets (10,000+ jobs), this may be slow.

### 7.2 Insights Require Active Resume and Role
Skill gap and skill demand insights are meaningful only when both an active resume and an active role_selection exist with scored jobs. A fresh setup shows empty insights.

---

## 8. Known Technical Debt

| Item | Impact | Priority |
|---|---|---|
| No AI score invalidation on resume change | Stale scores after resume update | P2 |
| Sequential AI scoring (no batching) | Slow for large job backlogs | P2 |
| In-memory analytics aggregation | Slow for large datasets | P3 |
| Manual wellfound feed URL configuration | Non-obvious setup step | P3 |
