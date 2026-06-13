# Pipeline Agent Report

Scope: `scripts/**`, `.github/workflows/scrape.yml`, plus the minimal read/fix touches to `src/features/**` needed to make the cron pipeline runnable (`architecture-audit.md` Finding #1, AD-04).

Constraints honored: no schema changes, no UI changes, no new architecture, no new runtime dependencies beyond `tsx` (a devDependency for running the cron scripts), Repository Pattern / Supabase / Server Actions conventions preserved.

---

## Root cause

`docs/decisions.md` AD-04 and `docs/architecture.md` §1–§3 describe a second runtime context — three GitHub Actions cron scripts (`scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`) that compose the already-built `application`/`infrastructure` layers into the scrape → score → notify pipeline. `architecture-audit.md` Finding #1 (Critical) found that none of this existed: no `scripts/` directory, no `.github/` directory, no `tsx` dependency, no `scrape`/`score`/`notify` npm scripts — even though every piece these scripts would call (`sourceScrapers`, `ingestJobs`, `scoreJob`, `sendNotification`, `SupabaseScrapeRunRepository`, `createSupabaseServiceClient`) was already implemented and unit-tested.

Two prerequisite gaps surfaced while building the composition roots:

1. **`filtering.application.tagLocations`** — documented in `architecture.md` §3.1 step 4 and referenced by `filtering/domain/types.ts` (`LocationKeywordRule`, `TaggedRawJob`), but never implemented anywhere in `src/`. `scrape.ts` cannot perform the location-filter step (step 5) without it.
2. **`SupabaseJobRepository.findUnscored`** built its PostgREST `.or()` filter by interpolating `expandedRoles` strings directly (`scraper-audit.md` Finding #1, Medium). `score.ts` calls `findUnscored` on every run with AI-/user-supplied role strings, so an unsanitized role containing `,`, `(`, `)`, `.`, `%`, or `*` could break the filter or produce unintended matches — a latent bug that the new pipeline would now exercise on every cron run.

Both were fixed as part of this change since they sit directly on the `scrape.ts`/`score.ts` call path and are within Pipeline Agent's allowed files (`application/`, `infrastructure/` behavior-preserving fixes).

---

## Files changed

### New: filtering feature (prerequisite for `scrape.ts`)
- `src/shared/config/location-keywords.ts` — `LOCATION_KEYWORD_RULES`: keyword lists for `india`/`singapore`/`uae`/`remote`, matching the data-vs-domain split already documented in `filtering/domain/types.ts`.
- `src/features/filtering/application/tagLocations.ts` — `tagLocations(jobs, rules?)`: pure function mapping `RawJob[]` → `TaggedRawJob[]` by case-insensitive substring matching against `locationRaw`, per `architecture.md` §3.1 step 4.
- `src/features/filtering/application/tagLocations.test.ts` — 4 cases: single-rule tagging, empty `locationRaw` → `[]`, case-insensitive multi-tag matching, full field preservation.

### Fixed: `scraper-audit.md` Finding #1
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts` — `findUnscored` now sanitizes each `expandedRole` via a new `sanitizeRoleForFilter()` helper (strips `,.()%*`, trims) before building the `title.ilike.%...%` `.or()` clauses, and returns `[]` early if every role sanitizes to empty (mirroring the existing empty-`expandedRoles` guard).
- `src/features/jobs/infrastructure/SupabaseJobRepository.test.ts` — two new cases: a role like `"Engineer, Backend (Remote)"` produces the filter `title.ilike.%Engineer Backend Remote%`; a role that sanitizes to nothing (`"(),.%*"`) short-circuits to `[]` without querying. Existing test (plain role names, no special chars) still passes unchanged.

### New: cron entry points (AD-04)
- `scripts/scrape.ts` — loops `sourceScrapers`; for `requiresCompanyConfig` sources fetches `companyRepository.listActive(scraper.source)` (skips the source if no active companies); wraps each adapter's `fetchJobs()` in its own try/catch (per-source isolation, `scrapers.md` §4); runs `tagLocations` → `hasAllowedLocation` filter → `ingestJobs`; writes one `scrape_runs` row per source via `SupabaseScrapeRunRepository.recordRun`.
- `scripts/score.ts` — loads the active resume and active role selection (skips with a log line if either is missing); reads `KEYWORD_THRESHOLD` via `optionalEnv` (default `0.5`); calls `jobRepository.findUnscored(roleSelectionId, expandedRoles)`; runs `scoreJob` per job inside a try/catch so one job's failure doesn't abort the run.
- `scripts/notify.ts` — loads the active role selection (skips with a log line if none); reads `NOTIFY_THRESHOLD` via `optionalEnv` (default `0.75`); calls `sendNotification` (per-match error isolation already exists in `sendNotification.ts`, resolved by the Notification Agent).

All three instantiate `createSupabaseServiceClient()` (AD-12 — first real caller of this previously-dead helper) and the relevant `SupabaseXRepository`/`OpenRouterAiScoreProvider`/`TelegramBotSender` classes, matching the "presentation = composition root" rule in `docs/architecture.md` §5 / `review-process.md` §3.3.

### Config / build
- `package.json` — added `tsx` (`^4.19.2`) to `devDependencies`; added `scrape`/`score`/`notify` npm scripts (`tsx scripts/<name>.ts`).
- `tsconfig.json` — added `"scripts"` to `include` so the cron scripts are type-checked.

### CI
- `.github/workflows/scrape.yml` — `workflow_dispatch`-only for now; runs `npm run scrape` → `npm run score` → `npm run notify` in sequence with the documented secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and `vars` for `KEYWORD_THRESHOLD`/`NOTIFY_THRESHOLD`. The `schedule: cron: "0 */2 * * *"` block from AD-04 is present but **commented out** — see Remaining risks.

### Docs
- `docs/architecture.md` §3.2 — rewrote step 3 to describe `scoring.application.scoreJob(job, resume, role_selection_id, deps)` as the single entry point (resolves `architecture-audit.md` Finding #3, the `refineWithAI` naming drift).

---

## Validation

- `npm install` — installed `tsx` cleanly (3 packages added).
- `npm test` — **28 test files / 129 tests, all passing**, including the new `tagLocations.test.ts` and the two new `SupabaseJobRepository.test.ts` cases.
- `npx tsc --noEmit` — clean (no type errors), confirming `scripts/**` resolves the `@/*` path alias correctly under `tsx`'s ESM loader.
- Smoke-ran `npx tsx scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` with no env vars set — each correctly fails fast with `Error: Missing required environment variable: SUPABASE_URL` thrown from `createSupabaseServiceClient`/`requireEnv`, confirming module resolution, composition wiring, and the existing `requireEnv` guard all work end-to-end. Full happy-path execution requires real Supabase/OpenRouter/Telegram credentials and is not exercised here.

---

## Remaining risks

1. **`scrape_runs.status` is binary (`success`/`failed`), not the documented `success`/`partial`/`failed` (`architecture-audit.md` Finding #2).** Classifying `partial` (some companies failed, some succeeded) requires `JobSourceScraper.fetchJobs` to report per-company outcomes back to the caller — a `domain/` interface change outside this agent's allowed files and requiring architect sign-off per `agent-workflow.md`. Recommend a follow-up ADR/interface change (e.g. `fetchJobs` returning `{ jobs, failedCompanies }`).
2. **Wellfound's `[]`-on-validation-failure (AD-10) is indistinguishable from a legitimately-empty result.** `scrapers.md` §4 says this case should be logged as `failed`, but with the current interface `scrape.ts` cannot tell the two apart — it will record `success` with `jobsFound: 0`. Same root cause as #1.
3. **`scraper-audit.md` Finding #2 (unbounded `NOT IN` list in `findUnscored`)** is unaddressed — out of scope (Performance Agent), but note that `score.ts` now calls `findUnscored` on every cron run, so this query-shape issue will start running on a schedule once Phase 4 enables it.
4. **`security-audit.md` Finding #3 (CI boundary check for `SUPABASE_SERVICE_ROLE_KEY`)** is unaddressed — the new workflow passes the service-role key as a secret to `npm run scrape/score/notify` as designed (AD-12), but no automated check exists yet to prevent this key from leaking into `app/`-side code or logs. Security/Deployment Agent scope.
5. **`.github/workflows/scrape.yml` is listed as a forbidden file for Pipeline Agent in `agent-profiles.md`** (normally Deployment Agent's). Created here because the task explicitly required it in a single session; flag for Deployment Agent / architect review on the next pass — in particular the secret names and `vars.KEYWORD_THRESHOLD`/`vars.NOTIFY_THRESHOLD` should be confirmed against whatever naming convention Deployment Agent settles on for repo Variables.
6. **Cron schedule intentionally left commented out.** Per `agent-workflow.md` Phase 4 Escalation Rules, enabling the "every 2h" schedule is a human-gated go-live decision (cost/security implications of running with the service-role key on a timer). The workflow is otherwise ready — uncomment the `schedule:` block once approved.
7. **No dedicated tests for `scripts/*.ts` themselves.** They are thin composition roots (consistent with `actions.ts` elsewhere in the codebase also being untested), validated here via `tsc` + smoke execution rather than vitest. If integration-style coverage is desired, it would need a way to inject fakes for `createSupabaseServiceClient`/`OpenRouterAiScoreProvider`/`TelegramBotSender`, which the current composition-root pattern doesn't support without further changes.
8. **`docs/architecture.md` §3.3 still references `sendTelegramAlert`** (actual: `sendNotification`) — a naming drift similar to Finding #3 but not itself flagged as a finding in `architecture-audit.md`, so left unchanged to keep this fix scoped to Finding #3 exactly. Worth a follow-up doc pass.
