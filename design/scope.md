# Project Scope

## 1. Problem Statement

Job seekers waste hours manually checking multiple job boards, comparing postings to their skills, and missing newly posted positions. The Job Intelligence Platform automates this workflow: continuous scraping, intelligent scoring against a user's actual resume, and proactive notification — so the user only sees postings that matter.

## 2. Target User

A single technical professional (software engineer, data scientist, or similar) who:
- Is actively or passively job-searching
- Has a resume in PDF or DOCX format
- Wants to monitor positions in India, Singapore, UAE, or remote globally
- Is comfortable with basic self-hosted setup (Supabase, Vercel, GitHub Actions)

## 3. In-Scope Features

### P0 — Core (Must Ship)

| Feature | Description |
|---|---|
| Resume upload & skill extraction | Upload PDF or DOCX, extract text (sha256 parse-once cache), tag skills from dictionary |
| Role selection & AI expansion | Define target role; expand to related roles via LLM or cache |
| Role Packs | Pre-defined curated role groups; click to instantly activate without AI call |
| Multi-source job scraping | Greenhouse, Lever, Ashby (per board_token), Wellfound, RemoteOK, Remotive, Himalayas, MyCareersFuture, JSearch, Adzuna (merge-workspace Phase 5; Remotive/Himalayas added in the remote/visa-sponsorship refocus) |
| Location filtering | Tag jobs by India / Singapore / UAE / Remote; drop untagged |
| Two-stage scoring | Keyword score (free) → AI score (gated) per job |
| Telegram notifications | Push alert for jobs above AI score threshold |
| Dashboard | Paginated, filterable, sortable job table with scores and statuses |
| Status workflow | Customizable workflow statuses (New, Viewed, Interested, Applied, Not Interested, Archived). Dashboard quick-action buttons (Not Interested/Viewed/Applied/Archive) set these four by label match; the per-job dropdown/sheet itself can be toggled off in `/settings/workflow` (`show_status_dropdown`), leaving a read-only badge and the quick-action buttons as the only status control |
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
| Notification preferences | Configurable include filters: role, skill, location, experience, source — applied before Telegram delivery; editable via `/settings/notifications` (continuous-improvement pass -- the backend action predated this UI) |
| Company/employment-type/keyword mute | `excludeCompanies`/`excludeEmploymentTypes`/`excludeKeywords` on `NotificationPreferences` mute Telegram alerts; all three are also enforced on the dashboard job list (`JobFilters.excludeCompanies`/`excludeEmploymentTypes`/`excludeKeywords`), so a mute is a genuine "never show me this," not just a quieter alert |

### P1.9 — Ranking & Search (continuous-improvement pass, shipped)

| Feature | Description |
|---|---|
| Composite ranking score | `overall_score = ai_score + configurable bonuses` (preferred company, remote preference, salary disclosed), computed once per job at scoring time (`computeOverallScore.ts`); drives the dashboard's default sort (`posted_at desc` remains the tiebreaker, covering freshness). Deterministic, no ML/embeddings. Editable via `/settings` → Ranking |
| Dashboard text search | Free-text filter over title/company name (`JobFilters.search`), sanitized the same way as the existing role-filter builder |

### Skipped for this pass (Theme 3 — Job Metadata)

Investigated and explicitly not implemented: benefits/bonus/equity/stock-option tags, certifications,
travel requirement, shift work, languages, domain classification, company size, industry, and
startup/public-private detection. None have any existing schema/extractor groundwork, and free-text
heuristics for most of them (industry, company size, startup-vs-established, public/private) would
be low-confidence guesses rather than deterministic parses -- a worse fit for this repo's "deterministic
parsing, no AI" extraction standard than `extractSalary`/`extractContactEmail`. See
`docs/reviews/2026-07-04/theme-3-job-metadata.md` for the full evaluation.

### P1.6 — Pipeline Reliability (shipped)

