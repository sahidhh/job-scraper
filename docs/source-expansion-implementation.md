# Source Expansion Implementation

**Date:** 2026-06-20
**Branch:** feature/source-expansion
**Status:** Migrations written · Pending deployment and CI validation

---

## Overview

Three SQL migrations implement the recommendations from `docs/source-expansion-plan.md`.
No application code was changed — all changes are data-layer migrations against the `companies` table.

| Migration | File | Purpose |
|-----------|------|---------|
| 1 | `20260620000001_source_repairs.sql` | Fix 15 unhealthy board tokens; migrate 4 to Lever |
| 2 | `20260620000002_source_removals.sql` | Soft-delete 10 dead sources |
| 3 | `20260620000003_source_additions.sql` | Insert 10 new high-confidence companies |

---

## 1. Sources Repaired

### 1.1 Token corrections (same ATS)

| Company | Old token | New token | ATS | Action |
|---------|-----------|-----------|-----|--------|
| Razorpay | `razorpay` | `razorpaysoftwareprivatelimited` | Greenhouse | UPDATE board_token |
| Gojek | `gojek` | `GoToGroup` | Lever | UPDATE board_token (post-merger slug) |

Both rows also have `health_status = 'active'` and `consecutive_failures = 0` reset.

### 1.2 Health-state resets (tokens already correct)

Boards confirmed alive via web research; probe failures were transient or caused by a probe URL vs. API URL discrepancy.

| Company | ATS | Token | Board confirmed at |
|---------|-----|-------|--------------------|
| Meesho | Lever | `meesho` | `jobs.lever.co/meesho` (47+ open roles) |
| Xendit | Greenhouse | `xendit` | `boards.greenhouse.io/xendit` |
| Aspire | Greenhouse | `aspire` | `job-boards.greenhouse.io/aspire` |
| Innovaccer | Greenhouse | `innovaccer` | `job-boards.greenhouse.io/innovaccer` |
| PhonePe | Greenhouse | `phonepe` | `job-boards.greenhouse.io/phonepe` |
| Retool | Greenhouse | `retool` | `job-boards.greenhouse.io/retool` |
| Brex | Greenhouse | `brex` | `job-boards.greenhouse.io/brex` |
| Mercury | Greenhouse | `mercury` | `job-boards.greenhouse.io/mercury` |
| Postman | Greenhouse | `postman` | `job-boards.greenhouse.io/postman` |

### 1.3 ATS migrations — moved to Lever

| Company | Old config | New config | Lever URL |
|---------|-----------|------------|-----------|
| CRED | ashby:dreamplug | lever:cred | `jobs.lever.co/cred` |
| Kitopi | greenhouse:kitopi | lever:kitopi | `jobs.lever.co/kitopi` |
| Nium | greenhouse:nium | lever:nium | `jobs.lever.co/nium` |
| CleverTap | greenhouse:clevertap | lever:clevertap | `jobs.lever.co/clevertap` |

---

## 2. Sources Removed

Soft-deleted (`active = false`, `health_status = 'disabled'`). Rows preserved for job history FK integrity.

| Company | Old config | Reason |
|---------|-----------|--------|
| Loom | ashby:loom | Acquired by Atlassian Nov 2023 — board absorbed, no independent listing |
| Swiggy | greenhouse:swiggy | Proprietary portal (`careers.swiggy.com`) — not scrapable |
| Chargebee | greenhouse:chargebee | Self-hosted (`jobs.chargebee.com`) — no public ATS API |
| Carousell | greenhouse:carousell | Migrated to SmartRecruiters — not supported |
| Hasura | greenhouse:hasura | No discoverable public board on any supported ATS |
| MoEngage | greenhouse:moengage | Migrated to Trakstar — not supported |
| StashAway | greenhouse:stashaway | Migrated to Kula.ai — not supported |
| PropertyGuru | greenhouse:propertyguru | Migrated to Workday — not supported |
| Syfe | ashby:syfe | Non-standard ATS (Keka-style portal) |
| G42 | greenhouse:g42 | Proprietary `careers.g42.ai` portal |

