# Source Validation Report — 2026-06-22

**Phase:** 1A — Source Validation & Cleanup
**Date:** 2026-06-22
**Evidence basis:** GitHub Actions validate-sources run #5 (run ID 27865212149, 2026-06-20 08:09 UTC)

---

## Executive Summary

The most recent `validate-sources` run (June 20, 2026) confirmed the **pre-June-migration baseline**:
13 healthy sources, 25 broken sources, 0 disabled. The three June 20 DB migrations
(`20260620000001–3`) that repair/remove/add sources are code-complete and approved but have
**not yet been applied to the live DB**. That is the primary outstanding action before the next
validation cycle.

Two zero-yield feed sources (RemoteOK, Wellfound) have been disabled via `scrape.yml` env vars
as part of this cleanup. A weekly cron has been added to `validate-sources.yml`.

---

## Validation Evidence

**Workflow run:** `validate-sources.yml` run #5 · job `82468063065`
**Commit:** `a51da50a` · Branch: `main` · Date: 2026-06-20 08:09 UTC
**Conclusion:** `success` (exit 0 — no *new* active→broken transitions detected)

### Raw output

```
[validate-sources] loading configured companies…
[validate-sources] probing 38 board(s) across 3 ATS source(s)

## Greenhouse

Stripe         ✅ healthy (200)
Retool         ❌ not_found (404)
Revolut        ❌ not_found (404)
GitLab         ✅ healthy (200)
Grab           ❌ not_found (404)
BrowserStack   ❌ not_found (404)
Razorpay       ❌ not_found (404)
Carousell      ❌ not_found (404)
PropertyGuru   ❌ not_found (404)
Kitopi         ❌ not_found (404)
Rippling       ❌ not_found (404)
Innovaccer     ❌ not_found (404)
MoEngage       ❌ not_found (404)
Deel           ❌ not_found (404)
Freshworks     ❌ not_found (404)
Postman        ✅ healthy (200)
Brex           ✅ healthy (200)
CleverTap      ❌ not_found (404)
Swiggy         ❌ not_found (404)
PhonePe        ✅ healthy (200)
Xendit         ✅ healthy (200)
Aspire         ❌ not_found (404)
Nium           ❌ not_found (404)
Hasura         ❌ not_found (404)
Wise           ❌ not_found (404)
G42            ❌ not_found (404)
Airbnb         ✅ healthy (200)
StashAway      ❌ not_found (404)
Chargebee      ❌ not_found (404)
Mercury        ✅ healthy (200)

## Lever

Gojek          ❌ not_found (404)
Meesho         ✅ healthy (200)

## Ashby

Linear         ✅ healthy (200)
CRED           ❌ not_found (404)
Syfe           ❌ not_found (404)
Vercel         ✅ healthy (200)
Loom           ✅ healthy (200)
Notion         ✅ healthy (200)

## Summary

Active (healthy): 13
Unhealthy:        25
Disabled:         0
Total probed:     38  (disabled sources skipped)

✅ No new failures detected
```

---

## Healthy Sources (13 confirmed)

| # | Company | ATS | Token |
|---|---------|-----|-------|
| 1 | Stripe | Greenhouse | `stripe` |
| 2 | GitLab | Greenhouse | `gitlab` |
| 3 | Postman | Greenhouse | `postman` |
| 4 | Brex | Greenhouse | `brex` |
| 5 | PhonePe | Greenhouse | `phonepe` |
| 6 | Xendit | Greenhouse | `xendit` |
| 7 | Airbnb | Greenhouse | `airbnb` |
| 8 | Mercury | Greenhouse | `mercury` |
| 9 | Meesho | Lever | `meesho` |
| 10 | Linear | Ashby | `linear` |
| 11 | Vercel | Ashby | `vercel` |
| 12 | Loom | Ashby | `loom` |
| 13 | Notion | Ashby | `notion` |

---

## Broken Sources — June Migration Coverage

### Group A — Addressed by June migrations (pending DB apply)

