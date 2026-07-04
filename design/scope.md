# Project Scope

## 1. Problem Statement

Job seekers waste hours manually checking multiple job boards, comparing postings to their skills, and missing newly posted positions. The Job Intelligence Platform automates this workflow: continuous scraping, intelligent scoring against a user's actual resume, and proactive notification — so the user only sees postings that matter.

## 2. Target User

A single technical professional (software engineer, data scientist, or similar) who:
- Is actively or passively job-searching
- Has a resume in PDF format
- Wants to monitor positions in India, Singapore, UAE, or remote globally
- Is comfortable with basic self-hosted setup (Supabase, Vercel, GitHub Actions)

## 3. In-Scope Features

### P0 — Core (Must Ship)

| Feature | Description |
|---|---|
| Resume upload & skill extraction | Upload PDF, extract text, tag skills from dictionary |
| Role selection & AI expansion | Define target role; expand to related roles via LLM or cache |
| Role Packs | Pre-defined curated role groups; click to instantly activate without AI call |
| Multi-source job scraping | Greenhouse, Lever, Ashby (per board_token), Wellfound, RemoteOK, MyCareersFuture |
| Location filtering | Tag jobs by India / Singapore / UAE / Remote; drop untagged |
| Two-stage scoring | Keyword score (free) → AI score (gated) per job |
| Telegram notifications | Push alert for jobs above AI score threshold |
| Dashboard | Paginated, filterable, sortable job table with scores and statuses |
| Status workflow | Customizable workflow statuses (New, Interested, Applied, Rejected, Archived) |
| Company configuration | Add/remove Greenhouse/Lever/Ashby board tokens via UI |
| Observability | scrape_runs log per source |
| Source validation | Probe Greenhouse/Lever/Ashby boards pre-scrape; report dead tokens |

### P1 — High Priority

| Feature | Description |
|---|---|
| Skill gap insights | Show skills required by matched jobs but absent from resume |
| Skill demand chart | Most-requested skills across all matched jobs |

### P1.5 — Notification Filters (shipped)

| Feature | Description |
|---|---|
| Notification preferences | Configurable include filters: role, skill, location, experience, source — applied before Telegram delivery |

### P1.6 — Pipeline Reliability (shipped)

| Feature | Description |
|---|---|
| Cross-source duplicate detection | Deterministic fingerprint (normalized title + canonical company + location) prevents the same logical job scraped from two sources from becoming two rows, two scoring runs, or two notifications; provenance preserved in `job_duplicates` |
| Company name normalization | `jobs.canonical_company_name` strips legal-entity suffixes (LLC/Inc/Corp) and regional qualifiers (India/Singapore/...) from `company_name` for grouping, without discarding the original |
| Source-level health summary | `computeSourceHealthSummary`/`getSourceHealthReport` derive success rate, latency, consecutive failures, recovery detection, and a deterministic recommendation per source from `scrape_runs` -- covers feed-based sources (wellfound/remoteok/mycareersfuture) that `companies.health_status` can't see. Surfaced on `/analytics` (Phase 4) |
| Scrape failure classification | `classifyScrapeFailure.ts` tags every failed/empty scrape_runs row with a deterministic category (timeout/parsing/selector/captcha/blocked/authentication/rate_limited/not_found/empty_feed) |
| Pending-scoring queue monitoring | `getScoringQueueReport`/`computeScoringQueueSummary` surface AI-retry queue depth, oldest-pending age, stuck jobs, and retry counts (`job_scores.retry_count`, `upsert_job_score` RPC); logged by `score.ts` each run. Surfaced on `/analytics` (Phase 4) |

### P1.7 — Enrichment (shipped)

| Feature | Description |
|---|---|
| Career page discovery | `discoverAtsCareerPages`/`company_career_pages` -- deterministic careers-page URL for every ATS-registry (greenhouse/lever/ashby) company, keyed by canonical company name. Aggregator-sourced companies (wellfound/remoteok/mycareersfuture) not yet covered -- see `docs/decisions.md` AD-20 |
| Contact email extraction | `extractContactEmail` categorizes the best contact email per job (recruiter/hr/hiring_manager/company_contact + confidence), stored on `jobs.contact_email*`. Plain-text/regex only -- mailto:-only addresses not in visible text are not extracted (AD-21) |
| Salary extraction | `extractSalary` normalizes currency/min/max/period/confidence from title+description (₹/$/S$/Rs symbols, USD/INR/SGD/AED codes, India-specific LPA/lakh units, yearly/monthly/hourly periods), stored on `jobs.salary_*`. Deterministic regex only, no AI (AD-22) |

### P1.9 — Job Attributes & Personal Intelligence (shipped, v1.2)

| Feature | Description |
|---|---|
| Job attribute extraction | `extractJobAttributes` deterministically tags employment type (internship/contract/freelance/temporary/part_time/full_time), seniority (executive/principal/lead/senior/entry/mid), work arrangement (hybrid/onsite), visa sponsorship, relocation assistance, security clearance, and urgent hiring from title+description at ingest, stored on `jobs.employment_type` etc. Regex-only, no AI |
| Notification exclude filters | `NotificationPreferences.blockedCompanies` / `excludeEmploymentTypes` -- companies or employment types the user never wants alerted, ANDed with the existing include filters |
| Notification preferences UI | `/settings` "Notification filters" card -- the P1.5 filters (previously only settable via direct `app_settings` write) plus the new exclude filters are now editable end-to-end |
| Telegram "why this job" highlights | `buildJobHighlights` renders remote/urgent/salary/employment-type badges on both the individual-match and digest message formats, derived from data already computed at ingest (no extra AI calls) |

