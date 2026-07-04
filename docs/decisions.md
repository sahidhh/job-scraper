# Architectural Decisions

Numbered for reference (ADR-style). Each records the decision, why, alternatives considered, and consequences.

---

### AD-01: Single-user app with simple Supabase Auth (email/password)

**Decision:** One user account, Supabase Auth email/password, no `user_id` columns anywhere.

**Rationale:** This is a personal tool. Multi-tenancy adds `user_id` to every table, RLS policies per table, and signup/invite flows for zero benefit. A bare no-auth option was rejected because the dashboard will be deployed publicly on Vercel — a login screen is the minimum needed to keep it private.

**Alternatives considered:** No auth at all (rejected — public URL with no protection); full multi-tenant Supabase Auth (rejected — unnecessary complexity for one user).

**Consequences:** Schema is simpler (no ownership columns/joins). If multi-user is ever needed, every table needs a migration to add `user_id` plus RLS rewrites — accepted as unlikely and out of scope.

---

### AD-02: Feature-based folders, clean-architecture layers *within* each feature

**Decision:** `src/features/<feature>/{domain,application,infrastructure}` instead of top-level `src/{domain,application,infrastructure}/<feature>`.

**Rationale:** Top-level layer folders scale poorly — each grows into a flat bag of unrelated feature code, and understanding one feature means jumping between three distant directories. Feature-first folders keep everything about "scoring" or "roles" colocated, while still enforcing the domain/application/infrastructure dependency direction (AD-03) within each feature.

