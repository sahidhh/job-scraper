# Source Health Tracking

## Problem

The `validate-sources.ts` script probes all active companies with board tokens and exits with code 1 if any source returns a non-200 response. With 25 sources returning 404 (board tokens that have gone stale), every CI run of `validate-sources.yml` fails — making the workflow useless as an alerting tool for new breakage.

## Solution

Add source health tracking to the `companies` table. Each company tracks its consecutive failure count and a lifecycle status. After a configurable number of consecutive failures, a source is automatically disabled. Disabled sources are excluded from both validation probing and scraping, so the noise from permanently-broken boards does not mask newly-broken ones.

## Health Status Lifecycle

```
                probe OK
  active ──────────────────► active
    │                           ▲
    │ probe fails               │ probe OK (any run)
    ▼                           │
  unhealthy ──────────────────► (reset)
    │                           ▲
    │ consecutive_failures       │ manual DB update
    │   ≥ SOURCE_DISABLE_        │   OR --include-disabled
    │   THRESHOLD                │   + probe OK
    ▼                           │
  disabled ────────────────────►
```

| Status | Description | consecutive_failures |
|---|---|---|
| `active` | Source is responding normally | 0 (reset on success) |
| `unhealthy` | Probe has failed but threshold not reached | 1 … threshold-1 |
| `disabled` | Auto-disabled; excluded from scraper and probe loop | ≥ threshold |

## Database Columns Added

Migration `20260619000010_source_health.sql` adds to `companies`:

| Column | Type | Default | Description |
|---|---|---|---|
| `health_status` | `source_health_status` enum | `active` | Current lifecycle state |
| `consecutive_failures` | `integer` | `0` | Count of back-to-back probe failures |
| `last_success_at` | `timestamptz` | `null` | Timestamp of last healthy/redirected probe |
| `last_failure_at` | `timestamptz` | `null` | Timestamp of last failed probe |

New enum: `source_health_status = 'active' | 'unhealthy' | 'disabled'`

## Configuration

Two environment variables control thresholds (both optional with safe defaults):

| Variable | Default | Description |
|---|---|---|
| `SOURCE_DISABLE_THRESHOLD` | `7` | Consecutive failures before a source is set to `disabled` |
| `MIN_HEALTHY_SOURCE_COUNT` | `3` | Minimum number of healthy (active/redirected) probes; CI fails if count drops below this |

## Validation Behavior Change

Before: exits 1 if ANY source is broken (including 25 permanently-disabled ones).

After:
- Skips companies with `health_status = 'disabled'` (unless `--include-disabled` flag passed)
- Exits 1 only when: An `active` source fails its probe for the first time in this run (transitions to `unhealthy`), OR the count of healthy probes drops below `MIN_HEALTHY_SOURCE_COUNT`
- Exits 0 when all probed sources are healthy, or when only `unhealthy` sources (known-bad, not newly broken) fail

Summary output:
```
## Summary

Active (healthy): 13
Unhealthy:         3
Disabled:         25
Total probed:     16  (disabled sources skipped)

✅ No new failures detected
```

## Scraping Behavior Change

`scrape.ts` calls `companyRepository.listActiveHealthy(source)` instead of `listActive(source)`. This excludes companies with `health_status = 'disabled'` from the fetch loop, so scraping time is not wasted on boards that consistently return 404.

Companies in `unhealthy` state are still scraped — they may return jobs intermittently, and the health status will self-correct when they probe healthy again.

## Recovery

When a probe returns `healthy` or `redirected`:
- `consecutive_failures` is reset to 0
- `health_status` is set to `active`
- `last_success_at` is updated

### Re-enabling a disabled source

Disabled sources are **excluded from all normal validation runs** and cannot self-heal. Manual intervention is required.

**Option A — Database update (fastest):**
```sql
UPDATE companies
SET health_status = 'active', consecutive_failures = 0
WHERE name = '<company-name>' AND source = '<source>';
```
The source will be included in the next scrape and validation run immediately.

**Option B — Validation with `--include-disabled`:**
```
npx tsx scripts/validate-sources.ts --include-disabled
```
Disabled sources are probed once. If the probe returns healthy, the source is automatically reset to `active` with `consecutive_failures = 0`. If it still fails, it remains `disabled`.

Use Option B when you want to test whether the board token has been fixed before restoring to active.