### P1.8 — AI Cost Optimization (in progress)

| Feature | Description |
|---|---|
| AI prompt truncation | Resume/job-description text capped (`OPENROUTER_MAX_RESUME_PROMPT_CHARS`/`OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`) before being sent to the paid AI call, reducing token usage on every stage-2 call. Keyword-gate scoring still sees full untruncated text (AD-23) |
| AI cost investigation | `docs/research/ai-cost-optimization-phase3.md` covers all 6 Task 12 areas; batching and adaptive (cheap-then-premium) model routing are designed but not implemented -- both are new-architecture changes needing explicit approval per CLAUDE.md |

### P2 — Medium Priority

| Feature | Description |
|---|---|
| Desired experience filter | User sets target years of experience; soft-filter on dashboard |
| App settings persistence | Key-value store for user preferences (app_settings table) |

### P3 — Low Priority

| Feature | Description |
|---|---|
| Analytics charts | Jobs over time, by source, by experience bracket, by company, score histogram |
| Status breakdown | Pie chart of jobs per workflow status |
| Job metrics (Phase 4 Task 13) | Remote %, salary averages by currency |
| Pipeline/scoring-queue/source-health dashboards (Phase 4 Task 13) | Surfaces Phase 1's `getSourceHealthReport`/`getScoringQueueReport` (previously backend-only) plus new scrape_runs-derived pipeline stats (duplicates skipped, failed runs, avg latency) on `/analytics` |

### P4 — Future / Experimental

| Feature | Description |
|---|---|
| Multi-agent orchestration | Background agent workflow for complex multi-step job analysis |

## 4. Out-of-Scope

| Feature | Reason |
|---|---|
| Multiple users / multi-tenancy | Single-user by design; no user_id columns |
| Automated job applications | Scope is discovery and triage, not application |
| Resume generation / editing | Platform assists skill tagging only |
| Cover letter generation | Out of scope for V1 |
| Interview preparation | Out of scope |
| Job board accounts (LinkedIn, Indeed) | No public API; scraping would violate ToS |
| Mobile application | Web-only; Telegram notifications serve mobile alerting |
| Team / recruiter features | Single-user tool |
| Real-time scraping (push) | Cron-based polling; no webhook from ATS sources |
| Geographies outside India / Singapore / UAE / Remote | Hardcoded in location_tags enum |

## 5. Phase Roadmap

```
P0 — Core (shipped)
 └── Resume, Role, Role Packs, Scraping, Scoring, Notifications, Dashboard, Status, Companies

P0.5 — Source Health (shipped)
 └── Phase A: repair 15 broken tokens, remove 10 dead sources
 └── Phase B: add 10 high-confidence sources (Binance, Samsara, Confluent, Okta, Glean, …)
 └── Phase 1B: add 4 Bangalore-focused sources (Hevo Data, HackerRank, CommerceIQ, Stable Money)

P1 — Insights (current priority)
 └── Skill gaps, Skill demand

P1.9 — Job Attributes & Personal Intelligence (v1.2, shipped)
 └── Deterministic job attribute extraction, notification exclude filters, notification preferences UI, Telegram highlight badges

P2 — Preferences
 └── Desired experience, App settings

P3 — Analytics
 └── Charts: jobs over time, by source, by experience, score histogram, status breakdown

P4 — Future
 └── Multi-agent workflow orchestration
```

## 6. Scope Boundaries

### Data Scope

- **Job sources:** Only the six integrated sources. New sources require a new adapter implementing the scraper interface.
- **Geographies:** India, Singapore, UAE, Remote. Adding a new geography requires a migration to extend the `location_tag` enum and updating the `tagLocations()` function.
- **Skill dictionary:** Fixed canonical list. New skills require updating `src/shared/domain/skillsDictionary.ts`.

### Integration Scope

- **AI provider:** OpenRouter only. Model is configurable via `OPENROUTER_MODEL` env var.
- **Notification channel:** Telegram only. Adding email/Slack would require new infrastructure implementations of the notification interface.
- **Storage:** Supabase Storage only (resumes bucket). No S3 or local filesystem.

### Deployment Scope

- **Web app:** Vercel only (Next.js serverless).
- **Cron jobs:** GitHub Actions only. No self-hosted cron or cloud scheduler.
- **Database:** Supabase (managed Postgres). No self-hosted Postgres support in V1.

## 7. Constraints

| Constraint | Impact |
|---|---|
| Single-user | No RLS per-user isolation; all authenticated requests share data |
| No real-time ATS webhooks | 2-hour scrape cadence; new jobs may be seen up to 2h late |
| LLM cost | AI scoring gated behind keyword threshold to control OpenRouter spend |
| Telegram rate limits | Bot API rate-limited; large notification batches may experience delay |
| PDF-only resumes | Other formats (DOCX, plain text) not supported |
| Manual company setup | Board tokens must be entered by user; no auto-discovery |
| Source validation scope | Only Greenhouse/Lever/Ashby board tokens validated; feed-based sources (RemoteOK, Wellfound, MyCareersFuture) not probed |