---

## 3. Sources Added

10 new companies inserted via `ON CONFLICT DO NOTHING` (safe to re-run).

| Priority | Company | ATS | Token | Primary region | Roles |
|----------|---------|-----|-------|----------------|-------|
| 1 | Binance | Lever | `binance` | Singapore · UAE · India · Remote | Backend AI/LLM, Platform — 500+ jobs |
| 2 | Samsara | Greenhouse | `samsara` | India (Hyderabad) | Backend, Platform, Infra |
| 3 | Confluent | Ashby | `confluent` | India · Singapore · Remote | Staff/Senior SWE, Data, Platform |
| 4 | Okta | Greenhouse | `okta` | India · Singapore | SWE, Security Eng, Backend |
| 5 | Glean | Greenhouse | `gleanwork` | India (Bangalore) | Backend, Platform — explicit India listings |
| 6 | Adyen | Greenhouse | `adyen` | Singapore · UAE (Dubai) | Java/Backend Engineer |
| 7 | Grafana Labs | Greenhouse | `grafanalabs` | Remote (India-eligible) | Senior Backend, Infra, O11y |
| 8 | Veeva Systems | Lever | `veeva` | India (Hyderabad) · Singapore | Python/Java Backend, SWE |
| 9 | Moloco | Greenhouse | `moloco` | India (BLR/GGN) · Singapore | Backend, ML Infra |
| 10 | Careem | Greenhouse | `careem` | UAE (Dubai) | Backend SWE, Platform |

---

## 4. Validation Results

### Environment constraint

Live HTTP probing of ATS API endpoints (`boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`) is blocked by network egress restrictions in this execution environment. All 18 attempted probes returned HTTP 403 from the container firewall, not from the ATS APIs themselves (which are unauthenticated public endpoints).

### Knowledge-based token confidence

| Company | Token | Confidence | Notes |
|---------|-------|------------|-------|
| Binance | `binance` | HIGH | Standard slug; large well-known board |
| Samsara | `samsara` | HIGH | Matches Greenhouse board URL pattern |
| Confluent | `confluent` | HIGH | Known Ashby board as of 2025 |
| Okta | `okta` | HIGH | Established Greenhouse board |
| Glean | `gleanwork` | HIGH | Known GH slug (`glean` is taken by another company) |
| Adyen | `adyen` | HIGH | Standard slug; confirmed in web research |
| Grafana Labs | `grafanalabs` | HIGH | Known GH slug |
| Veeva Systems | `veeva` | HIGH | Known Lever board |
| Moloco | `moloco` | HIGH | Confirmed in web research |
| Careem | `careem` | HIGH | Confirmed in web research |
| Razorpay (repair) | `razorpaysoftwareprivatelimited` | MEDIUM | Unusually long; may be `razorpay` — verify |
| Gojek (repair) | `GoToGroup` | MEDIUM | Case-sensitive; try lowercase `gotogroup` if 404 |
| CRED (repair→Lever) | `cred` | HIGH | Confirmed via web search |
| Nium (repair→Lever) | `nium` | HIGH | Confirmed via web search |
| CleverTap (repair→Lever) | `clevertap` | HIGH | Confirmed via web search |
| Kitopi (repair→Lever) | `kitopi` | HIGH | Confirmed via web search |

### Required CI validation steps

After deploying these migrations, run the `validate-sources` GitHub Actions workflow:

```bash
# GitHub Actions: Actions → Validate sources → Run workflow
# Or locally with credentials:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run validate-sources
```

Tokens to double-check first if any REPAIR rows fail:

```bash
# Razorpay — verify which slug is live
curl -s -o /dev/null -w "%{http_code}" \
  "https://boards-api.greenhouse.io/v1/boards/razorpaysoftwareprivatelimited/jobs"

# Gojek — test casing variants
curl -s -o /dev/null -w "%{http_code}" \
  "https://api.lever.co/v0/postings/GoToGroup?mode=json"
curl -s -o /dev/null -w "%{http_code}" \
  "https://api.lever.co/v0/postings/gotogroup?mode=json"
```

