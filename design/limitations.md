# Limitations

## 1. Data & Coverage

### 1.1 Job Source Coverage
Only six sources are integrated (Greenhouse, Lever, Ashby, Wellfound, RemoteOK, MyCareersFuture). Major platforms like LinkedIn, Indeed, Glassdoor, and Naukri are not supported because they either have no public API, require authentication, or prohibit scraping in their ToS.

Of the 38 ATS company boards currently configured, **13 are confirmed healthy** and **25 are broken** as of the June 2026 validation run (run ID 27865212149). Three DB migrations (`20260620000001–3`) are code-complete and will raise the healthy count to ≥ 20 once applied. See `reports/source-validation-2026-06-22.md` for the full breakdown and `docs/research/source-strategy-review.md` for the expansion plan.

RemoteOK and Wellfound are disabled (zero effective yield). MyCareersFuture is healthy (Singapore-specific, small volume).

### 1.2 Wellfound Dependency
The Wellfound adapter requires a custom feed URL (`WELLFOUND_FEED_URL`) because Wellfound has no documented public API. If the URL is not configured, the adapter auto-disables and returns zero results. `WELLFOUND_DISABLED=true` is set explicitly in `scrape.yml` to suppress any residual log noise. Users without a Wellfound feed receive no Wellfound data. See `docs/sources/wellfound.md` for setup instructions.

### 1.3 Scrape Cadence
Jobs are fetched every 2 hours. New postings may be up to 2 hours old before appearing in the dashboard. There is no webhook or push mechanism from any ATS source.

### 1.4 Geographic Coverage
Location tagging is hardcoded to four tags: India, Singapore, UAE, Remote. Jobs from other geographies are dropped during filtering. Expanding to new regions requires a database migration (extending the `location_tag` enum) and code changes.

### 1.5 Historical Job Data
Only jobs seen after the platform was set up are stored. There is no backfill of historical postings from ATS sources.

### 1.6 Job Expiration
Jobs not seen in recent scrapes are soft-deactivated after `JOB_EXPIRATION_DAYS` (default 14). Inactive jobs are excluded from the dashboard, scoring, and notifications but are never deleted. Jobs may reactivate automatically if they reappear on the source board (upsert sets `is_active = true` and refreshes `last_seen_at`).

### 1.7 Cross-Source Duplicate Detection Scope
Fingerprint-based dedup (`docs/decisions.md` AD-16) only checks a new job against rows already persisted in the DB — it does not dedupe two postings that collide on fingerprint within the *same* scrape batch (same source, same run). This is rare in practice (would require one source listing the same title/company/location twice in one run) and is left unhandled rather than adding logic to resolve IDs for rows not yet inserted. Existing jobs ingested before the fingerprint migration have `fingerprint = ''` until `npm run backfill:fingerprints` is run once; until then they are not matched against by the cross-source check (fails safe — no false merges, just temporarily un-deduped). Title normalization also deliberately strips seniority modifiers (senior/sr/junior/jr/lead/staff/principal), so a Senior and non-senior posting for the same title/company/location are treated as the same logical job — acceptable for the stated use case, but worth knowing if it ever needs to change.

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

### 3.6 `findUnscored` URL Size — Resolved
The original `findUnscored` implementation excluded "done" jobs by placing all their IDs into a PostgREST `NOT IN (...)` URL query parameter. As the done-set grew past ~200 entries the request URI exceeded the 8 KB Supabase API gateway limit, producing a 414 URI Too Long error. This was resolved by switching to a three-step pattern: (1) fetch done IDs as a response body, (2) fetch candidate job IDs as a response body, (3) compute the set difference in memory and fetch full rows in bounded IN chunks of ≤ 100 IDs. The URL size is now permanently bounded regardless of database growth. See `docs/reports/findUnscored-regression-fix.md`.

### 3.4 AI Model Dependency
Scoring quality depends entirely on the configured `OPENROUTER_MODEL`. Changing the model may alter score distributions and require re-scoring existing jobs (no automatic re-score on model change).

### 3.5 No Score Invalidation on Resume Change
Existing `job_scores` rows are not deleted when a new resume is activated. The new resume's skills will affect only newly scored jobs. The user must understand that old scores reflect the previous resume.

---

## 4. Notifications

### 4.1 One-Time Guarantee Only
The `notifications_log` table prevents duplicate sends for jobs already notified (verified Phase 1 Task 4, `docs/decisions.md` AD-17: `markNotified`/`markManyNotified` only run after a successful Telegram send, so a failed send is retried on the next cron run rather than silently dropped). However, if the failure is permanent (bot blocked, chat deleted), every retry keeps failing the same way forever — there is no backoff or dead-letter handling, just an indefinitely-retried, indefinitely-failing job. There is also a narrow at-least-once (not exactly-once) window: if the Telegram send succeeds but the immediately-following `notifications_log` write itself throws, the job is re-sent on the next run.

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
| June DB migrations not yet applied | 25 broken sources, 10 should be disabled; 13 should be repaired | P0 |
| 7 broken sources without repair/disable plan | Revolut, Grab, BrowserStack, Rippling, Deel, Freshworks, Wise — all returning 404, not in June migration scope | P1 |
| Source-level health summary (`getSourceHealthReport`, Phase 1 Task 5/7) has no UI | Backend-only; not yet wired to a dashboard or actual scraper auto-disable decisions, so it doesn't yet change runtime behavior, only offers a computable summary for future use | P2 |
| Two independent, unreconciled source-health signals | `companies.health_status` (probe-driven, board-token sources only, drives auto-disable via `listActiveHealthy`) and the `scrape_runs`-derived summary (covers all sources, informational only) can disagree — e.g. a source can show `recommendation: "Healthy."` from recent scrape_runs while still `disabled` in `companies` if it hasn't been re-probed yet | P3 |
| Scoring queue report (`getScoringQueueReport`, Phase 1 Task 6) is log-only | `score.ts` logs queue depth/stuck jobs to stdout on every run; there's no UI, alerting, or auto-remediation for stuck jobs beyond the indefinite-retry behavior that already existed (AD-14) | P2 |