| Feature | Description |
|---|---|
| Cross-source duplicate detection | Deterministic fingerprint (normalized title + canonical company + location) prevents the same logical job scraped from two sources from becoming two rows, two scoring runs, or two notifications; provenance preserved in `job_duplicates` |
| Company name normalization | `jobs.canonical_company_name` strips legal-entity suffixes (LLC/Inc/Corp) and regional qualifiers (India/Singapore/...) from `company_name` for grouping, without discarding the original |
| Source-level health summary | `computeSourceHealthSummary`/`getSourceHealthReport` derive success rate, latency, consecutive failures, recovery detection, staleness (no run at all in `SOURCE_STALE_HOURS`, default 6h -- distinct from actively failing), and a deterministic recommendation per source from `scrape_runs` -- covers feed-based sources (wellfound/remoteok/mycareersfuture) that `companies.health_status` can't see. Surfaced on `/analytics` (Phase 4) |
| Scrape failure classification | `classifyScrapeFailure.ts` tags every failed/empty scrape_runs row with a deterministic category (timeout/parsing/selector/captcha/blocked/authentication/rate_limited/not_found/empty_feed) |
| Pending-scoring queue monitoring | `getScoringQueueReport`/`computeScoringQueueSummary` surface AI-retry queue depth, oldest-pending age, stuck jobs, and retry counts (`job_scores.retry_count`, `upsert_job_score` RPC); logged by `score.ts` each run. Surfaced on `/analytics` (Phase 4) |

### P1.7 — Enrichment (shipped)

| Feature | Description |
|---|---|
| Career page discovery | `discoverAtsCareerPages`/`company_career_pages` -- deterministic careers-page URL for every ATS-registry (greenhouse/lever/ashby) company, keyed by canonical company name. Aggregator-sourced companies (wellfound/remoteok/mycareersfuture) not yet covered -- see `docs/decisions.md` AD-20 |
| Contact email extraction | `extractContactEmail` categorizes the best contact email per job (recruiter/hr/hiring_manager/company_contact + confidence), stored on `jobs.contact_email*`. Plain-text/regex only -- mailto:-only addresses not in visible text are not extracted (AD-21) |
| Salary extraction | `extractSalary` normalizes currency/min/max/period/confidence from title+description (₹/$/S$/Rs symbols, USD/INR/SGD/AED codes, India-specific LPA/lakh units, yearly/monthly/hourly periods), stored on `jobs.salary_*`. Deterministic regex only, no AI (AD-22) |

### P1.11 — Job Attributes & Personal Intelligence (shipped, v1.2)

| Feature | Description |
|---|---|
| Job attribute extraction | `extractJobAttributes` deterministically tags employment type (internship/contract/freelance/temporary/part_time/full_time), seniority (executive/principal/lead/senior/entry/mid), work arrangement (hybrid/onsite), visa sponsorship, relocation assistance, security clearance, and urgent hiring from title+description at ingest, stored on `jobs.employment_type` etc. Regex-only, no AI |
| Eligibility verdict | `classifyEligibility` runs at ingest and stores `jobs.ineligible_reason` (`geo_locked` / `no_sponsorship` / null). Drives the dashboard's default-on "can apply" filter, keeps hard-excluded jobs permanently out of the scoring queue, and feeds the stats breakdown. Refreshed by `npm run backfill:eligibility` (AD-51) |
| Unsponsored-foreign ingest filter | Optional `skip_unsponsored_foreign_jobs` setting: discards UAE/Singapore onsite/hybrid postings that *explicitly* refuse sponsorship before they are stored. Off by default; "unknown" sponsorship is always kept (AD-51) |
| Notification exclude filters | `NotificationPreferences.blockedCompanies` / `excludeEmploymentTypes` -- companies or employment types the user never wants alerted, ANDed with the existing include filters |
| Notification preferences UI | `/settings/notifications` "Notification filters" card -- the P1.5 filters (previously only settable via direct `app_settings` write) plus the new exclude filters are now editable end-to-end |
| Telegram "why this job" highlights | `buildJobHighlights` renders remote/urgent/salary/employment-type badges on both the individual-match and digest message formats, derived from data already computed at ingest (no extra AI calls) |

### P1.8 — AI Cost Optimization (in progress)

| Feature | Description |
|---|---|
| AI prompt truncation | Resume/job-description text capped (`OPENROUTER_MAX_RESUME_PROMPT_CHARS`/`OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`) before being sent to the paid AI call, reducing token usage on every stage-2 call. Keyword-gate scoring still sees full untruncated text (AD-23) |
| AI cost investigation | `docs/research/ai-cost-optimization-phase3.md` covers all 6 Task 12 areas; batching and adaptive (cheap-then-premium) model routing are designed but not implemented -- both are new-architecture changes needing explicit approval per CLAUDE.md |