These 18 sources are broken in the current DB state but are fully addressed by the three June 20
migrations (`20260620000001–3`). Once applied, 8 should become healthy and 10 will be disabled.

| Company | Current state | June migration action |
|---------|--------------|----------------------|
| Razorpay | ❌ not_found | Token fix: `razorpay` → `razorpaysoftwareprivatelimited` |
| Gojek | ❌ not_found | Token fix: `gojek` → `GoToGroup` (Lever) |
| Retool | ❌ not_found | Health reset (board confirmed live) |
| Innovaccer | ❌ not_found | Health reset (board confirmed live) |
| Aspire | ❌ not_found | Health reset (board confirmed live) |
| Kitopi | ❌ not_found | ATS migration: greenhouse → lever:kitopi |
| Nium | ❌ not_found | ATS migration: greenhouse:nium → lever:nium |
| CleverTap | ❌ not_found | ATS migration: greenhouse → lever:clevertap |
| CRED | ❌ not_found | ATS migration: ashby:dreamplug → lever:cred |
| Carousell | ❌ not_found | **Disable** (migrated to SmartRecruiters) |
| PropertyGuru | ❌ not_found | **Disable** (migrated to Workday) |
| Swiggy | ❌ not_found | **Disable** (proprietary portal) |
| Chargebee | ❌ not_found | **Disable** (self-hosted careers page) |
| Hasura | ❌ not_found | **Disable** (no public ATS board found) |
| MoEngage | ❌ not_found | **Disable** (migrated to Trakstar) |
| StashAway | ❌ not_found | **Disable** (migrated to Kula.ai) |
| Syfe | ❌ not_found | **Disable** (migrated to Keka) |
| G42 | ❌ not_found | **Disable** (proprietary careers portal) |

Note: Loom (`ashby:loom`) shows `✅ healthy (200)` in the probe but will be **disabled** by the
June migration regardless — the board redirect persists post-acquisition (Atlassian Nov 2023) but
the board lists no new independent positions. The disable decision is correct.

### Group B — Broken, NOT addressed by June migrations (7 sources)

These 7 sources returned `not_found (404)` in the validation run and were **not included** in any
June 2026 migration plan. They need investigation before a decision to repair or disable can be made.

| Company | ATS | Token | Evidence | Likely cause |
|---------|-----|-------|---------|-------------|
| Revolut | Greenhouse | `revolut` | 404 | Token or ATS change; company actively hiring |
| Grab | Greenhouse | `grab` | 404 | Token or ATS change; SE Asia superappp |
| BrowserStack | Greenhouse | `browserstack` | 404 | Token or ATS change; company actively hiring |
| Rippling | Greenhouse | `rippling` | 404 | Token or ATS change; YC startup actively hiring |
| Deel | Greenhouse | `deel` | 404 | Token or ATS change; large global payroll company |
| Freshworks | Greenhouse | `freshworks` | 404 | Token or ATS change; public company, BLR HQ |
| Wise | Greenhouse | `wise` | 404 | Token or ATS change; public fintech company |

**Recommended next action:** Probe alternative tokens before disabling. Freshworks (BLR HQ) and
Rippling are particularly high-value. None are disabled in this phase.

---

## June Migration Status

| Migration | Description | DB status |
|-----------|-------------|-----------|
| `20260620000001_source_repairs.sql` | Fix 15 broken tokens + health resets + ATS migrations | **NOT APPLIED** |
| `20260620000002_source_removals.sql` | Soft-disable 10 confirmed-dead companies | **NOT APPLIED** |
| `20260620000003_source_additions.sql` | Add 10 high-confidence new sources | **NOT APPLIED** |

**Evidence:** The June 20 validate-sources run shows `Disabled: 0`, which can only be true if
the removal migration has not been applied (it sets `active = false, health_status = 'disabled'`
on 10 rows). The `Disabled: 0` count is definitive.

**Required action (outside this phase):** Run `supabase db push` against the production DB to
apply all three migrations. Re-run `validate-sources` afterward and verify:
- Disabled count = ≥ 10 (removal migration applied)
- Healthy count ≥ 20 (repairs applied + new sources added)

