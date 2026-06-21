# Source Health Maintenance — Pre-Merge Verification Review

**Branch:** `claude/bold-franklin-ni4obc`
**Reviewed:** 2026-06-20
**Scope:** All changes from the source-health-maintenance feature set

---

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 3 |
| Medium   | 4 |
| Low      | 5 |

---

## HIGH Findings

---

### H-1 — Validation still fails for unhealthy (not-yet-disabled) sources

**File:** `scripts/validate-sources.ts` lines 44–48

**Code:**
```typescript
const unhealthy = all.filter(
  (r) => r.status !== "healthy" && r.status !== "redirected",
).length;

// ... later ...

const newFailures = all.filter(
  (r) => r.status !== "healthy" && r.status !== "redirected",
).length;

if (newFailures > 0) {
  process.exitCode = 1;
}
```

**Problem:** `newFailures` and `unhealthy` are computed with the exact same predicate. The variable name `newFailures` implies "sources that broke this run" but the logic detects "any probed source that is not healthy right now." Sources in `unhealthy` state (failed 1–6 times, below the disable threshold) are still included in the probe loop and will produce non-healthy results, triggering `process.exitCode = 1`.

**Effect on the stated goal:** The original problem is 25 sources returning 404. Post-migration, all 25 have `consecutive_failures = 0` (new columns default to 0). On the first validation run, all 25 fail, are incremented to `consecutive_failures = 1`, and are set to `unhealthy`. The CI workflow **still exits 1**. This repeats for runs 2–6. Only after 7 consecutive validation runs will those sources reach the disable threshold and be excluded. The CI breakage is not fixed immediately; it is fixed 7 validation cycles later.

**Design intent (from `docs/source-health-design.md`):**
> "Exits 1 only when: A previously-active/unhealthy source probe fails (newly broken)"

The intent implies exit 0 for sources that have been failing consistently and are known-unhealthy. The implementation does not match — it exits 1 for all current unhealthy results indiscriminately.

**Correct fix direction:** Track the source's `healthStatus` before and after the probe. A "new failure" should be defined as: `company.healthStatus === 'active'` before the probe AND the result is non-healthy. Sources already in `unhealthy` state are known-bad and should not increment the CI failure counter.

---

### H-2 — Disabled source recovery is not automatic; design doc claims otherwise

**File:** `docs/source-health-design.md` (Recovery section), `src/features/sources/application/validateSources.ts` lines 38–45

**Design doc states:**
> "To manually re-enable a disabled source, update `health_status = 'active'` and `consecutive_failures = 0` directly in the database, **or wait for the next successful probe (which auto-resets)**."

**Code reality:**
```typescript
const matching = companies.filter(
  (c) =>
    c.source === validator.source &&
    c.active &&
    c.boardToken !== null &&
    (includeDisabled || c.healthStatus !== "disabled"),  // ← disabled = excluded
);
```

Disabled companies are excluded from every normal validation run. In normal operation (without `--include-disabled`), a disabled source is **never probed**, so it can never self-heal. The phrase "wait for the next successful probe" in the design doc is false — no probe is attempted unless `--include-disabled` is explicitly passed.

**Recovery path:** Requires manual operator action. Either:
1. Direct DB update: `UPDATE companies SET health_status='active', consecutive_failures=0 WHERE ...`
2. Run `npx tsx scripts/validate-sources.ts --include-disabled` AND the source must return healthy on that run

Neither path is documented in the script's output, a runbook, or the operations docs. Operators hitting this for the first time will not know how to recover a disabled source.

**State transition diagram in the design doc is incomplete:** The lifecycle diagram in the design doc does not show the `disabled → active` transition path at all.

---

### H-3 — Migration has no rollback path; ENUM type creates permanent schema debt

**File:** `supabase/migrations/20260619000010_source_health.sql`

```sql
CREATE TYPE source_health_status AS ENUM ('active', 'unhealthy', 'disabled');

ALTER TABLE companies
  ADD COLUMN health_status source_health_status NOT NULL DEFAULT 'active',
  ...
```

**Problems:**

