# Post-Merge Audit

**Reviewer:** Architecture Review Agent (post-implementation pass)
**Date:** 2026-06-13
**Scope:** Full repo state after `merge-plan.md` (APPROVED WITH CONDITIONS) + `merge-conditions-resolution.md` (APPROVED). Cross-checked against `CLAUDE.md`, `docs/**`, all `reports/*-audit.md`, `reports/merge-plan.md`, `reports/merge-conditions-resolution.md`.

**Validation performed:**
- `npx tsc --noEmit` → clean, no errors.
- `npx vitest run` → 28 test files / 129 tests, all passing.
- Re-read every file touched by `merge-conditions-resolution.md` against its claimed change.
- Grep-verified status of every still-open item (U3-U6, N1, N4, N5, P3) from `merge-plan.md`.

---

## Resolved Findings

### U1 — `frontend.md` §3 `actions.ts` path drift (`architecture-audit.md` #4)
`docs/frontend.md:53` now reads `features/<feature>/actions.ts` (e.g. `features/roles/actions.ts`), with the presentation/composition-root note. Confirmed.

### U2 — `ThresholdsCard.tsx` infra-layer import (`dependency-audit.md` #1)
`src/components/settings/ThresholdsCard.tsx` takes `keywordThreshold`/`notifyThreshold` as props, no `shared/infrastructure` import. `src/app/(protected)/settings/page.tsx` reads both via `optionalEnv` and passes them down. Layering restored per `architecture.md` §5. Confirmed.

### N2 — Cleanup Agent report omission (process finding)
`reports/agent-d-cleanup.md` now has an "Addendum" documenting U1/U2 and an updated summary table covering all 3 of its Phase-1 items. Confirmed.

### P1 — `architecture.md` §4 `refineWithAI` drift, 2nd location (`architecture-audit.md` #3)
`docs/architecture.md:159` `scoring` row now lists `ScoreRepository`, `scoreJob()` — `refineWithAI` gone. Confirmed (1st location, §3.2 line 95, was already fixed pre-batch).

### N3 — `architecture.md` `sendTelegramAlert` drift
`docs/architecture.md:106` (§3.3) and `:160` (§4 `notifications` row) both now say `sendNotification()`. §3.3 narrative matches the actual try/catch-isolated implementation. Confirmed.

### P2 — `scrape_runs.status` `partial` semantics (`architecture-audit.md` #2)
New **AD-13** in `docs/decisions.md:151-159`: `scrape.ts` writes only `success`/`failed`; `'partial'` reserved in the enum, cross-referenced and annotated consistently in `docs/scrapers.md:128,131` and `docs/database.md:167`. Schema/docs no longer silently diverge. Confirmed.

### R1-R9 (carried from `merge-plan.md`, re-verified, no drift)
- R1 cron pipeline (`scripts/scrape.ts`/`score.ts`/`notify.ts`, `.github/workflows/scrape.yml`) — present, `tsc`/`vitest` clean.
- R2 `sanitizeRoleForFilter` in `SupabaseJobRepository.ts` — present, tests pass.
- R3 RPC return-type fix (migration `20260612000006`) — `database.types.ts` consistent.
- R4 `database.md` nullable-column drift — fixed.
- R5 `repositories.md` `set_active_resume`/`set_active_role_selection` signature drift — fixed.
- R6 notification send-loop error isolation (`sendNotification.ts:21-39`) — try/catch + continue, test present.
- R7 Telegram HTML-escape (`formatMatchMessage.ts`, `TelegramBotSender.ts`) — `escapeHtml()`, `parse_mode: "HTML"`, retry-after handling, tests present.
- R8 `RoleSelectorForm.tsx` `Preview.source: RoleMapSource` — fixed.
- R9 `recordRun` now called from `scripts/scrape.ts` — no longer dead code.

All 14 fully-resolved items from the merge batch + conditions pass remain resolved with no drift back.

---

## Open Findings

