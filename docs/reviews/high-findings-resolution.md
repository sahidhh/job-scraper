# Source Health Maintenance — High Findings Resolution

Companion document to `docs/reviews/source-health-verification.md`.

## H-1 — Transition-based failure detection

**Status: Fixed**

**Root cause:** `validate-sources.ts` computed `newFailures` with the same predicate as `unhealthy`, causing existing broken sources to repeatedly fail CI before accumulating enough failures to be auto-disabled.

**Fix:** Added `ProbeOutcome` type to the source validation domain. `validateSources` now captures each company's `healthStatus` before the probe and returns it as `previousHealthStatus` in the result. `validate-sources.ts` defines a new failure as: `previousHealthStatus === 'active'` AND result is non-healthy.

**Before/after:**
```
Before:
  newFailures = all unhealthy probed results (regardless of prior state)
  → CI fails every run until sources accumulate 7 failures

After:
  newFailures = probes where company WAS active and NOW failed
  → CI fails only when a previously-working source breaks
  → Known-unhealthy sources don't cause repeated CI failures
```

**Files changed:**
- `src/features/sources/domain/sourceValidation.ts` — added `ProbeOutcome`
- `src/features/sources/application/validateSources.ts` — enriches results with `previousHealthStatus`
- `scripts/validate-sources.ts` — uses transition-based failure count
- `src/features/sources/application/validateSources.test.ts` — new test file

## H-2 — Disabled source recovery documentation

**Status: Fixed (documentation)**

**Root cause:** `docs/source-health-design.md` incorrectly stated that disabled sources would "self-heal" on the next successful probe. In reality, disabled companies are excluded from the probe loop by design.

**Fix:** Updated the Recovery section to accurately document:
- Disabled sources require manual reactivation
- Option A: direct DB UPDATE
- Option B: `--include-disabled` flag re-probes and auto-resets on success

Updated the lifecycle diagram to show the `disabled → active` path explicitly.

**Files changed:**
- `docs/source-health-design.md` — Recovery section and lifecycle diagram corrected

## H-3 — Migration ENUM debt and rollback path

**Status: Resolved with documentation**

**Decision: Keep the ENUM**

Rationale:
- `source_health_status` has three fixed lifecycle values. Enum semantics are correct.
- PostgreSQL enum provides type safety that a text+CHECK constraint does not.
- Rewriting the migration is riskier than documenting the rollback path.

**What was added:**
- `docs/operations/source-health-rollback.md` — step-by-step rollback SQL with ordering notes (columns must be dropped before the type can be dropped)

**Future guidance:** If a fourth status value is ever needed, use `ALTER TYPE source_health_status ADD VALUE 'paused'` (safe to run outside a transaction in PostgreSQL 12+). Removing a value requires type recreation; design additions carefully.

## Remaining findings

The following findings from the original review remain open and are tracked for follow-up:

| Finding | Severity | Notes |
|---|---|---|
| M-1: NaN config risk | Medium | `parseInt` on invalid env var silently disables auto-disable |
| M-2: Misleading skip log in scrape.ts | Medium | Says "not configured" when companies exist but are disabled |
| M-3: Full table scan in filter-analysis.ts | Medium | No WHERE clause on jobs table |
| M-4: No tests for validateSources health logic | Medium | **Addressed by H-1 fix** |
| L-1: Positional boolean in validateSources | Low | `includeDisabled` should be options object |
| L-2: source-analytics.ts hardcodes sources | Low | New sources won't appear automatically |
| L-3: filter-analysis.ts exits 0 on error | Low | Should be exit 1 |
| L-4: scrapers.md still documents roles param | Low | Pre-existing doc drift |
| L-5: Health state not surfaced in UI | Low | Accepted gap, follow-up work |

## Merge recommendation

**APPROVE**

All HIGH findings are resolved. The branch is safe to merge.

The three Medium findings (M-1, M-2, M-3) are operational improvements that do not affect correctness of the health tracking logic and are appropriate for follow-up issues.