### P1.10 — Production Verification & Health Framework (v1.4, shipped)

| Feature | Description |
|---|---|
| Generic verification framework | `src/features/verification/` -- a project-agnostic `Check`/`CheckResult` interface, `runChecks()` runner, and `computeHealthScore()` aggregator (PASS/WARNING/FAIL -> `ready`/`needs_attention`/`not_ready`). Domain/application layers have zero project-specific logic (docs/decisions.md AD-27) |
| 26 concrete checks | Infrastructure (6): env vars, Supabase connectivity, migrations, RLS, storage, workflow config. Application (8): source health, stale sources, scoring queue, duplicate pipeline, notification pipeline, dashboard reachability, extraction-services smoke-test, active-singleton invariants. External (4): OpenRouter, Telegram, Telegram webhook registration, source fallback config. Data quality (8): duplicate fingerprints, missing fields, invalid salary/emails, broken career URLs, inconsistent scores, stale jobs, queue integrity |
| Reporting | Markdown + JSON reports (`verification-reports/latest.{md,json}`, gitignored) plus a console summary, all from the same pure formatter functions |
| Severity/diagnostics refinement (v1.x operational-excellence pass) | Per-outcome `severityOverride` (avoids one missing env var being penalized a dozen times across dependent checks); structured `probableCause`/`suggestedFix`/`affectedSubsystem`/`docReference` on every non-pass result instead of one ad hoc string; deduplicated recommendations list (docs/decisions.md AD-28) |
| CLI commands | `npm run verify:production` (full run + files), `npm run diagnostics` (console-only quick check) |
| CI readiness | `.github/workflows/verify-production.yml`, `workflow_dispatch`-only (no schedule -- Phase 9 explicitly excluded new deployment automation) |

### P1.12 — AI Resume Suggestions (merge-workspace Phase 3; UI wired post-audit closure)

| Feature | Description |
|---|---|
| AI resume coaching | `suggestResumeImprovementsAction` proposes concrete, non-fabricated improvements (Impact/Skills/Keywords/Clarity/Formatting categories) for the active resume via a provider-agnostic LLM client (`openrouter` default -- same key as job scoring, decisions.md AD-42; `gemini`/`anthropic` direct optional -- `LLM_PROVIDER`). Long resumes are chunked rather than truncated (decisions.md AD-33) |
| Apply as new version | `applyResumeSuggestionsAction` rewrites the resume with chosen suggestions and saves it as a brand NEW resume version via the existing `set_active_resume` path -- never overwrites the current version |
| UI | `/resume`'s "AI suggestions" card (`ResumeSuggestionsCard`) lets the user request suggestions for an optional target role, check off which ones to apply, and apply them as a new version in one action. Wired in the post-audit closure session (`docs/decisions.md` AD-38) -- previously backend-only |

### P1.13 — Application Drafting (merge-workspace Phase 4; cover-letter UI wired post-audit closure)

| Feature | Description |
|---|---|
| AI application drafts | `draftApplicationAction` generates a truthful, non-fabricated email or cover-letter draft (`kind`) for one job against the active resume, via the same provider-agnostic `llmClient` (`gemini` default, `anthropic` optional) resume suggestions uses (decisions.md AD-32/AD-34). Persisted as one `applications` row per `(job, kind)`, pre-filled with the job's extracted contact email if one exists |
| Review and edit | User reviews the draft in a `/dashboard` dialog, edits subject/body (`updateApplicationContentAction`), regenerates, or dismisses it -- nothing is sent without this step. An Email / Cover letter toggle in the same dialog lets the user switch `kind` and review each independently (`docs/decisions.md` AD-38) -- previously the dialog only ever passed `kind: "email"` |
| Mailto-only send | "Open in mail client" opens a `mailto:` link (`buildMailtoLink`) in the user's own mail client; `markApplicationSentAction` only records that this happened -- the app never sends email itself (no SMTP, no email API) |
| Status tracking | `draft` → `sent` (terminal) or `draft` → `dismissed` (redraftable); a sent application can never be redrafted or edited |
| Pending-drafts reminder | `notifyPendingDrafts` sends a Telegram reminder listing draft applications awaiting review, reusing the same `TelegramSender` delivery infra the job digest already uses -- not a new notification channel |

