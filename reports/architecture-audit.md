# Architecture Compliance Audit

Scope: implementation in `src/`, `supabase/`, `package.json` vs. `docs/architecture.md` and `docs/decisions.md`.

---

## Findings

### 1. Cron entrypoint (`scripts/*.ts`) and GitHub Actions workflow do not exist

- **Severity:** Critical
- **File:** N/A (missing) — should exist at `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`, `.github/workflows/*.yml`
- **Location:** Repository root — no `scripts/` directory, no `.github/` directory anywhere in the repo. `package.json` has no `tsx` dependency and no `scrape`/`score`/`notify` npm scripts.
- **Description:** `docs/architecture.md` §1–§3 and `docs/decisions.md` AD-04 describe a second runtime context — three GitHub Actions cron scripts (`scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`, run via `tsx` on a schedule) that compose the already-built `application`/`infrastructure` layers (`sourceScrapers`, `ingestJobs`, `scoreJob`, `sendNotification`, `SupabaseScrapeRunRepository`, `createSupabaseServiceClient`) into the actual scrape → score → notify pipeline. None of this exists. Every piece these scripts would call is implemented and unit-tested (scrapers, `ingestJobs`, `scoreJob`, `sendNotification`, `SupabaseScrapeRunRepository`), but there is no composition root that wires them together for the unattended/cron context.
- **Why it matters:** As shipped, the application cannot scrape jobs, score them, or send Telegram notifications — the three core "Job Intelligence Platform" features described in architecture.md §1 items 1, 4, and 6. Only the interactive Next.js paths work end-to-end (role selection, resume upload, company CRUD, dashboard read of whatever data already exists). This is the single largest gap between the documented and implemented system, and it's a Critical/blocking finding for "is this product functional."
- **Recommended fix:** Either (a) implement `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` as thin composition roots (instantiate `createSupabaseServiceClient()`, the relevant `SupabaseXRepository`s, `sourceScrapers`, `OpenRouterAiScoreProvider`/`OpenRouterRoleExpansionProvider`, `TelegramBotSender`, and call the existing application use-cases per architecture.md §3.1–3.3), add `tsx` as a devDependency with corresponding `package.json` scripts, and add `.github/workflows/*.yml` per AD-04's "every 2h" schedule; or (b) if the cron pipeline has been deliberately deferred/descoped, update `docs/architecture.md` and `docs/decisions.md` AD-04 to reflect the current (interactive-app-only) scope, per CLAUDE.md's "Always update docs when architecture changes."

---

### 2. `scrape_runs.status` computation logic (success/partial/failed) has no home

