# Merge Plan — Phase 1/3 Agent Output Review

**Reviewer:** Architecture Review Agent (merge-readiness pass)
**Date:** 2026-06-13
**Scope:** Combined diffs from `reports/agent-a-pipeline.md` (Pipeline Agent), `reports/agent-b-notifications.md` (Notification Agent), `reports/agent-c-database.md` (Database Agent), `reports/agent-d-cleanup.md` (Cleanup Agent), checked against `CLAUDE.md`, `docs/**`, and all `reports/*-audit.md`.

**Validation performed (read-only):**
- `npx tsc --noEmit` → clean, no errors.
- `npx vitest run` → 28 test files / 129 tests, all passing.
- Grep for merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) across the repo → none found (only false-positive `===` substrings in unrelated `node_modules`/migration prose).
- Cross-checked each agent's claimed file list against actual file contents.

---

## Resolved Findings

### R1. `architecture-audit.md` Finding #1 (Critical) — cron pipeline missing
- **Severity:** Critical → Resolved
- **File:** `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`, `.github/workflows/scrape.yml`, `package.json`, `tsconfig.json`
- **Reason:** All three composition-root scripts now exist, correctly instantiate `createSupabaseServiceClient()` + `SupabaseXRepository`/`OpenRouterAiScoreProvider`/`TelegramBotSender`, and call the existing `application` use-cases (`ingestJobs`, `scoreJob`, `sendNotification`) per `architecture.md` §3.1–3.3. `tsx` added as devDependency, `scrape`/`score`/`notify` npm scripts added, `scripts` added to `tsconfig.json` `include`. Workflow runs `scrape → score → notify` in sequence on `workflow_dispatch`, with the `schedule:` block intentionally commented out pending the Phase 4 go-live gate (`agent-workflow.md` Escalation Rules — correct, this is by design, not an omission).
- **Recommended Action:** None — verified via `tsc`/`vitest`/smoke run per Pipeline Agent's report. Cron schedule activation remains a Phase 4 human-gated decision (tracked separately, see U6).