### P1.14 — Additional Job Sources (merge-workspace Phase 5)

| Feature | Description |
|---|---|
| JSearch connector | Aggregator API (RapidAPI) indexing Google for Jobs -- surfaces LinkedIn/Indeed/Glassdoor/company listings through one legal API, not direct scraping of those sites. Query/country search, capped at 2 terms x configured countries per run (default `in,sg,ae`). Rejects entries with no genuine, stable `job_id` rather than falling back to an apply-link-derived one (jobhunt bug #4) |
| Adzuna connector | Same query/country search shape as JSearch. Adzuna does not cover the UAE, so only India/Singapore of the platform's three target regions are reachable through it (`design/limitations.md` §1.1) |
| Static careers-URL fetcher | `scripts/scrape-careers-url.ts` (`npm run scrape:careers-url -- <url>`) fetches one operator-provided public careers page and LLM-extracts listed roles (`LlmCareersPageExtractor`, reusing the Phase 3 `llmClient`). Manual-trigger only -- not on `scrape.ts`'s cron loop/`registry.ts` (`design/architecture.md` §4.2, `docs/decisions.md` AD-35) |

### P1.15 — Resume Version Restore (post-audit closure)

| Feature | Description |
|---|---|
| Version history | `/resume`'s "Version history" card lists every resume version (`ResumeRepository.listVersions()`), newest first, with upload date and origin ("Uploaded" if it has a `content_hash`, "AI-applied" if it was produced by P1.12's apply-suggestions flow) |
| Restore | `restoreResumeVersionAction` makes an old version active again by re-running `set_active_resume` seeded with that version's exact content -- never mutates or deletes the old row, so history stays intact and restoring is itself just another new version |

### P1.16 — Design System Pass (design handoff integration, 2026-07-27)

Applies the `Dashboard Optimization` handoff to the six screens that already exist. No new screens, no
new routes, no data-model change — the handoff describes how the shipped product should look, not a
different product.

| Feature | Description |
|---|---|
| Accent token | `--primary` becomes `oklch(0.5 0.1 264)` indigo, replacing shadcn's near-black neutral. One variable; every `bg-primary`/`text-primary`/`accent-primary` call site inherits it (decisions.md AD-54) |
| Documented token set | Colour, radius, spacing, and type scale written down in `design/tech-stack.md` §8 — previously undocumented anywhere |
| Insights card order | "In demand" leads, "Level up" follows (decisions.md AD-55) |
| Score badge legend | Pending state collapses to a single `Pending · N%` pill; bands documented in `design/user-guide.md` §4 (decisions.md AD-56) |
| Presentation-layer conventions | Composition, navigation surfaces, state ownership, and loading/empty/error rules written down in `design/architecture.md` §12 |
| Dashboard stat chips | The stats row becomes bordered value-over-label chips; the AI-scored chip is accent-tinted as the row's key metric |
| Dashboard filter toolbar | One bordered container with divider-separated groups (search / selects / numeric ranges / toggles / clear) instead of a loose wrap |
| Sidebar active state | The desktop sidebar previously highlighted nothing; `SidebarNav` renders one active item, accent-tinted at 600 weight |
| Single nav source | `BottomNav` reads `NAV_ITEMS` instead of its own drifted copy; orphaned `MobileNav.tsx` deleted (limitations.md §10.4) |
| Logo + wordmark | `Wordmark` component — near-black rounded square with a bold white "J", product name beside it |
| Resume dropzone | Drag-and-drop with a "Browse files" fallback and a selected-file row (limitations.md §10.7) |
| Role chips | Selected related-role chips carry the accent tint at 600 weight; unselected stay plain outlined grey |
| Tokenised error boundaries | `error.tsx` / `global-error.tsx` rebuilt on design tokens so they inherit the accent (limitations.md §10.2) |
| Dashed "+ Add" chips | Roles gains a trailing "+ Add role" chip (custom roles join the list already selected); Resume's skills editor gains a matching "+ Add skill" chip, replacing the separate input row |
| Insights percentages | Skill rows lead with a percentage rather than `count / total`; the raw counts stay on hover |
| Resume card caption | "Extracted skills" card gains a `{type} · parsed {n}h ago` caption (AD-59) |
| Distinct nav landmarks | The two primary `<nav>` elements no longer share one `aria-label` — both sit in the DOM at all times, and duplicate landmark names are ambiguous to a screen reader |