- **Severity:** High
- **File:** N/A (missing) — would live in `scripts/scrape.ts`
- **Location:** `docs/scrapers.md` §4 "Observability" table defines `success` / `partial` / `failed` semantics per source per run; `SupabaseScrapeRunRepository.recordRun()` (`src/features/sources/infrastructure/SupabaseScrapeRunRepository.ts:23-32`) exists and is tested, but has zero callers in `src/`.
- **Description:** The status-computation logic (did every company for a source succeed, did some fail, did the whole adapter throw) is orchestration logic that depends on the per-company error isolation already implemented inside `AshbyScraper`/`GreenhouseScraper`/`LeverScraper`/`WellfoundScraper`/`RemoteOkScraper`. None of those scrapers currently report per-company success/failure counts back to a caller — they only `console.warn` and continue. There is no caller to aggregate that into a `ScrapeRunStatus` and call `recordRun()`.
- **Why it matters:** `/settings` → `ScrapeRunsList` (`src/components/settings/ScrapeRunsList.tsx`) is built and reads `scrapeRunRepository.listRecent(20)`, but the table will always be empty ("No scrape runs yet.") because nothing ever inserts a `scrape_runs` row. This is directly tied to Finding #1.
- **Recommended fix:** When implementing `scripts/scrape.ts` (Finding #1), have each adapter call return enough information (e.g. number of companies attempted vs. failed, or have the adapter itself return a per-call outcome) to let the script classify `success`/`partial`/`failed` per scrapers.md §4 and call `recordRun()` once per source.

---

### 3. `architecture.md` §3.2 references `scoring.application.refineWithAI`, which doesn't exist as a separate function

- **Severity:** Low
- **File:** `docs/architecture.md:97`, vs. `src/features/scoring/application/scoreJob.ts`
- **Location:** architecture.md §3.2 step 3b: `scoring.application.refineWithAI(job, resume) -> ai_score, ai_reasoning`
- **Description:** The implementation combines both scoring stages into a single `scoreJob(job, resume, roleSelectionId, deps)` function (`src/features/scoring/application/scoreJob.ts:24-56`), which internally computes the keyword score, conditionally calls `deps.aiScoreProvider.score(...)`, and persists the row. There is no exported `refineWithAI`. Functionally equivalent to the documented flow (AD-07 is fully honored), but the doc's step-by-step naming doesn't match the code.
- **Why it matters:** Minor — a reader cross-referencing architecture.md step 3b with the codebase won't find `refineWithAI` and may waste time searching. Pure documentation drift, no behavioral issue.
- **Recommended fix:** Update architecture.md §3.2 step 3 to describe `scoring.application.scoreJob(job, resume, roleSelectionId, deps)` as the single entry point covering both stages, matching the actual API.

---

### 4. `frontend.md` §3 documents server actions under `features/<feature>/application/actions.ts`; actual location is `features/<feature>/actions.ts`

- **Severity:** Low
- **File:** `docs/frontend.md:53`, vs. `src/features/{auth,companies,resume,roles}/actions.ts`
- **Location:** frontend.md §3: "Mutations go through server actions in each feature's `application` layer (e.g. `features/roles/application/actions.ts`)..."
- **Description:** All four `actions.ts` files (`auth`, `companies`, `resume`, `roles`) live directly under `features/<feature>/`, not under `features/<feature>/application/`. This placement is consistent across all four features and is arguably *more* correct per `architecture.md` §5 rule 4 ("presentation... is the composition root — the only place where infrastructure classes are instantiated") — every `actions.ts` instantiates `SupabaseXRepository`/`OpenRouterXProvider` directly, which `application/` is forbidden from doing (rule 2). Placing these files inside `application/` would itself be a violation of the dependency rules the doc states elsewhere.
- **Why it matters:** Documentation/implementation drift — frontend.md's example path is misleading for anyone using it to navigate the codebase, and is in mild tension with architecture.md's own layering rules.
- **Recommended fix:** Update `docs/frontend.md` §3 to show `features/<feature>/actions.ts` (presentation/composition-root layer) as the location for server actions, matching `architecture.md` §5 and the actual implementation.

---

### 5. `docs/database.md` §2 schema snippet diverges from the actual migrations

- **Severity:** Low
- **File:** `docs/database.md:48,50,70` vs. `supabase/migrations/20260612000002_tables.sql:28,30,46`
- **Location:** `jobs.location_raw`, `jobs.description`, `resumes.parsed_text`
- **Description:** `database.md` §2 shows these columns as plain `text` (nullable, no default). The actual migration declares all three as `text not null default ''`. `supabase/database.types.ts` agrees with the migration (non-nullable `string`, not `string | null`), and `SupabaseJobRepository`/`SupabaseResumeRepository` code treats them as always-present strings. The implementation is internally consistent; only the doc's SQL snippet is stale.
- **Why it matters:** Low — doesn't cause a bug today, but a future migration author reading database.md §2 as ground truth could introduce a nullable column that the rest of the code (and generated types) don't expect.
- **Recommended fix:** Regenerate/copy the `database.md` §2 SQL block from the current `supabase/migrations/` files (per CLAUDE.md "Always update docs when architecture changes").

---

### 6. `repositories.md` §3 documents `set_active_resume(new_resume jsonb)`; actual function signature is three scalar params

- **Severity:** Low
- **File:** `docs/repositories.md:81` vs. `supabase/migrations/20260612000004_functions.sql:11-15`
- **Location:** repositories.md §3 transaction-boundary note: "`set_active_resume(new_resume jsonb)`"
- **Description:** The implemented function signature is `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[])`, matching how `SupabaseResumeRepository.create()` calls `this.client.rpc("set_active_resume", { p_file_path, p_parsed_text, p_skills })`. The doc's single-`jsonb`-parameter signature was never implemented this way.
- **Why it matters:** Low — purely descriptive drift; the implemented signature is fine and is what `database.types.ts` reflects.
- **Recommended fix:** Update `repositories.md` §3 to show the three-scalar-parameter signature actually used.

---

## Summary of Compliant Areas (no action needed)

- Feature-folder layout (`src/features/<feature>/{domain,application,infrastructure}`) matches AD-02 exactly for all 8 features.
- Repository pattern (interfaces in `domain/`, `SupabaseXRepository` in `infrastructure/`) matches AD-03 and repositories.md for all 7 repositories.
- Two-stage scoring (`computeKeywordScore` gates `aiScoreProvider.score`) matches AD-07 / scoring.md §2-3, including the `KEYWORD_THRESHOLD` default of `0.5`.
- Role expansion cache-then-AI-fallback (`expandRole.ts`) matches AD-06.
- "Single active" pattern via partial unique index + RPC (`set_active_resume`, `set_active_role_selection`) matches AD-09 (see database-audit for a related Returns-type concern).
- Wellfound defensive-by-design behavior matches AD-10.
- RLS policy shape (`authenticated_full_access` on all 8 tables) matches AD-12.
- Five source adapters + `registry.ts` match scrapers.md §1-2 exactly.
- Auth flow (middleware guard + `(protected)/layout.tsx` re-check + `/auth/callback`) matches frontend.md §4.
