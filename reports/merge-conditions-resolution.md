# Merge Conditions Resolution

**Agent:** Merge Conditions Agent
**Date:** 2026-06-13
**Scope:** Resolve only the merge-blocking conditions from `reports/merge-plan.md`'s "Decision: APPROVED WITH CONDITIONS" list (U1, U2, N2, P1, N3, P2). No new features, no schema changes, no workflow changes, no scraper changes, no performance/security work.

**Validation performed:**
- `npx tsc --noEmit` → clean, no errors.
- `npx vitest run` → 28 test files / 129 tests, all passing.
- Grep confirmed no other references to the changed names/paths were left stale.

---

## Findings Resolved

### U1 — `frontend.md` §3 `actions.ts` path drift (`architecture-audit.md` #4)
- **File:** `docs/frontend.md:53`
- **Change:** `features/roles/application/actions.ts` → `features/<feature>/actions.ts` (e.g. `features/roles/actions.ts`), with a note that this is presentation/composition-root code per `architecture.md` §5 rule 4, not `application/` (rule 2 forbids `application/` from instantiating repositories).
- **Status:** Resolved.

### U2 — `ThresholdsCard.tsx` infrastructure-layer import (`dependency-audit.md` #1)
- **Files:** `src/components/settings/ThresholdsCard.tsx`, `src/app/(protected)/settings/page.tsx`
- **Change:** `ThresholdsCard` no longer imports `@/shared/infrastructure/env`. It now takes `keywordThreshold`/`notifyThreshold` as string props. `SettingsPage` (server component) calls `optionalEnv("KEYWORD_THRESHOLD", "0.5")` / `optionalEnv("NOTIFY_THRESHOLD", "0.75")` and passes the results down.
- **Status:** Resolved. Presentation component no longer reaches into `shared/infrastructure` directly — matches `architecture.md` §5.

### N2 — Cleanup Agent report omitted U1/U2 (process finding)
- **File:** `reports/agent-d-cleanup.md`
- **Change:** Added an "Addendum (Merge Conditions Agent, 2026-06-13)" section documenting that U1 and U2 (previously silently dropped) are now resolved, and updated the summary table to list all three of Cleanup Agent's Phase-1 items with status.
- **Status:** Resolved — all Phase-1-assigned items for this agent are now accounted for (1 resolved in original pass, 2 resolved in addendum).

### P1 — `architecture.md` §4 `refineWithAI` naming drift (`architecture-audit.md` #3, second location)
- **File:** `docs/architecture.md:158` (Feature Boundaries table, `scoring` row)
- **Change:** `ScoreRepository`, `computeKeywordScore()`, `refineWithAI()` → `ScoreRepository`, `scoreJob()`. `refineWithAI` doesn't exist; `computeKeywordScore` is an internal helper of `scoreJob.ts` with no callers outside the `scoring` feature (verified by grep), so it's no longer listed as a separately-exposed API — `scoreJob()` is the single documented entry point, matching §3.2.
- **Status:** Resolved.

### N3 — `architecture.md` `sendTelegramAlert` naming drift
- **Files:** `docs/architecture.md:108` (§3.3), `docs/architecture.md:159` (§4 table, `notifications` row)
- **Change:** §3.3 rewritten to describe the actual `sendNotification(role_selection_id, deps)` flow (`findUnnotifiedMatches` → per-match send + `markNotified`, with try/catch isolation per R6). §4 table: `NotificationRepository`, `sendTelegramAlert()` → `NotificationRepository`, `sendNotification()`.
- **Status:** Resolved.

### P2 — `scrape_runs.status` `partial` semantics (`architecture-audit.md` #2)
- **Files:** `docs/decisions.md` (new AD-13), `docs/scrapers.md:123-131`, `docs/database.md` (scrape_runs row in §3 Table Purposes)
- **Decision:** Descoped via new **AD-13** — `scripts/scrape.ts` continues writing only `success`/`failed`. The `'partial'` enum value remains in the schema (no migration, AD-11 forward-only) but is documented as "reserved, not currently produced." Producing `'partial'` correctly requires a `JobSourceScraper.fetchJobs` signature change (architect-level `domain` change, out of scope here per the "no scraper changes" constraint).
- **Docs updated:** `scrapers.md` §4 status table annotates `partial` as reserved with a cross-reference to AD-13 and a note that `scrape.ts` currently writes only `success`/`failed`; `database.md`'s `scrape_runs` purpose row carries the same cross-reference so schema/docs don't silently diverge.
- **Status:** Resolved (explicit architectural decision made and documented; no schema/scraper code changed).

