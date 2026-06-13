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