**Alternatives considered:** Classic top-level clean architecture layers (rejected — poor cohesion at this project's size); no layering at all, just feature folders with mixed concerns (rejected — violates "repository pattern" and "no duplicated logic" requirements, makes use-cases untestable without a live Supabase connection).

**Consequences:** Slightly more directories per feature (3 vs 1), but each is small and each feature is independently understandable.

---

### AD-03: Repository pattern — interfaces in `domain`, Supabase implementations in `infrastructure`

**Decision:** Every feature needing persistence defines a `XRepository` interface in `domain/`; `application` use-cases depend on the interface; `infrastructure` provides the Supabase-backed implementation; `presentation` (pages, server actions, `scripts/*.ts`) is the composition root that wires concrete implementations into use-cases.

**Rationale:** Decouples business logic (scoring math, role expansion, location filtering, dedup) from Supabase specifics, enabling unit tests with mock repositories. Also directly satisfies the "repository pattern" and "no duplicated logic" requirements — the dashboard and the cron scripts call the *same* use-cases with the *same* repositories.

**Alternatives considered:** Direct Supabase client calls inside use-cases (rejected — untestable, couples business logic to a specific client/version); a generic ORM-style data layer (rejected — premature abstraction for ~8 tables).

**Consequences:** One interface + one implementation per persisted feature (≈7 repositories total, per `repositories.md`) — a fixed, small amount of boilerplate in exchange for testability.

---

### AD-04: Scraping/scoring/notification run as standalone scripts via GitHub Actions cron, not API routes

**Decision:** `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` run via `tsx` in a scheduled GH Actions workflow, using the Supabase service role key directly.

**Rationale:** Decouples the pipeline from the Next.js deployment — it runs whether or not Vercel is up, and isn't subject to serverless function timeout limits (scraping 5 sources × N companies can take longer than typical serverless limits). Scripts import the same `src/features/*` code as the app, so there's no logic duplication despite being a separate entrypoint.

**Alternatives considered:** GH Actions cron hitting Next.js API routes (rejected — adds deployment as a hard dependency for the pipeline and risks serverless timeouts on long scrape runs).

**Consequences:** Two execution contexts to keep in sync on shared config/env handling (`shared/config` reads from `process.env` in both — no special handling needed since both run in Node).

---

### AD-05: User-maintained `companies` config table for Greenhouse/Lever/Ashby

**Decision:** A `companies` table (editable via `/settings`) lists `(source, board_token)` pairs to scrape. RemoteOK/Wellfound need no such config — they expose feed-style endpoints covering many companies.

**Rationale:** There is no public directory of "every company using Greenhouse/Lever/Ashby" — these ATS's board tokens must be known in advance. A config table is the simplest correct solution and doubles as the mechanism for the user to curate which companies matter to them.

**Alternatives considered:** Attempting to crawl/discover board tokens (rejected — no reliable source, high risk of scraping unrelated/irrelevant company boards).

**Consequences:** The user must add companies manually over time via `/settings`. Coverage of Greenhouse/Lever/Ashby is only as good as this list — an inherent, accepted limitation of these sources for a personal tool.

---

### AD-06: Role expansion — static map with AI fallback, cached permanently

**Decision:** `role_expansion_map` table seeded with common role clusters; unseen roles trigger one OpenRouter call, and the result is cached (`source='ai'`) so it's never re-requested.

**Rationale:** Satisfies "AI usage minimized" — the AI is a one-time cost *per distinct role string ever entered*, not per role-selection or per cron run. Most usage will hit the seeded map for free.

**Alternatives considered:** Pure static map (rejected — would silently fail/return nothing for roles not anticipated at seed time); AI on every role selection (rejected — wasteful, role choices repeat over time).

**Consequences:** `role_expansion_map` grows slowly over time as new roles are tried; no cache invalidation/expiry — if related-role conventions "should" change, the cached row must be manually edited/deleted (acceptable for a personal tool, revisit only if it becomes annoying).

---

### AD-07: Two-stage scoring — keyword overlap gates AI refinement

**Decision:** Stage 1 (keyword/skill-dictionary overlap, `features/scoring`) runs for every candidate job, free and instant. Stage 2 (OpenRouter call) runs only when `keyword_score >= KEYWORD_THRESHOLD` (default 0.5).

**Rationale:** Directly implements "OpenRouter only used for high-confidence matches" — stage 1 is the confidence filter. Bounds AI spend to a small, predictable fraction of total scraped jobs (those already skill-relevant), while every job still gets *some* score for dashboard sorting.

**Alternatives considered:** Embedding-based similarity as stage 1 (rejected — adds an embeddings API dependency/cost for marginal accuracy gain over dictionary overlap, given the role-title pre-filter already narrows candidates); AI for every job (rejected — violates "AI usage minimized").

**Consequences:** Jobs with `keyword_score < 0.5` never get an `ai_score`, even if they'd plausibly be a good fit despite low dictionary overlap (e.g. resume/job phrase things differently). Accepted tradeoff — the skills dictionary (AD covers resume parsing too) is the single point of truth for "what counts as a skill," so improving its coverage improves both stages.

---

### AD-08: Notification idempotency via `notifications_log`, gated on `ai_score`

**Decision:** A job is notified at most once, ever, tracked via a `unique(job_id)` table. Only jobs with `ai_score >= NOTIFY_THRESHOLD` (default 0.75) qualify — `ai_score is null` never qualifies (SQL null comparison is false), regardless of `keyword_score`.

**Rationale:** Prevents duplicate Telegram messages across cron runs (the core idempotency requirement). Gating on `ai_score` specifically (not `keyword_score`) means only AI-refined high-confidence matches page the user — matching the spec's "send Telegram notifications for new matches" in the context of the high-confidence AI scoring stage.

**Alternatives considered:** Gate on `keyword_score` instead (rejected — would notify on the cheap signal alone, defeating the purpose of stage 2); allow re-notification if score improves on a later run (rejected — `job_scores` rows aren't re-computed per role_selection anyway, so "improves" doesn't naturally occur; adds complexity for a case that doesn't arise).

**Consequences:** A job whose stage-2 AI call failed (`ai_score` stays null, per `scoring.md` §3) will never be notified unless a future manual re-score feature is added. Acceptable — AI call failures are expected to be rare (timeout + 1 retry).

---

### AD-09: "Single active" resume/role_selection via partial unique index + Postgres RPC swap

**Decision:** `resumes.is_active` and `role_selections.is_active` each have a partial unique index (`where is_active = true`). Activating a new row is done via a Postgres function (`set_active_resume`, `set_active_role_selection`) that deactivates the old row then inserts/activates the new one, called via `supabase.rpc()`.

**Rationale:** Keeps history (old resumes/role selections aren't deleted) while guaranteeing exactly one "current" row at the DB level — invariant holds even if the app crashes mid-operation (worst case: zero active rows, recoverable, never two). The Supabase JS client doesn't support multi-statement client-side transactions, so the atomic swap must live in the DB as a function.

**Alternatives considered:** App-level "select then two updates" without a DB function (rejected — a crash between updates could leave two active rows, violating the invariant the unique index is meant to enforce — though the index would actually reject it; more precisely, it could leave the operation half-done with an error and an inconsistent intermediate state); a single `current_resume_id`/`current_role_selection_id` pointer in a settings table instead of `is_active` flags (rejected — slightly more indirection for no real benefit at this scale).

**Consequences:** Two small Postgres functions to maintain as part of the migration set (documented in `database.md` §7, defined in their own migration file).

---

### AD-10: Wellfound scraper is defensive-by-design, isolated from the rest of the pipeline

**Decision:** The Wellfound adapter validates response shape before mapping and returns `[]` (logging a warning, recording `scrape_runs.status = 'failed'`) rather than throwing, if the unofficial feed's structure doesn't match expectations.

**Rationale:** Wellfound has no documented public API, so its response format is the least stable input to the system. Per-source isolation (AD-04's sibling concern, detailed in `scrapers.md` §4) already prevents one source's failure from blocking others — this decision makes that failure mode *expected and silent* specifically for Wellfound, rather than a recurring error needing investigation.

**Alternatives considered:** Treat Wellfound the same as the ATS sources (rejected — would generate noisy failures disproportionate to the source's value); drop Wellfound entirely (rejected — explicitly requested in the spec).

**Consequences:** If Wellfound's feed structure changes, the system degrades to "zero Wellfound jobs" silently (visible only via `scrape_runs.status='failed'` in `/settings`) rather than failing loudly — accepted given this source is the most likely to need future maintenance regardless.

---

### AD-11: Forward-only migrations, no down-migrations

**Decision:** `supabase/migrations/` contains only forward changes; reverting a change means writing a new forward migration that undoes it.

**Rationale:** Down-migrations are rarely run correctly in practice and add authoring overhead for every migration on a project with one environment (production) and one developer. Forward-only is simpler and matches how the project will actually be operated.

**Alternatives considered:** Standard up/down migration pairs (rejected — overhead not justified for a single-environment personal project).

**Consequences:** No automated rollback path; mistakes are fixed by new migrations. Acceptable given the schema is small and changes are infrequent.

---

### AD-12: RLS enabled with service-role bypass for cron, authenticated-role policy for the app

**Decision:** RLS is enabled on all tables. A single policy per table grants full access to the `authenticated` role (the one Supabase Auth user). `scripts/*.ts` use the **service role key**, which bypasses RLS entirely.

**Rationale:** Satisfies Supabase best-practice (RLS on by default) without per-row ownership complexity (AD-01 — no `user_id` to check). The service role key is appropriate for trusted server-side cron jobs that need unrestricted read/write across all tables (e.g. `notify.ts` joining `jobs`, `job_scores`, `notifications_log`).

**Alternatives considered:** RLS disabled entirely (rejected — Supabase/security best practice, and the dashboard's anon/authenticated key should not have unrestricted access by default even with one user); per-table custom policies beyond "authenticated = full access" (rejected — no ownership model exists to key policies on).

**Consequences:** The service role key must be kept out of any client-exposed code/env (`NEXT_PUBLIC_*`) — it lives only in GH Actions secrets, per `architecture.md` §5 dependency rules (only `infrastructure`/composition-root code touches it, and only in the `scripts/` entrypoint, never in `app/`).

---

### AD-13: `scrape_runs.status = 'partial'` descoped — `scrape.ts` writes only `success`/`failed` for now

**Decision:** `scripts/scrape.ts` records `scrape_runs.status` as `'success'` (adapter call completed without throwing) or `'failed'` (adapter threw) per source per run. The `'partial'` value stays in the `scrape_run_status` enum (no migration needed, AD-11 forward-only) but no code path writes it yet.

**Rationale:** `scrapers.md` §4 originally documented `'partial'` as "some companies/items failed but at least one succeeded (Greenhouse/Lever/Ashby only)." Producing it correctly requires `JobSourceScraper.fetchJobs` to report per-company success/failure counts back to `scripts/scrape.ts`, instead of the current per-company `console.warn`-and-continue inside each adapter. That's a `domain`-interface change (`JobSourceScraper.fetchJobs` return shape) touching all three ATS adapters plus `scrape.ts` — architect-level per `agent-profiles.md`, and out of scope for a no-scraper-changes/no-schema-changes merge-conditions pass.

**Alternatives considered:** Approve the `fetchJobs` signature change now (rejected — scraper/domain change, out of scope for this pass); drop `'partial'` from the enum (rejected — schema change requiring a migration, and AD-11 forward-only means it would persist on any historical rows regardless).

**Consequences:** `scrape_runs.status` is effectively binary (`success`/`failed`) until a future architect-approved `JobSourceScraper.fetchJobs` change adds per-company failure reporting. `docs/scrapers.md` §4 and `docs/database.md` note `'partial'` as reserved/not-currently-produced so the docs and schema don't silently diverge (`review-process.md` §4.2).

### AD-14: Lower keyword-gate default and make null `ai_score` rows retryable (supersedes AD-07/AD-08 null handling)

**Decision:** `KEYWORD_THRESHOLD` default lowered from `0.5` to `0.25` (still env-overridable). `SupabaseScoreRepository.insertScore` now upserts with `ignoreDuplicates: false`, so a conflicting `(job_id, role_selection_id)` row has `keyword_score`/`ai_score`/`ai_reasoning` updated rather than left untouched. `JobRepository.findUnscored` now returns jobs with no `job_scores` row **or** with an existing row where `ai_score IS NULL`, so stage 2 is retried on later `score.ts` runs.

**Rationale:** With the prior `0.5` default, real-world skill-overlap scores rarely cleared the gate, so stage 2 (OpenRouter) almost never ran and `ai_score` stayed `null` for nearly all jobs. Combined with `ignoreDuplicates: true` and `findUnscored` excluding any job with an existing `job_scores` row, this made every null `ai_score` permanent with no retry path — silently breaking the AI-scoring stage and, downstream, notifications (AD-08).

**Alternatives considered:** Raising AI usage by scoring every job regardless of keyword overlap (rejected — violates AD-07's "AI usage minimized" intent); adding a separate "retry" RPC/cron (rejected — unnecessary, `findUnscored`'s existing anti-join shape extends naturally to a `WHERE ai_score IS NULL OR no row` condition).

**Consequences:** More jobs reach stage 2 per run (bounded by role-title filter + `keyword_score >= 0.25`), a small, predictable increase in OpenRouter calls. Jobs whose AI call fails are retried indefinitely until they succeed or their `keyword_score` drops below the gate on a future re-run — no permanent-null dead end. AD-08's notification gate (`ai_score >= NOTIFY_THRESHOLD`) is unchanged but is no longer permanently blocked by a one-time AI failure. The GitHub Actions `vars.KEYWORD_THRESHOLD` repo variable, if set, still overrides this code default and must be lowered/unset for the change to take effect in CI.

### AD-15: Role-aware fetching — `JobSourceScraper.fetchJobs` takes `roles`, and `scrape.ts` skips when there's no active role selection

**Decision:** `JobSourceScraper.fetchJobs(companies: Company[], roles: readonly string[]): Promise<RawJob[]>` — every adapter (Greenhouse, Lever, Ashby, RemoteOK, Wellfound) now receives the active role selection's `expandedRoles` and filters its `RawJob[]` to those matching at least one role term in `title` or `description`, via the new shared pure helper `features/sources/domain/roleMatch.ts` (`jobMatchesRoles`). An empty `roles` array means "no filter" — adapters return everything fetched, preserving prior behavior as a safe default for any caller without a role selection. `scripts/scrape.ts` loads `SupabaseRoleRepository.getActiveSelection()` (the same call `score.ts` makes) before scraping; if there is no active role selection, it logs and returns without scraping or ingesting any source. This is the architect-approved `fetchJobs` signature change anticipated as out-of-scope in AD-13.

**Rationale:** Previously, role selection only filtered at scoring time (`findUnscored`'s title ILIKE match), so `scrape.ts` fetched and ingested every job from every configured source/company regardless of relevance — the vast majority of scraped/stored jobs were never relevant to the user's selected roles. Since no supported ATS API offers a role/keyword query parameter, the only correct fix is client-side filtering of the fetched `RawJob[]` before ingestion, using the same sanitization rules as the existing scoring-time ILIKE filter (`SupabaseJobRepository.sanitizeRoleForFilter`) so the two filters stay conceptually aligned. Skipping the entire scrape run when there's no active role selection avoids reintroducing the "ingest everything" problem during onboarding (before the user has made a role selection).

**Alternatives considered:** Keep filtering only at scoring time (rejected — doesn't address the root cause, jobs table fills with irrelevant rows); fall back to "fetch everything" when no active role selection exists (rejected — defeats the purpose for any run before role selection is configured, and silently re-ingests the noise this change removes); add a per-adapter ATS-side keyword query (rejected — none of Greenhouse/Lever/Ashby/RemoteOK/Wellfound's public APIs support one).

**Consequences:** `jobs` table growth is now bounded by the active role selection's `expandedRoles`, not by all configured companies/sources — switching the active role selection changes what future scrapes ingest (existing rows from a previous role selection are not retroactively removed). Any future caller of `fetchJobs` (tests, scripts, tooling) must pass a `roles` array; `[]` is the explicit "no filter" escape hatch and should be used deliberately, not as an oversight.

### AD-16: Cross-source duplicate detection via deterministic fingerprint, not fuzzy/AI matching (Phase 1 Task 1-3)

**Decision:** `jobs` gains `fingerprint` (`sha256(normalizeTitle(title) + "|" + normalizeCompanyName(companyName) + "|" + sortedLocationTags)`) and `canonical_company_name` (`normalizeCompanyName(companyName)`), both computed at write time in `SupabaseJobRepository` (not passed through `NormalizedJob`). `upsertMany` checks the fingerprint of every job not already known by `(source, source_job_id)` against all existing jobs; a match skips the insert and instead writes a provenance row to the new `job_duplicates` table (`canonical_job_id`, `source`, `source_job_id`, `url`), and refreshes the canonical job's `last_seen_at` so it isn't swept as expired while still listed elsewhere. `normalizeTitle` deliberately strips seniority tokens (senior/sr/junior/jr/lead/staff/principal/I-IV) so e.g. "Senior Backend Engineer" and "Backend Engineer" collapse to the same fingerprint; `normalizeCompanyName` strips trailing legal-entity (LLC/Inc/Corp/...) and regional-office (India/Singapore/...) suffixes.

**Rationale:** The only existing dedup was the DB-level `UNIQUE(source, source_job_id)` — it prevents the same source from re-inserting the same posting on every cron run, but does nothing when the same logical job is scraped from two different sources (e.g. Greenhouse directly and an aggregator), which produced duplicate rows, duplicate scoring runs, and duplicate Telegram notifications. Fingerprinting is deterministic and index-backed (no per-row fuzzy comparison, no AI call), matching the "avoid expensive comparisons, no AI" constraint. A plain (non-unique) index on `fingerprint` was chosen over a unique constraint so the app-level check-then-skip in `upsertMany` is the single source of truth for the "one row per logical job" invariant, rather than racing a DB constraint.

**Alternatives considered:** Fuzzy/Levenshtein title matching (rejected — expensive at scale, non-deterministic edge cases, explicitly out of scope per the task); AI-based semantic dedup (rejected — cost, non-determinism, explicitly excluded); a `UNIQUE(fingerprint)` DB constraint instead of app-level partitioning (rejected — would throw on any insert races or normalization drift instead of degrading to "treat as duplicate," and the pipeline is a sequential per-source cron, not a concurrent write path, so the extra DB-level guarantee isn't needed); deduping within a single scrape batch by fingerprint in addition to the cross-run DB check (deferred — two same-source postings sharing a fingerprint in one batch is rare and not the case this task targets; documented as a known limitation, not implemented, to avoid the added complexity of resolving IDs for rows not yet inserted).

**Consequences:** A job discovered second (from a different source) never gets its own `jobs` row, `job_scores` row, or Telegram notification — `job_duplicates` is the only record of it, so any future UI wanting to show "also listed on N other sources" reads from there. Existing rows ingested before this migration have `fingerprint = ''` until `npm run backfill:fingerprints` is run once; until then they're invisible to the cross-source check (never falsely merged, just not yet deduped against). `UpsertResult` gained a required `duplicates` count, and `scrape_runs` gained `duplicate_count` — both existing call sites were updated in the same commit (no silent breakage). Seniority-token stripping in `normalizeTitle` is a deliberate tradeoff: a "Senior" and non-senior posting for the same title/company/location will now be treated as one logical job even though the levels may differ; acceptable per this task's explicit examples, revisit if it causes real false merges.

### AD-17: Notification pipeline verified exactly-once/retry-safe; digest mark-as-notified batched (Phase 1 Task 4)

**Decision:** Audited the full notification pipeline (`sendNotification`, `sendDigest`, `sendDigestMvp`, `SupabaseNotificationRepository`, `TelegramBotSender`) against the "exactly once, retry safe, idempotent, duplicate safe" requirement. Confirmed: `notifications_log` has `UNIQUE(job_id)` and every write goes through `on conflict (job_id) do nothing`, so re-running the same match twice never inserts a second row or double-counts. `TelegramBotSender.post()` throws on any non-2xx or `{ok:false}` response (including the recent `BUTTON_URL_INVALID` case), and every send site only calls `markNotified`/`markManyNotified` *after* a successful send, inside code paths that leave the job(s) unmarked on failure -- so a failed send is correctly retried on the next `score.ts`/`notify.ts` cron run rather than silently dropped or falsely marked sent. One real gap found and fixed: `sendDigest`/`sendDigestMvp` send ONE Telegram message covering many matches, but marked each job notified in a per-item loop calling `markNotified` — if a write N matches into the loop failed, matches before it were marked (correct) but matches after it were not, even though all of them were already shown in the one message that was sent, contradicting the code's own "all jobs unmarked for retry" comment. Added `NotificationRepository.markManyNotified(jobIds)` (single upsert, `on conflict (job_id) do nothing`, no-op on empty array) and switched both digest senders to call it once instead of looping.

**Rationale:** `sendNotification` (individual mode) is correctly one-send-per-job with one-mark-per-job, so a per-match loop there is appropriate — each match is independent. The digest senders send one message for N jobs, so the write that follows should also be one atomic-ish batch operation matching that unit of work, not N independent ones with an inconsistent partial-failure window.

**Alternatives considered:** Wrap the digest send+mark in a DB transaction (rejected — the Telegram HTTP call can't participate in a Postgres transaction anyway, and a batched upsert already shrinks the partial-failure window from N round trips to 1, which is enough for a personal-scale tool); leave the per-item loop as documented behavior (rejected — the code comment already claimed all-or-nothing semantics that weren't actually true, a real correctness/documentation mismatch worth closing).

**Consequences:** `NotificationRepository` gained a required `markManyNotified` method — all three test fakes (`sendNotification.test.ts`, `sendDigest.test.ts`, `sendDigestMvp.test.ts`) and `SupabaseNotificationRepository` were updated in the same commit. Residual known gap (documented, not fixed — out of scope for a personal tool): if the Telegram send succeeds but the immediately-following `markNotified`/`markManyNotified` call itself throws (e.g. a transient DB error), the job(s) will be re-sent on the next run since `notifications_log` was never written — an at-least-once, not exactly-once, guarantee in that narrow window. Fixing this fully would require an outbox/transactional-write pattern, disproportionate to the risk for a single-user tool with infrequent DB write failures.

### AD-18: Source-level health summary computed from `scrape_runs`, independent of `companies.health_status` (Phase 1 Task 5/7)

**Decision:** Added `scrape_runs.failure_category` (plain `text`, values from the new `FailureCategory` TS union in `classifyScrapeFailure.ts`: `timeout | parsing | selector | captcha | blocked | authentication | rate_limited | not_found | empty_feed | unknown`), set by `scripts/scrape.ts` on every run -- via `classifyScrapeFailure(err)` when the adapter throws, or `'empty_feed'` when it returns zero raw jobs on an otherwise-successful run. A new pure function `computeSourceHealthSummary(source, runs)` aggregates a source's recent `scrape_runs` into `{ successRate, avgLatencyMs, consecutiveFailures, lastSuccessAt, lastFailureAt, recoveryDetected, topFailureCategory, recommendation }`; `getSourceHealthReport()` runs it for every `JOB_SOURCES` entry via the new `ScrapeRunRepository.listRecentBySource(source, limit)`. `recommendation` is deterministic rule-based text (no AI), thresholded against the existing `SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures`.

**Rationale:** `companies.health_status`/`consecutive_failures` (AD from `20260619000010_source_health.sql`) only exists for board-token sources (greenhouse/lever/ashby) because `companies` rows only exist for those -- wellfound/remoteok/mycareersfuture have no row to hold health state at all, so they had zero health visibility previously. Separately, `companies.health_status` is only updated by the standalone `validate-sources.ts` probe cron, never by `scrape.ts` itself (AD-13 noted this as a known gap: a company whose actual scrape consistently fails is invisible until the next probe run, which checks board reachability, not the adapter's actual parse/fetch success). Computing health from `scrape_runs` -- already written by every source on every cron run regardless of company config -- closes both gaps without touching the `companies` schema or the existing, working probe-based auto-disable flow.

**Alternatives considered:** Extend `companies.health_status` tracking to also update from `scrape.ts` failures (rejected for this pass -- requires changing `JobSourceScraper.fetchJobs`'s per-company error-swallowing to report failures back to the caller, an architect-level interface change across all 5 adapters per AD-13, and doesn't solve the feed-based-source gap since those sources have no `companies` row regardless); a full time-series metrics table (rejected -- `scrape_runs` already has everything needed: status, timing, error; a new table would duplicate data Caveman-style rather than reuse it); Postgres enum for `failure_category` (rejected -- an enum-alter migration is needed for every new category; plain `text` with the fixed set living in TypeScript is simpler to extend, consistent with `metadata`/`error` already being unconstrained at the DB level).

**Consequences:** This is a second, independent health signal alongside `companies.health_status` -- they are not merged or reconciled, and `scrape.ts`'s scraper-selection logic (`listActiveHealthy`) still only reads `companies.health_status`, so this new summary does not yet drive auto-disable/auto-skip behavior; it is observability-only as of Phase 1 (no UI wired -- CLAUDE.md's domain/application/infrastructure-before-UI rule -- Phase 4 analytics is the intended consumer). `selector`/`captcha` failure categories are unreachable by any current adapter (none does HTML/DOM scraping or hits a CAPTCHA wall) -- deliberate extension points, not dead code to be removed.

### AD-19: `job_scores.retry_count` via an atomic `upsert_job_score` RPC, plus AI-retry queue monitoring (Phase 1 Task 6)

**Decision:** Added `job_scores.retry_count integer not null default 0`, incremented only via a new `upsert_job_score(...)` Postgres function that does `INSERT ... ON CONFLICT (job_id, role_selection_id, resume_version) DO UPDATE SET ..., retry_count = job_scores.retry_count + (1 if excluded.ai_score IS NULL else 0)` in one round trip -- mirroring the existing `set_active_resume`/`set_active_role_selection` RPC pattern (AD-09) rather than a plain `.upsert()`. `SupabaseScoreRepository.insertScore` now calls this RPC instead of `.from("job_scores").upsert(...)`. Added `ScoreRepository.findAwaitingAi(roleSelectionId, resumeVersion, keywordThreshold)` (job_scores rows past the keyword gate with `ai_score IS NULL`, ordered oldest `scored_at` first), a pure `computeScoringQueueSummary(awaiting, stuckThresholdHours)` (awaiting count, oldest-pending age, stuck-job list, max/avg retry count), and `getScoringQueueReport()` composing the two. `scripts/score.ts` logs the summary after every run and warns with stuck job ids.

**Rationale:** `job_scores.scored_at` is set once at first insert and never touched again by a plain upsert (the column isn't in the client-supplied payload, so `ON CONFLICT DO UPDATE` never rewrites it) -- that makes it a stable, correct signal for "how long has this job been in the queue" (oldest-pending / stuck detection), but it says nothing about "how many times has scoring been attempted." That second signal needs its own counter, and incrementing it conditionally ("only when this write still leaves `ai_score` null") isn't expressible through a plain client-side `.upsert()` payload -- it requires either a read-modify-write per job (an extra round trip per job during every `score.ts` run) or a small SQL function that does it atomically in the same statement as the write already happening. The RPC was chosen over the read-modify-write for exactly the reasons AD-09's swap functions already established: one round trip, no races.

**Alternatives considered:** Approximate retry count from `(now - scored_at) / cronIntervalHours` (rejected -- fragile, assumes a fixed cron cadence, and CLAUDE.md explicitly says avoid magic); a read-modify-write in `scoreJob.ts`/`score.ts` instead of an RPC (rejected -- doubles DB round trips for every job in the scoring loop, for a personal-scale tool where the RPC costs nothing extra); a separate `job_score_attempts` history table (rejected -- overkill for a single counter, Caveman-style over-engineering for what Task 6 actually asks for).

**Consequences:** `ScoreRepository.insertScore`'s implementation changed (plain upsert → RPC) but its interface/behavior contract is unchanged for callers -- `scoreJob.ts` is untouched. `SupabaseScoreRepository.test.ts` was updated to assert on `client.rpc(...)` instead of `builder.upsert(...)`. The queue/stuck-job report is logged, not enforced -- no auto-drop, no notification, no UI (Phase 4 territory); AD-14's indefinite retry remains the actual "never permanently stuck" mechanism, this just makes long waits visible so an operator can investigate.

### AD-20: Career page discovery scoped to deterministic ATS-board derivation only; domain-guessing deferred (Phase 2 Task 8)

**Decision:** New `company_career_pages` table, keyed by `canonical_company_name` (not `companies.id`, so it can eventually hold an entry for any company name, including ones with no board-token row). `discoverAtsCareerPages(companies)` derives a careers-page URL for every `companies` row with a board token, purely from `(source, boardToken)` -- `https://boards.greenhouse.io/{token}`, `https://jobs.lever.co/{token}`, `https://jobs.ashbyhq.com/{token}` -- zero network calls, zero ambiguity, because for these three sources the ATS board itself *is* the public careers page. Persisted via a standalone `scripts/discover-career-pages.ts`, not the scrape/score/notify cron. Also moved `normalizeCompanyName` from `features/jobs/application` to `features/companies/domain` (its natural home; `jobs` and `scripts/backfill-fingerprints.ts` now import it from there) since career-page discovery needed it too and duplicating it would violate CLAUDE.md's "no duplicated types/logic" rule.

**Rationale:** The task's stated pipeline is "Company → Official Website → Careers Page → Store URL," which implies discovering an arbitrary company's website from its name (e.g. for the ~40% of jobs sourced from aggregators -- wellfound/remoteok/mycareersfuture -- that have no `companies` row and only a free-text `company_name`). Doing that generically without an AI/search-API call means guessing a domain from the company name and validating it with a live HTTP request -- inherently heuristic (ambiguous for names like "JPMorgan" -> jpmorgan.com vs jpmorganchase.com) and dependent on live network access this sandboxed session can't fully verify end-to-end for many real companies. Shipping unverified guessed URLs as if they were facts would violate "deterministic behavior" and "avoid magic." The ATS-board case has no such ambiguity and is real, immediately useful data (every board-token company now has a stored careers page), so it was implemented fully; the schema (`discovery_method`/`confidence` columns) explicitly leaves room for a `'domain_guess'`/`'low'`-or-`'medium'`-confidence entry to be added later without a schema change.

**Alternatives considered:** Build the domain-guessing pipeline now with a live HTTP HEAD request per candidate TLD (rejected for this pass -- can't be verified against real companies in this session, and a wrong guess stored as data with no clear low-confidence signal would be worse than not discovering it at all); store the derived URL as a computed column on `companies` instead of a separate table (rejected -- `company_career_pages` needs to hold entries for companies with no `companies` row at all, which a `companies`-table column structurally cannot do); require an official third-party search API (rejected -- new paid external dependency, "avoid unnecessary dependencies").

**Consequences:** Only board-token companies (greenhouse/lever/ashby) have a career page today; aggregator-sourced companies (the majority of jobs by volume per `design/limitations.md` §1.1) do not, until a future phase implements and validates the domain-guessing path. `scripts/discover-career-pages.ts` is safe to re-run (upserts on `canonical_company_name`) and is not wired into any cron -- must be run manually or added to a workflow deliberately.

### AD-21: Contact email extraction is plain-text/regex only; structured-HTML and mailto: are deferred (Phase 2 Task 9)

**Decision:** Replaced the existing, unused `extractRecruiterEmail` (`shared/infrastructure/text.ts` -- defined, tested, never called from any code path) with `extractContactEmail` (`features/jobs/domain/extractContactEmail.ts`), which extracts every email in `title+description`, excludes fully-automated mailboxes (noreply/unsubscribe/postmaster/...), categorizes the rest by a local-part keyword heuristic into `recruiter > hr > hiring_manager > company_contact` (task's stated priority order) with a `high|medium|low` confidence, and returns the single highest-priority match. Wired into `ingestJobs.ts` alongside the existing `parseMinYears` call, storing `jobs.contact_email`/`contact_email_category`/`contact_email_confidence`.

**Rationale:** The task's preferred methods are "structured HTML, regex, mailto links" -- but by the time a job reaches `ingestJobs`, its `description` has already been through `stripHtml()` inside each scraper adapter (scrapers.md §3, applied before the `RawJob` is even constructed), so `<a href="mailto:...">` markup and any HTML structure are already gone. Regex over the remaining plain text is the only one of the three methods actually available without changing what every scraper adapter passes through the pipeline (an architect-level, cross-adapter interface change, same category of change AD-13/AD-18/AD-20 already deferred). The categorization heuristic operates on the email's local part only (not surrounding-text proximity/NLP) to stay within "no AI"/"avoid magic" -- a personal-name address with no recognizable keyword honestly reports `company_contact`/`low` rather than guessing "hiring manager" from context.

**Alternatives considered:** Extract from raw HTML before `stripHtml()` runs, requiring every scraper adapter to also pass the pre-strip HTML through to `ingestJobs` (rejected -- cross-cutting interface change across 5 adapters, same category of risk as the deferred `fetchJobs` change in AD-13/18); proximity-based text search for phrases like "hiring manager" near a personal-name email (rejected -- heuristic complexity for a marginal accuracy gain, and starts to resemble the "magic" CLAUDE.md says to avoid); keep the old `extractRecruiterEmail` alongside the new function (rejected -- CLAUDE.md forbids duplicated logic, and the old function's single-tier "first non-excluded email" behavior is strictly subsumed by the new categorized/prioritized one).

**Consequences:** Emails only reachable via a `mailto:` href with non-email link text (e.g. `<a href="mailto:jane@co.com">Apply now</a>`) are invisible to this extraction -- the address never appears in the stripped plain text. This is a real, documented gap (`design/limitations.md`), not a silent one. `contact_email_category`/`confidence` are plain `text` columns (not Postgres enums), consistent with `scrape_runs.failure_category`'s established convention in this codebase.

### AD-22: Salary extraction via layered regex patterns, requiring a currency/unit/period signal to avoid false positives (Phase 2 Task 10)

**Decision:** `extractSalary` (`features/jobs/domain/extractSalary.ts`) parses `jobs.salary_currency/salary_min/salary_max/salary_period/salary_confidence` from `title+description` at ingest, alongside the existing `parseMinYears`/`extractContactEmail` calls. Three regex patterns are tried in priority order -- currency-symbol-first (`₹18-24 LPA`, `$120k/year`, `Rs. 50,000/month`), number-then-currency-code-or-LPA/lakh (`20 LPA`, `35 USD/hour`, `8-10 lakhs per annum`), and number-with-explicit-period-but-no-currency (`5000-7000 per month`) -- each requiring at least one of a currency symbol/code, an LPA/lakh unit, or an explicit period phrase directly attached to the number(s). A bare number with none of these (e.g. "5+ years of experience") is never treated as a salary. `LPA`/`lakh` doubles as both a currency signal (implies INR) and a magnitude multiplier (1 lakh = 100,000) and an implicit "yearly" period (the "PA" in LPA is literally "Per Annum") when no more specific period word is also present. `confidence` is `'high'` when both currency and period were determined, `'medium'` when only one was. Explicit "Negotiable"/"Competitive"/"DOE" text with no figure returns an object with all-null numeric fields but `confidence: 'low'` (a salary section exists, just no number) -- distinct from returning `null` outright when there's no salary-related text at all.

**Rationale:** Salary formats in real job postings vary enough (currency symbol vs. code vs. India-specific LPA/lakh units; range vs. single figure; period as a suffix, a `per X` phrase, or implied) that a single regex covering every case correctly would be unreadable and hard to verify; three prioritized patterns, each independently testable, is the deterministic middle ground between "one giant unmaintainable regex" and "a parser generator/grammar" (avoids overengineering in the other direction). Requiring a signal (currency/unit/period) before accepting a numeric match is the key false-positive guard -- job descriptions are full of bare numbers (years of experience, team size, percentages) that must never be misread as a salary figure.

**Alternatives considered:** A general-purpose NLP/currency-parsing library (rejected -- new dependency, "avoid unnecessary dependencies," and this codebase already established the local-regex-plus-tests pattern for `parseMinYears`/`extractContactEmail`); defaulting an unspecified period to "yearly" for any bare `$Nk` figure (rejected -- ambiguous in general, could silently misrepresent an hourly/monthly figure as annual; only inferred for LPA where the annum meaning is unambiguous by definition of the unit itself); AI-based extraction (rejected, explicitly out of scope per the task).

**Consequences:** Formats not matching any of the three patterns (e.g. spelled-out numbers, unusual currency abbreviations, salary given only as a benefits-page link) are not extracted -- `extractSalary` returns `null`, same as "no salary mentioned," which is a real (documented) false-negative risk rather than a false-positive one, consistent with this codebase's general "fail safe, not silently wrong" bias (mirrors AD-16's fingerprint-dedup and AD-20's career-page-discovery choices). `salary_min`/`salary_max` are stored as `numeric` rather than `integer`, matching `job_scores.estimated_cost_usd`'s existing precedent for money-like values in this schema.

### AD-23: AI prompt truncation shipped now; batching and adaptive model routing designed but deferred pending approval (Phase 3 Task 11-12)

**Decision:** `OpenRouterAiScoreProvider`'s prompt-building now truncates `resume.parsedText` and `job.description` via a new `truncateText(text, maxChars)` helper before embedding them in the AI request -- `OPENROUTER_MAX_RESUME_PROMPT_CHARS` (default 4000) and `OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS` (default 2000), both env-overridable, both read per-call (not module-level) so a config change takes effect immediately. Only the prompt sent to the AI is affected -- stored `jobs.description`/`resumes.parsed_text` and the free keyword-gate stage (`extractSkills`, which runs on the full untruncated text) are untouched. Full investigation of all six Task 12 areas (batching, caching, structured outputs, prompt simplification, adaptive model routing, retry optimization) is in `docs/research/ai-cost-optimization-phase3.md`; two of the six (structured outputs, retry optimization) were already fully implemented before this phase, one (caching) is effectively covered by Phase 1's fingerprint dedup, and two (batching, adaptive model routing) are investigated and designed but **not implemented** this phase.

**Rationale:** Prompt truncation is a strict token-cost reduction with no interface/architecture change -- a pure function applied at the existing prompt-building call sites. Batching (combining multiple jobs into one AI request) and adaptive model routing (a second, cheaper AI tier before the existing premium call) both require changing `AiScoreProvider`'s contract and/or adding a new scoring stage -- CLAUDE.md requires approval before introducing new architecture, and both have real correctness tradeoffs (batching loses per-job failure isolation; adaptive routing needs a validated threshold that can't be chosen responsibly without live cost/quality data this sandboxed session doesn't have access to).

**Alternatives considered:** Summarizing resume/description via an extra AI call before the real scoring call (rejected -- the summarization call itself costs tokens, working against the goal); implementing batching/adaptive routing now with a guessed default threshold (rejected -- an unvalidated threshold risks silently discarding genuine high-potential jobs, worse than not optimizing at all); leaving prompts fully untruncated (rejected -- real, unconditional token waste on every AI call for no benefit, since `extractSkills`'s keyword stage already runs on the full text regardless of what the AI prompt sees).

**Consequences:** A resume or job posting whose single most relevant detail appears only after the character cap will lose that signal to the AI reasoning/score -- a real, documented tradeoff (`design/limitations.md`), not free. Batching and adaptive model routing are designed and ready to implement as a scoped follow-up once real usage data is available to validate batch size / threshold choices against -- see `docs/research/ai-cost-optimization-phase3.md` §5-6 for the concrete designs.