---

## Feed Sources (Non-ATS)

| Source | Status | Action taken |
|--------|--------|-------------|
| RemoteOK | **Disabled** | Added `REMOTEOK_DISABLED=true` to `scrape.yml`. Zero-yield confirmed (location strings "Worldwide/USA" never match India/SG/UAE/Remote tags). |
| Wellfound | **Disabled** | Added `WELLFOUND_DISABLED=true` to `scrape.yml`. Feed URL not configured; adapter already auto-disables on empty `WELLFOUND_FEED_URL`, but explicit flag eliminates any residual log noise. |
| MyCareersFuture | **Healthy** | No action. Singapore-specific board; confirmed producing small-volume, high-relevance results. |

---

## Actions Taken (Phase 1A)

| # | Action | Type | File changed |
|---|--------|------|-------------|
| 1 | Disable RemoteOK via env var | Config | `.github/workflows/scrape.yml` |
| 2 | Disable Wellfound via env var | Config | `.github/workflows/scrape.yml` |
| 3 | Add weekly cron (Sunday 06:00 UTC) to validate-sources | Config | `.github/workflows/validate-sources.yml` |
| 4 | Write this validation report | Documentation | `reports/source-validation-2026-06-22.md` |
| 5 | Update `design/limitations.md` §1.1 with source health state | Documentation | `design/limitations.md` |

---

## Actions NOT Taken (out of scope / require DB access)

| # | Action | Reason deferred |
|---|--------|----------------|
| 1 | Apply June DB migrations | Requires `supabase db push` in production; outside Phase 1A scope |
| 2 | Disable Group B sources (Revolut, Grab, BrowserStack, Rippling, Deel, Freshworks, Wise) | Need token investigation before disable; all are active companies likely with alternative tokens |
| 3 | Add Hevo Data, HackerRank, CommerceIQ (Phase P1 additions) | Phase B; blocked on confirming June migrations are applied first |

---

## Rollback Instructions

### Rollback — RemoteOK disable

Remove `REMOTEOK_DISABLED: 'true'` from `.github/workflows/scrape.yml`. The scraper will
resume fetching the RemoteOK feed on the next scrape run. Note: re-enabling does not recover
previously missed jobs; it only resumes future fetches.

### Rollback — Wellfound disable

Remove `WELLFOUND_DISABLED: 'true'` from `.github/workflows/scrape.yml`. The scraper will
resume checking `WELLFOUND_FEED_URL`; if the secret is unset, it auto-disables anyway.

### Rollback — Weekly cron

Remove the `schedule` block from `.github/workflows/validate-sources.yml`. The workflow reverts
to manual-dispatch only (previous behavior).

### Rollback — June DB migrations (if ever applied and need reverting)

See `docs/operations/source-health-rollback.md` for the source-health schema rollback SQL.
For migration data changes (company rows), use the complement UPDATEs:
```sql
-- Re-enable removed companies (reverses 20260620000002)
UPDATE companies SET active = true, health_status = 'active'
WHERE name IN ('Loom','Swiggy','Chargebee','Carousell','Hasura',
               'MoEngage','StashAway','PropertyGuru','Syfe','G42');

-- Revert token corrections (reverses 20260620000001 §4.1)
UPDATE companies SET board_token = 'razorpay', health_status = 'unhealthy', consecutive_failures = 7
WHERE name = 'Razorpay' AND source = 'greenhouse';

UPDATE companies SET board_token = 'gojek', health_status = 'unhealthy', consecutive_failures = 7
WHERE name = 'Gojek' AND source = 'lever';
```

---

## Next Validation Target

After June DB migrations are applied, re-run `validate-sources` manually and verify:

| Metric | Current | Expected post-migration |
|--------|---------|------------------------|
| Healthy | 13 | ≥ 20 |
| Disabled | 0 | ≥ 10 |
| Broken (unaddressed) | 7 | 7 (unchanged; need separate investigation) |

The weekly cron added in this phase will catch any new failures automatically.