### R2. `scraper-audit.md` Finding #1 (Medium) — unsanitized `findUnscored` `.or()` filter
- **Severity:** Medium → Resolved
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:66-74,134-157`
- **Reason:** New `sanitizeRoleForFilter()` strips `,.()%*` and trims before building `title.ilike.%...%` clauses; early-returns `[]` if all roles sanitize to empty. Two new test cases cover the comma/paren case and the all-unsafe-chars case. Existing plain-role test still passes.
- **Recommended Action:** None.

### R3. `database-audit.md` Finding #1 (High) — `set_active_resume`/`set_active_role_selection` RPC return-type mismatch
- **Severity:** High → Resolved
- **File:** `supabase/migrations/20260612000006_fix_rpc_return_types.sql`, `supabase/database.types.ts`
- **Reason:** New forward-only migration drops+recreates both functions as `returns setof <table>`. Verified `database.types.ts` already declared `Returns: ...Row[]` and both repositories (`SupabaseResumeRepository.create`, `SupabaseRoleRepository.setActiveSelection`) already consume `data?.[0]` — all three (SQL ↔ types ↔ repo code) now agree. AD-09 swap semantics unchanged.
- **Recommended Action:** None.

### R4. `database-audit.md` Finding #2 / `architecture-audit.md` Finding #5 (Low) — `database.md` nullable-column drift
- **Severity:** Low → Resolved
- **File:** `docs/database.md:48,50,70`
- **Reason:** `jobs.location_raw`, `jobs.description`, `resumes.parsed_text` now correctly read `text not null default ''`, matching `20260612000002_tables.sql` and `database.types.ts`.
- **Recommended Action:** None.

### R5. `database-audit.md` Finding #3 / `architecture-audit.md` Finding #6 (Low) — `repositories.md` `set_active_resume` signature drift
- **Severity:** Low → Resolved
- **File:** `docs/repositories.md:81,101`
- **Reason:** Both `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[]) returns setof resumes` and `set_active_role_selection(p_primary_role text, p_expanded_roles text[]) returns setof role_selections` now documented correctly, matching the new migration.
- **Recommended Action:** None.

### R6. `maintainability-audit.md` Finding #1 (High) — notification loop has no error isolation
- **Severity:** High → Resolved
- **File:** `src/features/notifications/application/sendNotification.ts:21-39`
- **Reason:** Each match's `formatMatchMessage` + `sendMessage` + `markNotified` wrapped in try/catch; failure is `console.error`-logged with `match.jobId` and the loop `continue`s. New test `sendNotification.test.ts` ("isolates a failing send...") confirms matches N+1..k still get `markNotified`'d. Behavior-change (`sent` now means "successfully sent") is documented and consistent with AD-08.
- **Recommended Action:** None.

### R7. `security-audit.md` Finding #2 (High) — unescaped Telegram Markdown
- **Severity:** High → Resolved
- **File:** `src/features/notifications/application/formatMatchMessage.ts`, `src/features/notifications/infrastructure/TelegramBotSender.ts`
- **Reason:** Switched to `parse_mode: "HTML"` + local `escapeHtml()` (`&`, `<`, `>`) applied to `title`, `companyName`, `aiReasoning`, `url`. New test asserts a title with `` _*`[ `` passes through without throwing, and `&`/`<`/`>` are escaped. Bonus fix (not a tracked finding but directly related): Telegram 429 `retry_after` handling added with `MAX_RETRY_AFTER_MS` cap, with its own test coverage.
- **Recommended Action:** None.

### R8. `maintainability-audit.md` Finding #2 (Low) — `RoleSelectorForm` duplicated `Preview.source` type
- **Severity:** Low → Resolved
- **File:** `src/components/roles/RoleSelectorForm.tsx:6,13`
- **Reason:** `Preview.source` now typed as `RoleMapSource` imported from `@/shared/domain/enums`, matching `ExpandedRolesCard.tsx`'s existing import. `tsc --noEmit` clean.
- **Recommended Action:** None.

### R9. `maintainability-audit.md` Finding #4 (Low) — `recordRun` dead code
- **Severity:** Low → Resolved
- **File:** `src/features/sources/infrastructure/SupabaseScrapeRunRepository.ts:23-32`, called from `scripts/scrape.ts:34-39,48-53`
- **Reason:** `recordRun()` now has a real caller — `scripts/scrape.ts` calls it once per source per run with `status`/`jobsFound`/`error`. No longer dead code.
- **Recommended Action:** None.

---

## Partially Resolved Findings

### P1. `architecture-audit.md` Finding #3 (Low) — `refineWithAI` naming drift
- **Severity:** Low → Partially Resolved
- **File:** `docs/architecture.md:95` (fixed) vs. `docs/architecture.md:158` (not fixed)
- **Reason:** §3.2 step 3 now correctly describes `scoring.application.scoreJob(job, resume, role_selection_id, deps)` as the single entry point — the part of Finding #3 that Pipeline Agent's report claims as resolved. However, §4's "Feature Boundaries" table (line 158) still lists `refineWithAI()` as an exposed API of the `scoring` feature — this export doesn't exist (`scoreJob` does both stages). Same root drift, second location, missed.
- **Recommended Action:** Architecture Review Agent: update `architecture.md:158` to list `scoreJob()` (and remove `computeKeywordScore()`'s redundant standalone listing if `scoreJob` is now the documented single entry point — or keep both if both are still independently meaningful exports). Small follow-up, no code change.

### P2. `architecture-audit.md` Finding #2 (High) — `scrape_runs.status` success/partial/failed aggregation
- **Severity:** High → Partially Resolved
- **File:** `scripts/scrape.ts:34-56`
- **Reason:** `recordRun()` now has a caller (R9), so the table will no longer be permanently empty — but `scrape.ts` only ever writes `status: "success"` or `status: "failed"` (whole-source try/catch). The documented `partial` state (`scrapers.md` §4 — "some companies failed, some succeeded") is never written, because the per-company error isolation inside `AshbyScraper`/`GreenhouseScraper`/`LeverScraper` (`console.warn`-and-continue) doesn't report counts back to the caller. Pipeline Agent's own report flags this as remaining risk #1/#2 and correctly identifies it as a `domain/` interface change requiring **architect** sign-off (out of this agent's allowed files).
- **Recommended Action:** Architecture Review Agent: open an explicit follow-up — either (a) approve a `JobSourceScraper.fetchJobs` signature change to `{ jobs: RawJob[], failedCompanies: number, totalCompanies: number }` (architect-level, per `agent-profiles.md`), or (b) formally descope "partial" from `scrape_runs.status`'s near-term semantics via an ADR update, since `success`/`failed` is what's actually implemented today. Either way, `docs/scrapers.md` §4 and `database.md` enum docs must stay in sync with whichever is chosen — do not leave silently divergent (`review-process.md` §4.2, Medium/High drift rule).

### P3. `maintainability-audit.md` Finding #5 / `security-audit.md` Finding #3 (Low→Live) — `createSupabaseServiceClient` dead code
- **Severity:** Low (was "dead code, future-risk flag") → now **Live** (not fully resolved)
- **File:** `src/shared/infrastructure/supabaseClient.ts`, called from all three `scripts/*.ts`
- **Reason:** The "dead code" aspect is resolved — `createSupabaseServiceClient()` now has three real callers, all correctly confined to `scripts/**` (verified: zero matches under `src/app/**` or any `"use client"` file). However, `security-audit.md` Finding #3's actual recommended action — "add a CI/lint check ensuring `SUPABASE_SERVICE_ROLE_KEY` only appears in `scripts/` and `shared/infrastructure/supabaseClient.ts`" — was the *point* of the finding once this code went live, and that check still doesn't exist. Pipeline Agent's report explicitly flags this as remaining risk #4, correctly scoped to Security/Deployment Agent.
- **Recommended Action:** Security Agent (per `agent-profiles.md` §6 Definition of Done, Finding #3): add the grep-based CI check now — this is the Phase 4 trigger condition ("`security-audit.md` #3 becomes live and must be checked now that `createSupabaseServiceClient` has real callers", `agent-workflow.md` Phase 4) and it has now occurred.

---

## Unresolved Findings

### U1. `architecture-audit.md` Finding #4 (Low) — `frontend.md` §3 `actions.ts` path drift
- **Severity:** Low → Unresolved, **silently dropped**
- **File:** `docs/frontend.md:53`
- **Reason:** Still reads `features/roles/application/actions.ts`; actual location is `features/roles/actions.ts` (and the same for `auth`/`companies`/`resume`). This was explicitly assigned to Cleanup Agent in `agent-profiles.md` §4 ("Fix `docs/scoring.md`/`docs/frontend.md` drift items... `architecture-audit.md` Findings #3, #4") and in `agent-workflow.md` Phase 1's work-item table. `reports/agent-d-cleanup.md` does not mention this finding at all — not fixed, not logged as deferred.
- **Recommended Action:** Cleanup Agent: fix `docs/frontend.md:53` to read `features/<feature>/actions.ts` per the audit's recommended fix (one-line doc change, no code/behavior impact). If genuinely descoped, it must be logged as "deferred" with a reason per `agent-profiles.md` §4 Definition of Done — silent omission is itself a process defect (see N2).

### U2. `dependency-audit.md` Finding #1 (Low) — `ThresholdsCard.tsx` imports `shared/infrastructure/env` directly
- **Severity:** Low → Unresolved, **silently dropped**
- **File:** `src/components/settings/ThresholdsCard.tsx:2,5-6`
- **Reason:** Verified still present — `ThresholdsCard.tsx` still does `import { optionalEnv } from "@/shared/infrastructure/env"` and calls it directly inside the component, a presentation-layer import of `shared/infrastructure` (architecture.md §5 reserves this for composition roots). `(protected)/settings/page.tsx` does not read these env values and pass them as props. This was explicitly assigned to Cleanup Agent (`agent-profiles.md` §4, `agent-workflow.md` Phase 1 table: "`dependency-audit.md` #1 (`ThresholdsCard`)"). `reports/agent-d-cleanup.md` does not mention this finding — not fixed, not logged as deferred.
- **Recommended Action:** Cleanup Agent: move `optionalEnv("KEYWORD_THRESHOLD", "0.5")` / `optionalEnv("NOTIFY_THRESHOLD", "0.75")` reads into `src/app/(protected)/settings/page.tsx` (a server component, already a valid place to import `shared/infrastructure`), and pass the resolved strings into `ThresholdsCard` as props, per the audit's recommended fix. Low risk, isolated, matches Cleanup Agent's allowed files (`src/components/**`).

### U3. `security-audit.md` Finding #1 (Medium) — resume upload uses raw `file.name` in Storage path
- **Severity:** Medium → Unresolved (correctly out of scope for this batch)
- **File:** `src/features/resume/actions.ts:36`
- **Reason:** Verified still `const filePath = \`${Date.now()}-${file.name}\``. Owned by Security Agent (`agent-profiles.md` §6), not part of this batch. Cleanup Agent's report correctly identifies this as out-of-scope and does not attempt it — this is the *correct* handling, contrast with U1/U2.
- **Recommended Action:** No action for this merge. Security Agent to pick up per its existing Phase 1 assignment (`agent-workflow.md` Phase 1 table already lists this as Security Agent's item — it just hasn't run yet in this batch).

### U4. `maintainability-audit.md` Finding #3 (Low) — `hasScore` dead code
- **Severity:** Low → Unresolved (correctly deferred, but dependency now satisfied)
- **File:** `src/features/scoring/domain/ScoreRepository.ts:10`, `src/features/scoring/infrastructure/SupabaseScoreRepository.ts:24`
- **Reason:** Cleanup Agent correctly deferred this pending "Pipeline Agent merging `scripts/**`" (per `agent-profiles.md` §4's instruction). That merge has now happened in this same batch (R1), and `scripts/score.ts` does **not** call `hasScore` — `scoreJob`'s upsert-with-`ignoreDuplicates` still makes it redundant, confirmed by re-reading `scripts/score.ts`. The blocking condition Cleanup Agent named is now satisfied with "no caller emerged."
- **Recommended Action:** Cleanup Agent (Phase 4, per `agent-workflow.md`: "Resolve deferred dead-code findings... now that callers exist or have been explicitly declined"): remove `hasScore` from `ScoreRepository` interface, `SupabaseScoreRepository`, and its test (`SupabaseScoreRepository.test.ts:42-58`), and the mock in `scoreJob.test.ts:49`, per the original recommended fix.

### U5. `performance-audit.md` Findings #1-4, `scraper-audit.md` Finding #2, `cost-audit.md` Findings #3-4
- **Severity:** Medium/Low → Unresolved (expected — Performance Agent, Phase 2, not part of this batch)
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts` (`findExistingKeys`, `findForDashboard`'s JS-side `minAiScore` filter, `findUnscored`'s unbounded `NOT IN`), `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` (`findUnnotifiedMatches`'s JS-side filter)
- **Reason:** None of the four agents in this batch own these files for this purpose; none attempted these fixes. Confirmed all four findings' underlying code is unchanged from the audited state.
- **Recommended Action:** No action for this merge — Performance Agent's Phase 2 work, per `agent-workflow.md`. See **N1** below for a new coordination constraint Performance Agent must account for.

### U6. `agent-workflow.md` Phase 4 go-live gate (cron schedule)
- **Severity:** N/A (process gate) → Unresolved (by design)
- **File:** `.github/workflows/scrape.yml:10-13`
- **Reason:** `schedule:` block correctly commented out. This is the single highest-cost-impact action in the workflow (`agent-workflow.md` Escalation Rules) and requires human approval after a `cost-audit.md` Finding #1 re-run with real volume.
- **Recommended Action:** No action now. Tracked for Phase 4 (Deployment Agent, after Architecture/Security/Performance re-audits per Merge Order step 6-8).

---

## New Findings

### N1. (Medium) `scrape.ts` now depends on `UpsertResult.{inserted, updated}` — conflicts with Performance Agent's planned fix for `performance-audit.md` Finding #1
- **Severity:** Medium
- **File:** `scripts/scrape.ts:43` (new consumer) vs. `src/features/jobs/infrastructure/SupabaseJobRepository.ts:80-103` (`upsertMany`/`findExistingKeys`)
- **Reason:** `performance-audit.md` Finding #1 says `UpsertResult.inserted`/`.updated` have "zero consumers" and recommends either removing the `{inserted, updated}` breakdown entirely (making `upsertMany` return `void`/a total count) or computing it from the upsert response instead of `findExistingKeys`'s pre-upsert SELECTs. That was true when the audit was written — it is **no longer true**: `scripts/scrape.ts:41-44` now logs `inserted ${result.inserted}, updated ${result.updated}` per source. If Performance Agent implements the "return void" variant of its own recommended fix without updating `scrape.ts`, it breaks a now-existing caller (type error, caught by `tsc`, but still a cross-agent regression if not anticipated).
- **Recommended Action:** Performance Agent (Phase 2): prefer recommended-fix option (b) — compute `{inserted, updated}` from the upsert response itself (e.g. `RETURNING xmax` / comparing `created_at`/`updated_at`) rather than `findExistingKeys`'s extra SELECTs — preserving `UpsertResult`'s shape so `scrape.ts`'s logging keeps working, while still eliminating the redundant round-trips. If option (a) (`void` return) is chosen instead, `scripts/scrape.ts:41-44`'s log line must be updated in the same change — but `scripts/**` is outside Performance Agent's allowed files (`agent-profiles.md` §7), so this would require either a Pipeline Agent follow-up in the same PR cycle or an **architect**-coordinated joint change. Flag this dependency explicitly before Phase 2 starts.

### N2. (Low) Cleanup Agent's report silently drops 2 of its 3 Phase-1-assigned items
- **Severity:** Low (process)
- **File:** `reports/agent-d-cleanup.md`
- **Reason:** Per `agent-workflow.md` Phase 1 table, Cleanup Agent's work items are "`maintainability-audit.md` #2 (`RoleSelectorForm`), `dependency-audit.md` #1 (`ThresholdsCard`), `architecture-audit.md` #3/#4 doc-drift." Only the first was addressed (R8). The other two (U1, U2) are not mentioned anywhere in the report — not as "addressed," not as "deferred," not as "out of scope." This violates `agent-profiles.md` §4's own Definition of Done: "Findings deferred... are explicitly logged as 'deferred — blocked on X' in the report, not silently skipped." The report's own summary table only lists items from `maintainability-audit.md`/`performance-audit.md`/`security-audit.md`, omitting `dependency-audit.md` and `architecture-audit.md` entirely.
- **Recommended Action:** Cleanup Agent: re-run with U1 and U2 in scope (both are small, isolated, within allowed files), or — if there's a real blocker — append explicit "deferred, reason: X" notes to `reports/agent-d-cleanup.md` per its own DoD. Architecture Review Agent should not mark Phase 1 "exit criteria met" until this is resolved (`agent-workflow.md` Phase 1 exit criteria: "all Phase 1 PRs merged").

### N3. (Low) `architecture.md` §3.3/§4 still reference `sendTelegramAlert` (actual: `sendNotification`)
- **Severity:** Low
- **File:** `docs/architecture.md:108,159`
- **Reason:** `docs/architecture.md` §3.3 step 2 ("`notifications.application.sendTelegramAlert(job, score)`") and §4's Feature Boundaries table ("`NotificationRepository`, `sendTelegramAlert()`") both name a function that doesn't exist — the implementation is `sendNotification(roleSelectionId, deps)` (`src/features/notifications/application/sendNotification.ts`). Pipeline Agent's report explicitly notes this (remaining risk #8) as "a naming drift similar to Finding #3 but not itself flagged as a finding... left unchanged to keep this fix scoped." Correct call for that agent's scope, but it's real drift that should be tracked.
- **Recommended Action:** Architecture Review Agent: add this as a new numbered finding in `architecture-audit.md` (Low, naming drift — same category as the original Finding #3) so it's tracked for a future doc-fix pass, per `review-process.md` §1.3 ("New findings are appended with the next sequential number").

### N4. (Low) `.github/workflows/scrape.yml` doesn't configure `WELLFOUND_FEED_URL`
- **Severity:** Low
- **File:** `.github/workflows/scrape.yml:27-31` (scrape step `env:` block) vs. `src/features/sources/infrastructure/wellfound/WellfoundScraper.ts:12,56`
- **Reason:** `WellfoundScraper.fetch()` reads `WELLFOUND_FEED_URL` via `optionalEnv(..., "")` and returns `[]` if unset (by design, AD-10-adjacent defensiveness). The new `scrape.yml`'s `npm run scrape` step env block sets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` only — no `WELLFOUND_FEED_URL` secret/var. As written, the cron pipeline's Wellfound source will *always* return zero jobs, indistinguishable from AD-10's "feed structure changed" degraded mode, but actually caused by missing CI configuration. `docs/scrapers.md` doesn't document this env var either, so this isn't a regression introduced by this batch, but `scrape.yml` is a new file and this is the first place the gap becomes operationally relevant.
- **Recommended Action:** Deployment Agent (owns `.github/workflows/**` and secret documentation per `agent-profiles.md` §8): add `WELLFOUND_FEED_URL` to the documented secret/var list and to `scrape.yml`'s scrape-step env block (or explicitly document in `docs/scrapers.md` §4 that Wellfound is expected to be empty until this is configured, if that's intentional for initial go-live).

### N5. (Informational) Pipeline Agent created `.github/workflows/scrape.yml`, a file in its own "Forbidden Files" list
- **Severity:** Informational / process
- **File:** `.github/workflows/scrape.yml`
- **Reason:** `agent-profiles.md` §1 lists `.github/workflows/**` as Forbidden for Pipeline Agent ("belongs to Deployment Agent"). Pipeline Agent's report self-flags this (remaining risk #5) as a deliberate scope exception "because the task explicitly required it in a single session," and requests Deployment Agent / architect review on the next pass. The file itself is well-formed and consistent with `agent-profiles.md` §8's Definition of Done (correct secret names, `vars.KEYWORD_THRESHOLD`/`vars.NOTIFY_THRESHOLD`, references the exact npm scripts Pipeline Agent added).
- **Recommended Action:** Architecture Review Agent: record this exception explicitly (e.g. a one-line note in `architecture-audit.md` or this merge plan is sufficient) so Deployment Agent's next pass treats `scrape.yml` as "review and adjust if needed," not "create from scratch." No functional issue found in the file as written (cross-checked against N4 above, which is the one substantive gap).

---

## Dependency Rule / Layering Check (this batch's diffs only)

- `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` — all are pure composition roots: instantiate `infrastructure` classes via `createSupabaseServiceClient()`, pass them as `deps` into `application` functions (`ingestJobs`, `scoreJob`, `sendNotification`). No `domain`/`application` file imports `infrastructure` or `@supabase/*`. ✅ Matches `architecture.md` §5 rules 2-4.
- `src/features/filtering/application/tagLocations.ts` (new) — pure function, imports only `domain` types and `shared/config` (data, not infra). `shared/config/location-keywords.ts` has zero imports beyond `domain` types. ✅
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts` — `sanitizeRoleForFilter` is a private pure helper inside `infrastructure/`; no new cross-layer imports. ✅
- `src/features/notifications/**` — `formatMatchMessage.ts` (application) has no new imports beyond `domain/types`; `TelegramBotSender.ts` (infrastructure) imports only `shared/infrastructure/{env,http}` and its own `domain` interface. ✅
- `supabase/migrations/20260612000006_*.sql`, `database.types.ts`, `docs/database.md`, `docs/repositories.md` — Database Agent stayed within its allowed files; no `src/**` changes needed or made. ✅
- `src/components/roles/RoleSelectorForm.tsx` — Cleanup Agent stayed within `src/components/**`. ✅
- **U2 (`ThresholdsCard.tsx`)** remains the one outstanding layering violation, pre-existing and unaddressed by this batch (carried over from `dependency-audit.md`, not newly introduced).

No new dependency-rule violations introduced. No forbidden libraries (`prisma`/`drizzle`/`zustand`/`redux`/`react-query`) introduced — `package.json` `dependencies` unchanged, only `tsx` added to `devDependencies`. No `any` introduced (grep-clean, consistent with `tsc --noEmit` passing under `strict`+`noImplicitAny`).

---

## Merge Conflicts

None detected. The four agents' file sets are disjoint as required by `agent-profiles.md`'s "Allowed Files" tables:

| Agent | Files touched (this batch) |
|---|---|
| Pipeline | `scripts/**`, `.github/workflows/scrape.yml`, `package.json` (scripts/devDeps), `tsconfig.json`, `src/shared/config/location-keywords.ts`, `src/features/filtering/application/**`, `src/features/jobs/infrastructure/SupabaseJobRepository.ts` (+ test), `docs/architecture.md` (§3.2) |
| Notification | `src/features/notifications/application/{formatMatchMessage,sendNotification}.ts`, `src/features/notifications/infrastructure/TelegramBotSender.ts` (+ tests) |
| Database | `supabase/migrations/20260612000006_*.sql`, `supabase/database.types.ts`, `docs/database.md`, `docs/repositories.md` |
| Cleanup | `src/components/roles/RoleSelectorForm.tsx` |

The one file two agents *could* have collided on (`docs/architecture.md`) was only touched by Pipeline Agent (§3.2); no overlap occurred. `package.json`'s scripts section (the designated Phase 3 shared-file point with Deployment Agent, per `agent-workflow.md`) was touched only by Pipeline Agent in this batch — consistent with "Pipeline Agent adds the npm scripts first."

---

## Regressions

None detected. `npx tsc --noEmit` is clean and `npx vitest run` reports 28/28 test files and 129/129 tests passing, matching each agent's self-reported validation. No existing test was modified in a way that weakens its assertion (spot-checked `TelegramBotSender.test.ts`, `SupabaseResumeRepository.test.ts`, `SupabaseJobRepository.test.ts`).

---

## Duplicate Implementations

None found beyond the one resolved in R8. No new duplicated DTOs, types, or keyword/scoring logic introduced by any of the four diffs (`skills-dictionary.ts`, `fetchWithRetry`, `stripHtml`/`normalizeWhitespace`, `ActionResult<T>` all remain single-sourced, per `maintainability-audit.md`'s prior "Compliant Areas" — unaffected by this batch).

---

## Decision

# APPROVED WITH CONDITIONS

**Rationale:** The Critical finding (`architecture-audit.md` #1 — cron pipeline) is resolved with correct composition-root structure, passing tests, clean type-check, and the go-live gate correctly left disabled. The two High findings addressed (`maintainability-audit.md` #1, `security-audit.md` #2) are both resolved with regression tests. The High database finding (`database-audit.md` #1) is resolved with a consistent SQL↔types↔code fix. No regressions, no merge conflicts, no new dependency-rule violations, no forbidden libraries/`any` introduced.

**Conditions (must be addressed before Phase 1 is declared closed / before Phase 2-3 work that depends on these files proceeds):**

1. **U1 + U2 + N2** — Cleanup Agent must complete or explicitly defer (with reason) its two remaining Phase-1 items: `frontend.md` §3 `actions.ts` path drift and `ThresholdsCard.tsx`'s `shared/infrastructure` import. Both are small, isolated, within already-allowed files.
2. **P3** — Security Agent must add the `SUPABASE_SERVICE_ROLE_KEY` boundary CI check now that `createSupabaseServiceClient()` has real callers in `scripts/**` (this is the Phase 4 trigger condition for `security-audit.md` #3, and that trigger has now fired).
3. **N1** — Performance Agent (Phase 2) must be briefed on `scrape.ts`'s new dependency on `UpsertResult.{inserted, updated}` before implementing `performance-audit.md` Finding #1, to avoid breaking a now-existing caller.
4. **P1 + N3** — Architecture Review Agent: small follow-up doc edits to `architecture.md` §4 (the `refineWithAI()`/`sendTelegramAlert()` table entries) — low effort, can be bundled with the U1 fix.
5. **P2** — Architecture Review Agent: make an explicit call on `scrape_runs.status`'s `partial` state (architect-approve a `fetchJobs` signature change, or descope via ADR) — don't leave this silently divergent past Phase 1 exit.

None of these conditions require reverting or blocking the current diffs — they are follow-up work items for the next agent dispatch round. **U3, U4, U5, U6, N4, N5** are correctly out-of-scope for this batch and require no action before merge.