---

## Files Changed

| File | Change |
|---|---|
| `docs/frontend.md` | U1 — `actions.ts` path fix |
| `docs/architecture.md` | P1 + N3 — §3.3 rewrite, §4 table `scoring`/`notifications` rows |
| `docs/decisions.md` | P2 — new AD-13 |
| `docs/scrapers.md` | P2 — §4 status table annotation |
| `docs/database.md` | P2 — `scrape_runs` purpose row annotation |
| `src/components/settings/ThresholdsCard.tsx` | U2 — props instead of direct env reads |
| `src/app/(protected)/settings/page.tsx` | U2 — reads env, passes props |
| `reports/agent-d-cleanup.md` | N2 — addendum + summary table update |

---

## Architectural Decisions Made

- **AD-13** (new, `docs/decisions.md`): `scrape_runs.status` is effectively binary (`success`/`failed`) for now; `'partial'` is reserved in the enum but not produced, pending a future architect-approved `JobSourceScraper.fetchJobs` change to report per-company failure counts. This directly answers P2's "explicit architectural decision" requirement: **success/failed now, `partial` deferred** (not "success/partial/failed" as currently implemented).

---

## Remaining Unresolved Findings

Everything else in `merge-plan.md` is unchanged and intentionally out of scope for this pass:

- **N1** — Performance Agent must be briefed on `scrape.ts`'s dependency on `UpsertResult.{inserted, updated}` before Phase 2 (`performance-audit.md` #1). No action taken.
- **N4** — `.github/workflows/scrape.yml` doesn't configure `WELLFOUND_FEED_URL` (Deployment Agent's item). No action taken.
- **N5** — Informational note re: Pipeline Agent creating `scrape.yml` outside its allowed files. No action needed beyond the merge plan's own record.
- **P3** — Security Agent must add the `SUPABASE_SERVICE_ROLE_KEY` boundary CI check (Phase 4 trigger now fired). No action taken — explicitly Security Agent's scope, and "no security enhancements" is a constraint of this pass.
- **U3** — resume upload raw `file.name` in Storage path (`security-audit.md` #1) — Security Agent's item, correctly out of scope.
- **U4** — `hasScore` dead code (Phase 4 cleanup) — not part of this batch's conditions, deferred per `agent-workflow.md` Phase 4.
- **U5** — Performance Agent's Phase 2 findings — untouched.
- **U6** — cron schedule go-live gate (`scrape.yml`) — human-gated, untouched.

None of these were part of the five conditions listed in `merge-plan.md`'s decision, so they remain open for their originally-assigned agents/phases.

---

## Decision

# APPROVED

**Rationale:** All five numbered conditions from `merge-plan.md`'s "APPROVED WITH CONDITIONS" decision that fall within this agent's remit (U1, U2, N2, P1, N3, P2) are now resolved:

1. U1 + U2 + N2 — both of Cleanup Agent's previously-dropped Phase-1 items (`frontend.md` path drift, `ThresholdsCard` layering violation) are fixed, and the Cleanup Agent's report now accounts for all three of its assigned items.
2. P1 + N3 — `architecture.md` §4's `scoring`/`notifications` table entries and §3.3 now match the actual `scoreJob()`/`sendNotification()` implementations.
3. P2 — an explicit architectural decision (AD-13) was made on `scrape_runs.status`: **success/failed implemented now, `partial` reserved/deferred**, with `scrapers.md` and `database.md` updated to match and stay in sync.

Condition 2 from the merge plan (**P3**, Security Agent's `SUPABASE_SERVICE_ROLE_KEY` CI check) is explicitly out of scope for this agent ("no security enhancements") and remains for the Security Agent — it was never assigned to this pass's task list and does not block this merge per the task's own scope.

`npx tsc --noEmit` is clean and all 129 tests pass. No schema, scraper, workflow, or feature changes were made — only documentation and presentation-layer prop-threading (U2). No new merge conflicts or dependency-rule violations introduced.