**Deferred, not built** (each recorded with a reason rather than left as an implied to-do):

| Deferred item | Why | Tracked in |
|---|---|---|
| Per-source enable/disable toggles on `/settings` | Needs a persistence layer, a `scrape.ts` read, and a decision about already-scraped jobs — a data-model change, not a visual one | AD-57, limitations.md §10.1 |
| Runtime theming (accent hue / corner style / density props) | Three settings for a single user who has already picked the defaults | AD-54, tech-stack.md §8 |
| Mobile chart subsetting on `/analytics` Overview | Real perceived-performance win, but no measurement yet showing it matters at current data volume | limitations.md §10.5 |
| Score-badge bands derived from `NOTIFY_THRESHOLD` rather than duplicated constants | Needs the env value threaded to the dashboard; the constants carry a pointer comment meanwhile | AD-56, limitations.md §10.3 |
| Formal accessibility audit (axe/Lighthouse in CI) | Conventions are followed by habit; no automated verification | limitations.md §10.6 |
| Analytics Overview as a 2×2 chart grid | The handoff's Analytics assumes a different tab IA; all four charts already exist on other tabs, and moving them is a product change, not a visual one | AD-58, limitations.md §10.5 |
| Resume "Reprocess" button | Would promise re-parsing that AD-30's parse-once cache never does; the honest version ("re-extract skills") is a new server action needing its own change | AD-59, limitations.md §10.7 |
| Mobile chart subsetting within the Breakdown tab | Real perceived-performance idea, but unmeasured at current data volume | limitations.md §10.5 |

### P1.17 — UI/UX Audit Remediation (2026-07-29)

Follows P1.16. Where that pass applied a *look* to the six existing screens, this one fixes how they
*behave* — the interaction defects the design pass surfaced but did not touch. Again no new screens,
no new routes, no data-model change, and no new server action.

| Feature | Description |
|---|---|
| Dashboard keyboard shortcuts | Roving row focus with `↑`/`↓`, `R` not interested, `A` archive, `D` details, scoped to the one focused row, guarded against modifiers and text entry, and printed on screen as a `<kbd>` legend. Replaces a per-row `window` listener that fired every shortcut on every job (decisions.md AD-60, use-cases.md UC-02a) |
| Enter applies a filter | Search, min-score and max-years commit on Enter as well as on blur — via a real `<form onSubmit>`, in both the desktop toolbar and the mobile sheet — and navigate once for both. Same for the Roles screen's primary-role input, where Enter triggers Expand |
| Mobile status sheet parity | `JobStatusSheet` becomes controlled: it closes on select, shows the new status immediately, and rolls back on failure — the contract `JobStatusSelect` already had on desktop |
| Route loading skeletons | `/dashboard`, `/roles`, `/resume`, `/insights` gain `loading.tsx`; all six protected routes now have one (architecture.md §12.4) |
| Product typography | IBM Plex Sans, self-hosted via `next/font` and mapped onto Tailwind's `--font-sans` token — replaces "whatever sans the OS supplies" under a design system specified at `text-xs` (tech-stack.md §8) |
| Error vs empty on company history | A failed lookup renders the error and a retry hint instead of "No prior applications found." |
| Accessibility fixes | `aria-expanded` on the desktop row expander, `aria-label` on the reject/archive icon buttons, `JobCard`'s checkbox un-nested from its `<button>`, and the draft dialog's mailto link made genuinely inert while pending (architecture.md §12.5) |
| De-duplicated presentation logic | `formatScore` and the AD-56 score bands move to one `jobScore.ts` consumed by both the desktop badge and the mobile pill; icon buttons use the existing `size="icon-sm"` / `buttonVariants` instead of hand-rolled classes |
| Component test layer | First DOM-level tests: jsdom + Testing Library, opted into per file so the ~1000 node tests keep their speed (decisions.md AD-61, tech-stack.md §8) |

**Deferred, not built:**

