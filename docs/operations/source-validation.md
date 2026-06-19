# Source Validation

## Purpose

Many configured Greenhouse / Lever / Ashby board tokens become stale over time — companies retire their boards, rename their slugs, or migrate ATS providers. When this happens the scrape pipeline silently fetches zero jobs for those companies while reporting success, because per-company errors are isolated (scrapers.md §4).

Source validation is a lightweight pre-flight check that probes each configured board token and reports which ones are alive and which are dead **before** a scrape run. It does not modify any data and does not affect scraping behaviour.

---

## Architecture

The validation system follows the same clean-architecture layers as the rest of the codebase (design/architecture.md §1).

```
src/features/sources/
  domain/
    sourceValidation.ts        ← ValidationStatus, ValidationResult,
                                  ValidationGroup, SourceValidator interface
  application/
    validateSources.ts         ← pure use-case: maps validators × companies → groups
    validateSources.test.ts
  infrastructure/
    validators/
      probe.ts                 ← shared HTTP probe (fetch + status mapping)
      GreenhouseValidator.ts   ← implements SourceValidator for Greenhouse
      LeverValidator.ts        ← implements SourceValidator for Lever
      AshbyValidator.ts        ← implements SourceValidator for Ashby
      index.ts                 ← sourceValidators registry (mirrors sourceScrapers)

scripts/
  validate-sources.ts          ← composition root: load companies, run validators, print report
```

### SourceValidator interface

```typescript
interface SourceValidator {
  readonly source: JobSource;
  validate(boardToken: string, companyName: string): Promise<ValidationResult>;
}
```

Mirrors the `JobSourceScraper` interface. Only the three ATS sources that use per-company board tokens (Greenhouse, Lever, Ashby) have validators. Feed-based sources (RemoteOK, Wellfound, MyCareersFuture) are not validated.

### Probe behaviour

Each validator delegates to a shared `probeBoard()` helper that:

1. Issues a `GET` request with a 10-second timeout.
2. Maps the HTTP response to a `ValidationStatus`:

| HTTP status | ValidationStatus |
|---|---|
| 200, no redirect | `healthy` |
| 200, after redirect | `redirected` |
| 404 | `not_found` |
| 401 or 403 | `unauthorized` |
| 429 | `rate_limited` |
| any other / network error | `unknown` |

3. Never retries — a single 404 is sufficient to flag a dead board.

Boards are probed concurrently within each source group to keep wall-clock time low.

---

## How to Run

### Locally

```bash
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npm run validate-sources
```

### GitHub Actions

Navigate to **Actions → Validate sources → Run workflow**. The workflow requires the `Production` environment which already holds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the scrape pipeline.

---

## Expected Output

```
[validate-sources] loading configured companies…
[validate-sources] probing 12 board(s) across 3 ATS source(s)

## Greenhouse

Freshworks ❌ not_found (404)
Razorpay ❌ not_found (404)
Stripe ✅ healthy (200)

## Lever

Gojek ❌ not_found (404)

## Ashby

CRED ❌ not_found (404)
Notion ✅ healthy (200)

## Summary

Healthy: 2
Broken:  4
```

The script exits with code `1` if any broken boards are detected, making it easy to catch in CI or manual inspection.

---

## Remediation

When a board is reported as `not_found`, remove or deactivate the company in the dashboard (`/settings` → Company Config). This prevents the scraper from wasting requests and keeps `scrape_runs` logs clean.

For `redirected` boards, update the `board_token` to the new slug if the ATS has been migrated to a different URL.

---

## Future Extensions

- **Pre-scrape gate** — run validation automatically at the start of `scrape.yml` and skip dead companies rather than attempting to fetch them.
- **Scheduled runs** — add a cron entry to `validate-sources.yml` (e.g. weekly) so stale boards are surfaced proactively.
- **Telegram alert** — notify the user when one or more boards flip from healthy to dead between runs.
- **Feed-based sources** — extend validation to probe RemoteOK, Wellfound, and MyCareersFuture endpoints for reachability.