### P3 (High, live) — `security-audit.md` #3: no CI/lint boundary check for `SUPABASE_SERVICE_ROLE_KEY`
- **File:** N/A (missing check); relevant code: `src/shared/infrastructure/supabaseClient.ts`, `scripts/*.ts`
- **Status:** Unresolved. `merge-plan.md` flagged this as the Phase-4 trigger condition that "has now fired" — `createSupabaseServiceClient()` has 3 real callers in `scripts/**` since R1 landed. Verified via grep: `SUPABASE_SERVICE_ROLE_KEY` only appears in `.github/workflows/scrape.yml` (3x, all in `scripts/*` job steps) — currently safe, but no automated guard prevents a future `src/app/**` or `"use client"` file from importing `createSupabaseServiceClient` or referencing this env var.
- **Recommended Action:** Security Agent: add the grep-based CI check (`SUPABASE_SERVICE_ROLE_KEY` / `createSupabaseServiceClient` only under `scripts/**` and `shared/infrastructure/supabaseClient.ts`) per `security-audit.md` #3's own recommended fix and `merge-plan.md` condition 2. This was an explicit merge condition that `merge-conditions-resolution.md` correctly left out of scope but did not close.

### U3 (Medium) — `security-audit.md` #1: resume upload uses raw `file.name` in Storage path
- **File:** `src/features/resume/actions.ts:36` — confirmed still `` const filePath = `${Date.now()}-${file.name}` ``.
- **Status:** Unresolved, correctly out of scope for all batches so far (Security Agent's item).
- **Recommended Action:** Security Agent: derive storage path from `Date.now()` + `randomUUID()`, store original filename separately if needed for display.

### U4 (Low) — `maintainability-audit.md` #3: `hasScore` dead code
- **File:** `src/features/scoring/domain/ScoreRepository.ts:10`, `src/features/scoring/infrastructure/SupabaseScoreRepository.ts:24` (+ tests at `SupabaseScoreRepository.test.ts:42-58`, mock at `scoreJob.test.ts:49`).
- **Status:** Unresolved — confirmed zero non-test callers remain. `merge-plan.md` U4 said the blocking condition ("no caller emerged from `scripts/score.ts`") is now satisfied, i.e. ready for removal.
- **Recommended Action:** Cleanup Agent (Phase 4): remove `hasScore` from interface, implementation, and both test references.

### U5 (Medium/Low) — Performance Agent's Phase-2 findings, all 4 untouched
- **Files:** `SupabaseJobRepository.ts` (`upsertMany`'s redundant `findExistingKeys` SELECTs — perf #1/cost #3; `findForDashboard`'s JS-side `minAiScore` filter — perf #2; `findUnscored`'s unbounded `.not("id","in",...)` — perf #4/scraper #2/cost #4), `SupabaseNotificationRepository.ts` (`findUnnotifiedMatches` JS-side filter — perf #3).
- **Status:** Unresolved, confirmed code unchanged from audited state. Expected — Phase 2, not yet started.
- **Recommended Action:** No action this pass. See N1 below for a new pre-condition Performance Agent must account for.

### U6 (by design) — cron schedule go-live gate
- **File:** `.github/workflows/scrape.yml:10-13` — `schedule:` block still commented out, `workflow_dispatch` only.
- **Status:** Correctly untouched. Human-gated Phase 4 decision.

### N1 (Medium) — Performance Agent must be briefed on `scrape.ts`'s `UpsertResult.{inserted,updated}` dependency
- **File:** `scripts/scrape.ts:43` vs. `SupabaseJobRepository.ts:80-103`.
- **Status:** Unresolved — confirmed `scrape.ts` still logs `inserted ${result.inserted}, updated ${result.updated}`. No briefing artifact exists yet for Performance Agent.
- **Recommended Action:** Carry forward verbatim into Performance Agent's Phase-2 task brief: prefer computing `{inserted, updated}` from the upsert response itself rather than removing the fields, or coordinate a joint `scrape.ts` update if the `void`-return variant is chosen.

### N4 (Low) — `scrape.yml` doesn't configure `WELLFOUND_FEED_URL`
- **File:** `.github/workflows/scrape.yml:27-31` vs. `WellfoundScraper.ts:12,56`.
- **Status:** Unresolved, confirmed. Wellfound source will return `[]` every run until this is set — operationally indistinguishable from AD-10's degraded mode but caused by missing config.
- **Recommended Action:** Deployment Agent: add `WELLFOUND_FEED_URL` to `scrape.yml`'s scrape-step env + document expected/optional status in `docs/scrapers.md` §4.

### N5 (Informational) — `scrape.yml` created by Pipeline Agent outside its allowed files
- **Status:** Recorded in `merge-plan.md`; no functional issue (cross-checked, only gap is N4). No further action needed beyond Deployment Agent's next pass treating it as "review," not "create."

---

## New Findings

### N6 (Low) — No `.gitignore` at repo root
- **File:** repo root — no `.gitignore` found; `tsconfig.tsbuildinfo` (188KB build artifact) sits at root alongside source.
- **Why it matters:** Not a regression from this batch, but the repo has grown a real CI/cron pipeline (R1) and `node_modules`/`tsconfig.tsbuildinfo`/`.env*` now have real consequences if accidentally committed once version control is initialized. Low severity since no secrets are currently present at root, but worth closing before any push to a shared remote.
- **Recommended Action:** Add a standard Next.js/Node `.gitignore` (`node_modules/`, `*.tsbuildinfo`, `.env*`, `.next/`) before the repo is pushed anywhere. No code/architecture impact — Cleanup Agent or Deployment Agent, either is fine.

No other new findings. No regressions: `tsc --noEmit` clean, 129/129 tests pass (matches both prior reports' validation). No merge-conflict markers, no new dependency-rule violations, no forbidden libraries (`prisma`/`drizzle`/`zustand`/`redux`/`react-query`), no `any` introduced.

---

## Scores

| Dimension | Score (/10) | Rationale |
|---|---|---|
| **Architecture** | 9 | Critical Finding #1 (cron pipeline) fully resolved with correct composition-root pattern. All 6 architecture-audit findings closed or explicitly descoped via ADR (AD-13). Dependency rules clean across the whole batch + conditions pass. Only gap: N1/N4/N5 are coordination notes, not architecture defects. |
| **Security** | 6 | High finding (R7, Telegram HTML-escape) resolved with tests. But **P3 is a live, unresolved High-severity gap** — `SUPABASE_SERVICE_ROLE_KEY` now has real `scripts/**` callers with no CI boundary check, exactly the trigger condition `merge-plan.md` called out. U3 (Medium, resume filename → Storage path) also remains open. Neither blocks current functionality, but both are explicit, named, unresolved security debt. |
| **Maintainability** | 8 | 3/5 maintainability findings resolved (R6, R8, R9) with regression tests. U4 (`hasScore` dead code) is now unblocked but not yet removed — small, low-risk. N6 (missing `.gitignore`) is new but trivial. |
| **Performance** | 6 | All 4 performance-audit findings (Medium/Low) remain untouched — expected (Phase 2 not started), but the cron pipeline going live (R1) means these query patterns now run on a real schedule once U6 is lifted, raising their effective priority. N1 adds a coordination cost to the eventual fix. |
| **Cost** | 7 | Cron schedule remains disabled (U6), so no live recurring cost yet — cost-audit Finding #1's "theoretical" framing still mostly holds. cost-audit #3/#4 (cross-refs to U5) remain open and will become real once U6 is lifted. N4 means Wellfound contributes zero value for its (currently zero) cost — neutral but worth fixing before go-live cost modeling. |

---

## Decision

# NOT READY

**Rationale:** No Critical or regression-class issues remain — `tsc`/`vitest` are clean, all architecture/dependency/doc-drift findings from this batch and the prior conditions pass are genuinely resolved with no re-drift. However, two items explicitly named as **merge conditions** in `merge-plan.md` are still open:

1. **P3** — the Security Agent's `SUPABASE_SERVICE_ROLE_KEY` CI boundary check. `merge-plan.md` stated this trigger condition "has now fired" (real `scripts/**` callers exist) and listed it as a condition that "must be addressed... before Phase 2-3 work that depends on these files proceeds." It was correctly out-of-scope for `merge-conditions-resolution.md`'s pass, but remains unaddressed.
2. **U3** — Medium-severity resume-upload filename issue, still open, Security Agent's item.

Both are small, isolated, single-owner fixes (Security Agent, `agent-profiles.md` §6). Recommend dispatching Security Agent for P3 + U3 next, then re-running this audit — at that point the repo should clear to **READY FOR DEPLOYMENT REVIEW** modulo U4/N1/N4/N6 (all Low, non-blocking cleanup). U5/U6 remain correctly deferred to Phase 2/4 and do not block the deployment-review gate themselves.