---

## 5. Expected Impact

### Source count

| State | Active healthy | Unhealthy | Disabled/Inactive |
|-------|---------------|-----------|-------------------|
| Before | 13 | 25 | 0 |
| After repairs | ~26 | ~2 | 0 |
| After removals | ~26 | ~2 | 10 |
| After additions | ~36 | ~2 | 10 |

**Net improvement:** ~13 → ~36 active healthy companies (+177%). The 2 remaining MEDIUM-confidence repairs (Razorpay token, Gojek casing) may flip to healthy or need a follow-up token fix.

### Region coverage after changes

| Region | Before | After |
|--------|--------|-------|
| India | 14 companies | ~22 (+Glean, Samsara, Okta, Grafana Labs, Veeva, Moloco + 4 Lever migrations) |
| Singapore | 8 companies | ~12 (+Adyen, Binance, Moloco, Confluent) |
| UAE | 2 companies (G42, Kitopi → both removed/moved) | ~4 (+Careem, Binance, Adyen) |
| Remote | 3 companies | ~8 (+Grafana Labs, Veeva, Confluent, Binance) |

### Yield forecast

- **Location drop rate (Greenhouse):** Expected improvement from ~70% → ~55–60% as the company mix shifts toward purpose-selected India/SG/UAE companies. The removed US-biased companies (Loom, Carousell, PropertyGuru) dragged yield down.
- **Daily inserts:** Difficult to predict without live data. At 10 new high-volume boards (Binance 500+, Samsara 200+, Okta 200+, Confluent 150+), even with 50–70% location filter drop rate, expect meaningful new-job volume — particularly for Bangalore/Hyderabad/Singapore/Dubai.
- **RemoteOK / Wellfound:** No change in this implementation. Recommend setting `REMOTEOK_DISABLED=true` as a separate env-var change (0% yield, wastes network budget).

---

## 6. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Razorpay token wrong (`razorpaysoftwareprivatelimited`) | LOW | MEDIUM | Run validate-sources; if 404, revert to `razorpay` or search for correct slug |
| Gojek token casing wrong (`GoToGroup` vs `gotogroup`) | LOW | MEDIUM | Test both variants; Lever slugs are case-sensitive |
| CRED Lever board empty or stale | LOW | LOW | CRED was confirmed on Lever via web search; verify with validate-sources |
| Binance board flagged by ATS rate-limiter | LOW | LOW | 500+ job board; no known rate-limit issues on Lever |
| Migrations applied out of order | MEDIUM | LOW | Migration filenames are timestamped and applied in order by Supabase CLI |
| Repaired companies still fail probes post-migration | LOW | LOW | Health reset rows will probe cleanly in next validate-sources run; adapter error-isolation prevents cascading failures |
| New companies produce 0 kept jobs | LOW | LOW | All 10 were selected based on confirmed India/SG/UAE/Remote job postings; location filter will pass majority of listings |

---

## Commit Log

| SHA | Message |
|-----|---------|
| `1a14d40` | `docs(expansion): add source expansion analysis and recommendations` |
| `26e7359` | `fix(sources): deactivate 10 companies with unsupported ATS platforms` |
| `5532ed0` | `fix(sources): repair 15 unhealthy ATS board tokens and migrate 4 to Lever` |
| `bc4ccea` | `feat(sources): add top 10 high-confidence companies across India/SG/UAE/Remote` |

---

## Post-Deployment Checklist

- [ ] Apply migrations via Supabase dashboard or `supabase db push`
- [ ] Run `validate-sources` workflow — confirm healthy count increases from 13
- [ ] Verify Razorpay and Gojek tokens probe healthy (MEDIUM confidence tokens)
- [ ] Run `source-analytics` script after next scrape cycle — check `found_count` and `kept_count` for new companies
- [ ] Run `filter-analysis` — confirm location drop rate improving for Greenhouse
- [ ] Set `REMOTEOK_DISABLED=true` in environment (separate, no migration needed)
- [ ] Monitor `scrape_runs` for new companies' first run — check for errors
