# Limitations

## 1. Data & Coverage

### 1.1 Job Source Coverage
Eight sources run on the normal scrape cron (Greenhouse, Lever, Ashby, Wellfound, RemoteOK, MyCareersFuture, JSearch, Adzuna -- merge-workspace Phase 5 added the last two), plus one manual-trigger-only source (the static careers-URL fetcher, `careers_url`, §1.1a). LinkedIn, Indeed, and Glassdoor listings do reach the platform indirectly through JSearch (which indexes Google for Jobs), but there is still no direct integration with those sites or with Naukri -- they have no public API for direct access, require authentication, or prohibit scraping in their ToS.

Of the 38 ATS company boards currently configured, **13 are confirmed healthy** and **25 are broken** as of the June 2026 validation run (run ID 27865212149). Three DB migrations (`20260620000001–3`) are code-complete and will raise the healthy count to ≥ 20 once applied. See `reports/source-validation-2026-06-22.md` for the full breakdown and `docs/research/source-strategy-review.md` for the expansion plan.

RemoteOK and Wellfound are disabled (zero effective yield). MyCareersFuture is healthy (Singapore-specific, small volume).

### 1.1a JSearch, Adzuna, and the Careers-URL Fetcher (merge-workspace Phase 5)
JSearch and Adzuna both auto-disable (clean skip, no error) when their API credentials (`RAPIDAPI_KEY`; `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`) are unset -- neither is enabled out of the box. Both are bounded to a small, fixed number of `(search term x country)` requests per run (`MAX_SEARCH_TERMS = 2`) to stay within typical free-tier rate limits; this trades completeness for a small, predictable request volume rather than exhaustively covering every expanded role. **Adzuna does not cover the UAE** -- only India and Singapore of this platform's three target regions are reachable through it (`ADZUNA_COUNTRIES` default `in,sg`); UAE coverage still comes from JSearch and the ATS adapters. The static careers-URL fetcher is best-effort, static HTML only (no headless browser, same limitation jobhunt-app's own reference implementation states) -- a JS-rendered careers page will extract no jobs. It is manual-trigger only (`npm run scrape:careers-url -- <url>`), not part of any cron/workflow, and its extraction quality depends on the configured LLM the same way resume suggestions/application drafts do (`design/limitations.md` §2.5's caveats about LLM output quality apply here too).

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

### 1.8 Career Page Discovery Coverage
Only board-token companies (greenhouse/lever/ashby) get a `company_career_pages` entry (deterministic, from `source`+`board_token`). Aggregator-sourced companies (wellfound/remoteok/mycareersfuture — see §1.1, these carry the bulk of job volume) have no career page discovered; guessing a company's domain from its name alone was deliberately not attempted this pass (`docs/decisions.md` AD-20) because it can't be verified reliably without a search API or live network validation against real companies.

### 1.9 Contact Email Extraction Coverage
`extractContactEmail` (`docs/decisions.md` AD-21) only sees the plain text left after each scraper's `stripHtml()` runs — an email address that exists only inside a `mailto:` href with non-email link text (e.g. `<a href="mailto:jane@co.com">Apply now</a>`) is invisible to it and `contact_email` stays null for that job, even though a real contact address exists. Categorization (recruiter/hr/hiring_manager/company_contact) is a local-part keyword match only, not text-proximity or NLP — most personal-name addresses (the common case) fall back to `company_contact`/`low` confidence rather than a more specific guess. The extraction regex's local-part character class is ASCII-only, so an address with an accented/non-Latin local part (e.g. `josé@company.com`) is not matched at all.

### 1.11 Job Attributes Extraction Coverage

`extractJobAttributes` (v1.2) recognizes a fixed set of keyword patterns for employment type, seniority, work arrangement, visa sponsorship, relocation assistance, security clearance, and urgent hiring -- regex-only, no AI, same tradeoff philosophy as `extractSalary`/`extractContactEmail`. Known gaps, deliberately not handled this pass:
- **Notice period, shift work, travel requirements, and graduate-program-as-a-distinct-category** are not extracted at all (out of scope for v1.2; see the v2.0 roadmap).
- Seniority's `lead` value only fires on explicit phrases (`tech lead`, `team lead`, `lead engineer`, `lead developer`) -- a bare "Lead" in a title without one of those phrases is not detected, to avoid false positives like "Sales Lead Generation".
- `workArrangement` only distinguishes `hybrid`/`onsite` for postings that use those words explicitly; a job with no work-arrangement text at all (common for onsite-only regional postings) returns `null`, indistinguishable from "not mentioned". Fully-remote jobs are already covered by `jobs.location_tags` (the `remote` tag), not by this field.
- `visaSponsorship`/`relocationAssistance` are tri-state (`null` = not mentioned, `true`/`false` = explicit) but the negative-phrase pattern list is small; an unusual negative phrasing not in the list will be misread as `null` (not mentioned) rather than `false` (explicitly ruled out).

### 1.10 Salary Extraction Coverage
`extractSalary` (`docs/decisions.md` AD-22) only recognizes a fixed set of formats (₹/$/S$/Rs symbols; USD/INR/SGD/AED codes; India-specific LPA/lakh units; `/year`, `/month`, `/hour`-style periods). Postings that state salary in an unrecognized format (spelled-out numbers, other currencies/regions, a link to a separate compensation page) are not extracted — `jobs.salary_*` stays null, indistinguishable from "no salary mentioned at all." This is a deliberate false-negative-over-false-positive tradeoff (a bare number is never guessed as a salary without a currency/unit/period signal attached), not a bug. A range that repeats a currency *code* as a prefix on both bounds (e.g. "INR 800000 - INR 1200000 per annum") also collapses to a single figure (the first number only, `medium` confidence, no period) — the equivalent case for a repeated currency *symbol* ("$50,000 - $70,000 per year") is handled correctly; see the comment above `PATTERNS` in `extractSalary.ts`.

---

## 2. Resume & Skill Extraction

### 2.1 PDF and DOCX Only
PDF and DOCX resumes are supported (via pdf-parse and mammoth respectively). Plain text, HTML, or other formats are not accepted. A scanned/image-only PDF (no embedded text layer) is rejected with an error rather than silently creating a resume with no extracted skills.

### 2.1a Parse-Once Cache
Re-uploading a file with identical bytes (by sha256 hash) reuses the previously parsed text instead of re-running pdf-parse/mammoth — this only skips the parse step; a new resume version row is still created on every upload.

### 2.2 Skill Dictionary Dependency
Skills are matched against a fixed canonical dictionary (`skillsDictionary.ts`). Skills not in the dictionary are not detected, even if clearly stated in the resume. Users can manually add skills after upload.

### 2.3 No Semantic Matching
Skill extraction uses exact or near-exact string matching against the dictionary — not semantic embeddings or NLP. "Node.js" and "NodeJS" may or may not both match depending on dictionary normalization.

### 2.4 Single Active Resume
Only one resume can be active at a time. Switching resumes invalidates all existing scores for the new active role (scores are role_selection-scoped, so they remain, but skill-based keyword scores become stale until the next scoring run).

### 2.5 Resume Suggestions Have No UI Yet (`docs/decisions.md` AD-33)
`suggestResumeImprovementsAction`/`applyResumeSuggestionsAction` (AI resume coaching + apply-as-new-version) are implemented end-to-end — domain, application, infrastructure, and server actions all have test coverage — but no `/resume` page UI calls them yet. Same shape as §3.9's `embedding_score` gap: the merge plan's Phase 3 checklist scoped the backend capability, not a UI pass. A suggestion set becomes unusable (never appliable) once its resume version is superseded by a newer upload or another apply — `applyResumeSuggestions` rejects a mismatched `resumeId` rather than silently applying against stale text.

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

### 3.7 AI Prompt Truncation
Resume text and job descriptions are capped (`OPENROUTER_MAX_RESUME_PROMPT_CHARS`/`OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`, defaults 4000/2000 chars) before being sent to the AI stage (`docs/decisions.md` AD-23) to control token cost. A resume or posting whose single most relevant detail appears only after the cap will lose that signal to the AI score/reasoning — a real, deliberate tradeoff, not a bug. The free keyword-gate stage (`extractSkills`) always sees the full untruncated text, so this never affects which jobs reach the AI stage, only what the AI sees once there.

### 3.8 Ranking Preferences Don't Retroactively Re-Rank (`docs/decisions.md` AD-26)
`overall_score` is computed once, at scoring time, from whatever `RankingPreferences` are in effect then. Changing preferences (e.g. adding a new preferred company) does not recompute `overall_score` for jobs already scored — it only takes effect for jobs scored from that point on (new scrapes, or the AI-retry queue). This mirrors §3.5's existing "no retroactive rescoring" behavior rather than introducing a new kind of staleness.

### 3.9 `embedding_score` Is Informational Only, With No Dashboard Surface (`docs/decisions.md` AD-31)
`job_scores.embedding_score` (local, offline resume/job cosine similarity) is computed and persisted at stage 2 but is not shown anywhere in the UI and does not affect `overall_score`/dashboard sort order. It is also not backfilled for scores written before this column existed, and not recomputed retroactively (same staleness shape as §3.5/§3.8). A cold environment with no cached model (a fresh CI runner or serverless cold start, not this project's persistent-cron deployment shape) downloads the ~90 MB model on the first `score.ts` invocation, adding latency to that one run; every failure mode (no cache, no network, model error) degrades to a logged null rather than blocking scoring.

---

## 4. Notifications

### 4.1 One-Time Guarantee Only
The `notifications_log` table prevents duplicate sends for jobs already notified (verified Phase 1 Task 4, `docs/decisions.md` AD-17: `markNotified`/`markManyNotified` only run after a successful Telegram send, so a failed send is retried on the next cron run rather than silently dropped). However, if the failure is permanent (bot blocked, chat deleted), every retry keeps failing the same way forever — there is no backoff or dead-letter handling, just an indefinitely-retried, indefinitely-failing job. There is also a narrow at-least-once (not exactly-once) window: if the Telegram send succeeds but the immediately-following `notifications_log` write itself throws, the job is re-sent on the next run. `sendDigest` (digest mode) has a coarser version of the same window: it sends one message per chunk but marks the *entire* batch notified only after every chunk succeeds, so a failure partway through re-sends the whole digest -- including chunks already delivered -- on the next run, rather than resuming from the failed chunk. This is a deliberate simplicity tradeoff (no per-chunk delivery tracking), not a bug.

### 4.2 Telegram Rate Limits
The Telegram Bot API enforces rate limits (approximately 30 messages/second globally, 20 messages/minute per chat). Large batches of high-scoring jobs may experience queuing delays. The platform respects `retry_after` headers (capped at 30s).

### 4.3 No Notification Categories or Filters
All jobs above `NOTIFY_THRESHOLD` are notified unless narrowed by `NotificationPreferences` (role/skill/location/experience/source include filters, plus `blockedCompanies`/`excludeEmploymentTypes` exclude filters as of v1.2), configurable from the `/settings` "Notification filters" card.

### 4.4 "Why This Job" Highlights Are Best-Effort
The Telegram highlight badges (remote/urgent/salary/employment-type, v1.2) are derived entirely from `extractJobAttributes`/`extractSalary` output already computed at ingest -- they inherit all the coverage gaps documented in §1.11/§1.10 (e.g. a job with an unrecognized salary format shows no salary badge, not an approximate one). There is no "matches preferred company/tech stack" badge yet. `RankingPreferences.preferredCompanies` exists and is used to bias the dashboard's `overall_score` sort (P1.9, `computeOverallScore.ts`), but it is not wired into the digest's highlight badges, and `preferredTechnologies` was never built at all (see `ROADMAP.md`'s Deferred table).

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

## 8. Applications (`docs/decisions.md` AD-34)

### 8.1 Pending-Drafts Reminder Repeats Until Resolved
The Telegram reminder for draft applications (`notifyPendingDrafts`) is stateless — it lists whatever `applications` rows currently have `status = 'draft'` on every cron run, with no "already reminded" tracking. This is deliberate (see AD-34's Rationale), but it means a draft the user genuinely intends to send "later" will show up in every notify run (every 2 hours, per the standard cron cadence) until it's sent or dismissed. There is no snooze.

### 8.2 One Application Per (Job, Kind)
`applications` has a `UNIQUE (job_id, kind)` constraint — at most one email draft and one cover-letter draft per job, ever. Redrafting overwrites the existing `draft`/`dismissed` row in place; there is no history of prior draft attempts for the same job+kind, and a `sent` row can never be redrafted or edited (`draftApplication`/`updateApplicationContent`/`markApplicationSent` all reject a non-`draft` status).

### 8.3 No Cover-Letter-Specific UI Distinction
`kind: "coverletter"` is a fully supported value in the domain layer and database (longer word-count target in the drafting prompt), but the `/dashboard` review dialog only ever calls the actions with `kind: "email"` — there is no UI control yet to request a cover-letter draft instead. Reachable today only by calling `draftApplicationAction(jobId, "coverletter")` directly (e.g. from a future UI addition or a script), not from the shipped dialog.

---

## 9. Known Technical Debt

| Item | Impact | Priority |
|---|---|---|
| No AI score invalidation on resume change | Stale scores after resume update | P2 |
| Sequential AI scoring (no batching) | Slow for large job backlogs | P2 |
| In-memory analytics aggregation | Slow for large datasets | P3 |
| Manual wellfound feed URL configuration | Non-obvious setup step | P3 |
| June DB migrations not yet applied | 25 broken sources, 10 should be disabled; 13 should be repaired | P0 |
| 7 broken sources without repair/disable plan | Revolut, Grab, BrowserStack, Rippling, Deel, Freshworks, Wise — all returning 404, not in June migration scope | P1 |
| Source-level health summary (`getSourceHealthReport`, Phase 1 Task 5/7) doesn't drive runtime behavior | Now surfaced on `/analytics` (Phase 4 Task 13), but still informational only — `scrape.ts`'s scraper-selection logic (`listActiveHealthy`) still only reads `companies.health_status`, not this summary | P2 |
| Two independent, unreconciled source-health signals | `companies.health_status` (probe-driven, board-token sources only, drives auto-disable via `listActiveHealthy`) and the `scrape_runs`-derived summary (covers all sources, informational only) can disagree — e.g. a source can show `recommendation: "Healthy."` from recent scrape_runs while still `disabled` in `companies` if it hasn't been re-probed yet. `/analytics` now shows both tables side by side rather than merging them, so the disagreement is visible instead of hidden | P3 |
| Scoring queue report (`getScoringQueueReport`, Phase 1 Task 6) has no alerting | Now surfaced on `/analytics` (Phase 4 Task 13) and still logged by `score.ts` every run; there's still no push alerting or auto-remediation for stuck jobs beyond the indefinite-retry behavior that already existed (AD-14) | P2 |