**a) No rollback DDL.** Supabase migrations are applied forward-only but operators may need to roll back during an incident. Reversing this migration requires:
```sql
ALTER TABLE companies
  DROP COLUMN health_status,
  DROP COLUMN consecutive_failures,
  DROP COLUMN last_success_at,
  DROP COLUMN last_failure_at;
DROP TYPE source_health_status;
```
This is not included and not documented. Under time pressure, missing rollback DDL increases incident duration.

**b) PostgreSQL ENUM evolution is costly.** Adding a new status value (e.g., `'paused'`) requires `ALTER TYPE source_health_status ADD VALUE 'paused'` — this cannot be done inside a transaction in PostgreSQL <12 and has limitations in >=12. Removing a value requires recreating the type. This design choice limits future flexibility.

**c) No explicit transaction wrapping.** If `CREATE TYPE` succeeds but `ALTER TABLE` fails (e.g., due to a concurrent lock), the migration leaves a dangling `source_health_status` type. Re-running the migration will fail with `ERROR: type "source_health_status" already exists`. The migration is not idempotent.

**Recommendation:** Add `IF NOT EXISTS` variants where available, provide rollback DDL, and consider using a `text` column with a `CHECK` constraint instead of an ENUM for easier future evolution:
```sql
ADD COLUMN health_status text NOT NULL DEFAULT 'active'
  CHECK (health_status IN ('active', 'unhealthy', 'disabled'))
```

---

## MEDIUM Findings

---

### M-1 — Invalid env var silently disables auto-disable

**File:** `src/features/sources/domain/sourceHealthConfig.ts`

```typescript
export const SOURCE_HEALTH_CONFIG = {
  disableAfterConsecutiveFailures: parseInt(
    process.env.SOURCE_DISABLE_THRESHOLD ?? "7",
    10,
  ),
  minimumHealthyCount: parseInt(
    process.env.MIN_HEALTHY_SOURCE_COUNT ?? "3",
    10,
  ),
} as const;
```

**Problem:** `parseInt("abc", 10)` and `parseInt("", 10)` both return `NaN`. The comparison `consecutiveFailures >= NaN` always evaluates to `false`. Setting `SOURCE_DISABLE_THRESHOLD=abc` means sources are **never auto-disabled**, and the feedback to the operator is silent — no error is logged, no exception is thrown.

**Compounded by module-level evaluation:** This config object is evaluated once at module import. If the env var is not set at import time (e.g., in certain test setups), the value is frozen.

**Fix direction:** Validate and throw on startup:
```typescript
function parsePositiveInt(raw: string | undefined, name: string, defaultValue: number): number {
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer, got: ${raw}`);
  return parsed;
}
```

---

### M-2 — `scrape.ts` skip message is misleading when companies are disabled (not missing)

**File:** `scripts/scrape.ts` lines 22–25

```typescript
const companies = scraper.requiresCompanyConfig
  ? await companyRepository.listActiveHealthy(scraper.source)
  : [];