| Deferred item | Why | Tracked in |
|---|---|---|
| Keyboard shortcuts on the mobile card list | No focused-row concept to scope a keystroke to, and no keyboard to press it with | AD-60, limitations.md §10.8 |
| Full ARIA grid semantics on the job table (`role="grid"`, `Home`/`End`, cell navigation) | Changes how every row is announced, for navigation keys nobody has asked for | limitations.md §10.8 |
| `<form>`-based commit for `AddRoleChip` | Needs Escape-to-cancel, which a form doesn't provide; keeping both mechanisms for one field is worse than the exception | limitations.md §10.9 |
| Dark mode | The `.dark` token set exists and nothing toggles it — a deliberate one-fixed-theme choice, not an oversight | AD-54, tech-stack.md §8 |

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
| Automated job applications (auto-submitting without a human sending it) | The app never sends an application on its own behalf -- AI may draft an email/cover letter for review (`src/features/applications/`, decisions.md AD-34), but sending is always the user opening a `mailto:` link in their own mail client, never a server-side send |
| Auto-apply / auto-send applications | AI may draft or suggest content; the user always reviews and applies manually (decisions.md AD-33/AD-34; carried over from jobhunt-app's "no auto-apply" design rule) |
| SMTP / server-side email sending | "mailto only for now" (decisions.md AD-34) -- no email credentials are stored or used by this app |
| Interview preparation | Out of scope |
| Job board accounts (LinkedIn, Indeed) | No public API for direct scraping; scraping those sites ourselves would violate ToS. JSearch (P1.14) is a licensed third-party aggregator API that indexes Google for Jobs -- it surfaces listings originally posted on LinkedIn/Indeed/Glassdoor without this app ever scraping those sites itself, the same distinction jobhunt-app's own design rules draw |
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

P1.10 — Production Verification & Health Framework (v1.4, shipped)
 └── Generic Check[] runner, 26 infra/application/external/data-quality checks, health score + Markdown/JSON/console reports, verify:production/diagnostics CLI, CI-ready workflow_dispatch

P1.13 — Application Drafting (merge-workspace Phase 4, shipped)
 └── AI draft (email/cover letter), review + edit, mailto-only send, status tracking, Telegram pending-drafts reminder

P1.14 — Additional Job Sources (merge-workspace Phase 5, shipped)
 └── JSearch + Adzuna connectors (cron-driven), static careers-URL fetcher (manual-trigger only)

P1.16 — Design System Pass (design handoff, shipped)
 └── Indigo accent token, documented token set, stat chips, filter toolbar, sidebar active state, single nav source

P1.17 — UI/UX Audit Remediation (shipped)
 └── Row-scoped keyboard shortcuts, Enter-to-apply filters, controlled mobile status sheet, four route skeletons, IBM Plex Sans, a11y fixes, first component-test layer

P2 — Preferences
 └── Desired experience, App settings

P3 — Analytics
 └── Charts: jobs over time, by source, by experience, score histogram, status breakdown

P4 — Future
 └── Multi-agent workflow orchestration
```

## 6. Scope Boundaries

### Data Scope

- **Job sources:** Only the ten cron-driven integrated sources (Greenhouse, Lever, Ashby, Wellfound, RemoteOK, Remotive, Himalayas, MyCareersFuture, JSearch, Adzuna) plus two manual-trigger-only sources: the static careers-URL fetcher (`careers_url`) and the "Claude routine" import (`claude_routine`, `scripts/import-manual-matches.ts` — docs/tasks/manual-job-matches.md, AD-65). New cron sources require a new adapter implementing the `JobSourceScraper` interface and registration in `registry.ts`.
- **Second data origin:** `/dashboard` has a Scraper/Claude-routine toggle (`origin` search param) so ad hoc, more-trusted matches from the "Claude routine" — an interactive Claude Code session that searches/reads/scores job listings, previously written only to the separate `job-match-tracker` repo's browser-localStorage `state.json` — are visible alongside the automated pipeline's matches without a second dashboard or touching scraper data. The two never collide (dedup key `(source, source_job_id)`); no truncation of `jobs` is required or supported by this feature.
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
| PDF/DOCX-only resumes | Plain text, HTML, and other formats not supported |
| Manual company setup | Board tokens must be entered by user; no auto-discovery |
| Source validation scope | Only Greenhouse/Lever/Ashby board tokens validated; feed/API-based sources (RemoteOK, Wellfound, MyCareersFuture, JSearch, Adzuna) not probed by `validate-sources.ts` -- `sourceFallbackConfigCheck` (verify-production) covers a narrower "credentials vs. *_DISABLED contradiction" check for the API-key-gated ones instead |