if (scraper.requiresCompanyConfig && companies.length === 0) {
  console.log(`[scrape] ${scraper.source}: no active companies configured, skipping`);
```

**Problem:** `listActiveHealthy` returns only `health_status != 'disabled'` companies. If a source has companies configured but ALL are disabled, `companies.length === 0` is true, and the log says "no active companies configured" — which implies a configuration problem, not a health problem. An operator reading this log would check the company configuration unnecessarily.

**Fix direction:** Return a count of total active companies alongside healthy ones, or use a distinct log message:
```
[scrape] greenhouse: all 3 active companies are disabled (health_status=disabled), skipping
```

---

### M-3 — `filter-analysis.ts` performs full table scan on `jobs`

**File:** `scripts/filter-analysis.ts` lines 60–63

```typescript
const { data: jobRows, error: jobError } = await client
  .from("jobs")
  .select("source, location_tags");
```

**Problem:** No WHERE clause, no LIMIT. This fetches every row in `jobs`. At scale (tens of thousands of rows over months of scraping), this query will be slow, consume significant memory in the script process, and put unnecessary load on Postgres. The result is used only to count totals and zero-tag jobs by source — a DB-side aggregation would be far more efficient.

**Fix direction:**
```sql
SELECT source, COUNT(*) as total,
  COUNT(*) FILTER (WHERE array_length(location_tags, 1) IS NULL OR array_length(location_tags, 1) = 0) AS no_tags
FROM jobs
GROUP BY source;
```

---

### M-4 — No tests for `validateSources` health update logic

**File:** `src/features/sources/application/validateSources.ts` (the most critical new logic)

**Problem:** `validateSources.test.ts` does not exist. The `applyHealthUpdate` function — which controls all state transitions — has zero test coverage. The state machine logic (`active → unhealthy`, `unhealthy → disabled`, recovery resets) is untested. This is the core of the feature.

**Particular risks:**
- The threshold comparison: `consecutiveFailures >= SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures`. Off-by-one errors here mean sources disable one run early or late.
- The `SupabaseCompanyRepository.updateHealth` is called with `await` inside `Promise.all` — errors in individual updates are not caught and will cause the entire `validateSources` call to reject.

**CLAUDE.md requirement:** "All new features require: domain → application → infrastructure → **tests** before UI."

---

## LOW Findings

---

### L-1 — `validateSources` uses positional boolean for `includeDisabled`

**File:** `src/features/sources/application/validateSources.ts` line 36

```typescript
export async function validateSources(
  validators: readonly SourceValidator[],
  companies: readonly Company[],
  companyRepository: CompanyRepository,
  includeDisabled = false,       // ← positional boolean
): Promise<ValidationGroup[]>
```

Positional booleans (`validateSources(..., ..., ..., true)`) are opaque at the call site and brittle if the signature gains more parameters. An options object pattern would be more explicit and extensible:
```typescript
{ includeDisabled?: boolean }
```

---

### L-2 — `source-analytics.ts` hardcodes the source list

**File:** `scripts/source-analytics.ts` lines 15–22

```typescript
const ALL_SOURCES = [
  "greenhouse", "lever", "ashby",
  "wellfound", "remoteok", "mycareersfuture",
] as const;
```

When a new source is added to the `job_source` enum and a scraper ships, `source-analytics.ts` will silently omit it until `ALL_SOURCES` is updated manually. There is no compile-time or runtime guard to detect this drift.

---

### L-3 — `filter-analysis.ts` exits 0 on query error (masks failures)

**File:** `scripts/filter-analysis.ts` lines 31–34 and 68–72

```typescript
if (error) {
  console.error("[filter-analysis] query failed:", error.message);
  process.exit(0);   // ← exits 0 on error
}
```

Both DB queries exit with code 0 on failure, and the catch handler at the bottom also exits 0:
```typescript
main().catch((err) => {
  console.error("[filter-analysis] fatal error:", err);
  process.exit(0);   // ← also 0
});
```

An operator running this in CI or a scheduled job gets no signal that the script failed. Exit code should be 1 on errors. (Exit 0 for the no-data case is fine.)

---

### L-4 — RemoteOK: role filter removed without documentation

**File:** `src/features/sources/infrastructure/remoteok/RemoteOkScraper.ts`

The original scraper (per `docs/scrapers.md` documentation) was supposed to accept `roles: readonly string[]` and apply `jobMatchesRoles` filtering. The new implementation:
```typescript
async fetchJobs(_companies: Company[]): Promise<RawJob[]>
```

The `roles` parameter is gone from the interface (`JobSourceScraper.ts`) and from all adapters. The decision to drop role-aware fetching is not documented in `docs/decisions.md` (no new Architecture Decision Record), and `docs/scrapers.md` still documents the `roles` parameter and role-aware behavior as present.

This is a pre-existing divergence (the base branch also lacked role-aware fetching), but the PR should explicitly acknowledge and document this architectural change rather than leaving the docs stale.

---

### L-5 — Health state visible in DB but not surfaced in /settings UI

The `/settings` page already shows scrape run history. The new `health_status`, `consecutive_failures`, `last_failure_at` fields on `companies` are stored but not surfaced anywhere in the UI. Operators must query the database directly to see which sources are disabled or approaching the threshold.

This is an accepted gap (CLAUDE.md pattern: domain → application → infrastructure first), but it should be tracked as known follow-up work.

---

## Verification of Specific Review Questions

### Is health stored on the correct entity?

**Yes, with caveats.** Health is stored on `companies`, which is the right entity for ATS sources that require per-company board tokens (Greenhouse, Lever, Ashby). Each company row uniquely represents one (company, source, board_token) triple.

Feed-based sources (RemoteOK, Wellfound, MyCareersFuture) have no rows in `companies` and therefore have no health tracking via this mechanism. Their health is visible only through `scrape_runs.status`. This is a reasonable design choice but should be explicitly stated in `docs/source-health-design.md`.

### Does company == source assumption hold?

**No such assumption is made.** The implementation correctly handles many companies per source and tracks health at the board-token level, not at the source level. This is correct behavior.

### Could future ATS changes break this design?

**One risk:** If a company migrates from Greenhouse to Ashby, it would need a new companies row (different source enum). The old row (now stale) would accumulate failures and eventually be disabled — which is the correct behavior. No code change needed.

**Structural risk:** The ENUM-based `health_status` makes adding new status values expensive (see H-3).

### State transitions

| Transition | Implemented | Correct? |
|---|---|---|
| `active → unhealthy` | `applyHealthUpdate`: failure, `consecutiveFailures < threshold` | ✅ Yes |
| `unhealthy → active` | `applyHealthUpdate`: success, resets to active | ✅ Yes |
| `unhealthy → disabled` | `applyHealthUpdate`: failure, `consecutiveFailures >= threshold` | ✅ Yes, but note the threshold is read at module load, not per-call |
| `disabled → active` | Requires `--include-disabled` flag + healthy probe | ⚠️ Works but not documented; see H-2 |

### Recovery after disable

Manual intervention required. The flag `--include-disabled` must be passed explicitly. A disabled source does not participate in normal validation runs and therefore cannot self-heal. The design doc's claim otherwise is incorrect (H-2).

### Scraping behavior

| State | Scraped? | Validated? |
|---|---|---|
| `active` | ✅ Yes (`listActiveHealthy` returns it) | ✅ Yes (not filtered) |
| `unhealthy` | ✅ Yes (`listActiveHealthy` returns it — only `disabled` is excluded) | ✅ Yes (not filtered) |
| `disabled` | ❌ No (`listActiveHealthy` excludes `health_status = 'disabled'`) | ❌ No (filtered unless `--include-disabled`) |

Unhealthy sources are correctly still scraped. The scrape loop handles per-company errors gracefully (try/catch per company in adapters), so a board returning 404 at scrape time will not block other companies.

### Validation workflow failure conditions

**Intended:** Fail only when active source becomes broken OR healthy count below threshold.

**Actual:** Fails whenever ANY probed source (active or unhealthy) returns non-healthy. This is a gap — see H-1.

### Analytics queries

**`source-analytics.ts`:** Uses `.gte("run_at", ...)` on an indexed column (`scrape_runs_run_at_idx`). Efficient.

**`filter-analysis.ts`:** The `scrape_runs` query is indexed. The `jobs` query is a full table scan — see M-3.

---

## Merge Recommendation

**APPROVE WITH CHANGES**

The core architecture is sound: health metadata belongs on `companies`, the state machine is correctly structured, and the migration is production-safe for apply (defaults are provided). However, three issues must be addressed before this branch can deliver on its stated goal:

**Must fix before merge:**
1. **H-1:** The CI workflow will continue failing for 7 validation cycles post-migration. The `newFailures` variable must be redefined to count only transitions from `active` → non-healthy, not all current unhealthy results. Without this, the feature does not fix the immediate problem it was built to solve.
2. **H-2:** The design doc must be corrected: disabled sources do not self-heal. A recovery runbook (how to re-enable with `--include-disabled` or direct DB update) must be added to the design doc and operations docs.
3. **M-4:** Add tests for `validateSources` health update logic — at minimum the four state transitions and the threshold boundary condition.

**Can merge and fix in follow-up:**
- H-3 (migration rollback DDL) — add the rollback SQL to a companion doc before the migration runs in production
- M-1 (NaN config risk) — low probability but easy fix
- M-2 (misleading log message)
- M-3 (jobs table scan in filter-analysis.ts)
- L-3 (exit code on error in filter-analysis.ts)
- L-4 (decisions.md ADR for roles removal)
- L-5 (UI surfacing of health data)
