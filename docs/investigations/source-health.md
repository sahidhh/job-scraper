# Source Health Investigation
Generated: 2026-06-19

---

## 1. Source Inventory

Six scrapers are registered in `src/features/sources/infrastructure/registry.ts` (lines 12–19):

| Source | Type | Requires company config | Endpoint pattern |
|---|---|---|---|
| `greenhouse` | ATS public API | yes | `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` |
| `lever` | ATS public API | yes | `https://api.lever.co/v0/postings/{board_token}?mode=json` |
| `ashby` | ATS public API | yes | `https://api.ashbyhq.com/posting-api/job-board/{board_token}` |
| `wellfound` | Unofficial JSON feed | no | `$WELLFOUND_FEED_URL` (operator-supplied) |
| `remoteok` | Public feed | no | `https://remoteok.com/api` (hardcoded) |
| `mycareersfuture` | Public search API | no | `https://api.mycareersfuture.gov.sg/v2/jobs` (hardcoded) |

**Company-backed sources (board_token required):** greenhouse, lever, ashby — validated by `scripts/validate-sources.ts`.

**Feed-based sources (no board_token):** wellfound, remoteok, mycareersfuture — no per-board validation exists or is planned for now (`src/features/sources/infrastructure/validators/index.ts` lines 9–13; `docs/operations/source-validation.md`).

---

## 2. ATS Mapping — All Configured Companies

Seeded across two migrations:

### `supabase/migrations/20260617000001_seed_companies.sql`

| Company | ATS | board_token |
|---|---|---|
| Freshworks | greenhouse | `freshworks` |
| Grab | greenhouse | `grab` |
| Stripe | greenhouse | `stripe` |
| Razorpay | greenhouse | `razorpay` |
| Postman | greenhouse | `postman` |
| BrowserStack | greenhouse | `browserstack` |
| Chargebee | greenhouse | `chargebee` |
| Swiggy | greenhouse | `swiggy` |
| Revolut | greenhouse | `revolut` |
| Wise | greenhouse | `wise` |
| Carousell | greenhouse | `carousell` |
| Gojek | lever | `gojek` |
| Meesho | lever | `meesho` |
| Linear | ashby | `linear` |
| Vercel | ashby | `vercel` |
| Loom | ashby | `loom` |

### `supabase/migrations/20260617000002_seed_companies_batch2.sql`

| Company | ATS | board_token | Notes |
|---|---|---|---|
| Rippling | greenhouse | `rippling` | HR platform, Bangalore R&D |
| Deel | greenhouse | `deel` | Remote hiring |
| Retool | greenhouse | `retool` | Dev tools, YC W17 |
| GitLab | greenhouse | `gitlab` | Fully remote |
| Brex | greenhouse | `brex` | YC fintech |
| Mercury | greenhouse | `mercury` | YC fintech, remote |
| MoEngage | greenhouse | `moengage` | Marketing automation |
| CleverTap | greenhouse | `clevertap` | Analytics platform |
| Hasura | greenhouse | `hasura` | GraphQL engine, YC W18 |
| Innovaccer | greenhouse | `innovaccer` | Health AI |
| CRED | ashby | `dreamplug` | Legal entity is Dreamplug |
| PhonePe | greenhouse | `phonepe` | Payments unicorn |
| Nium | greenhouse | `nium` | Fintech unicorn, SG HQ |
| Xendit | greenhouse | `xendit` | SE Asia payments |
| StashAway | greenhouse | `stashaway` | Wealthtech, SG |
| PropertyGuru | greenhouse | `propertyguru` | Real estate portal |
| Aspire | greenhouse | `aspire` | Neobank for SMBs |
| Syfe | ashby | `syfe` | Wealthtech, SG |
| G42 | greenhouse | `g42` | AI/cloud, Abu Dhabi |
| Kitopi | greenhouse | `kitopi` | Cloud kitchens, UAE |

### Totals

| ATS | Company count |
|---|---|
| greenhouse | 28 |
| lever | 2 |
| ashby | 4 |
| wellfound | 0 (feed-based, no company rows) |
| remoteok | 0 (feed-based) |
| mycareersfuture | 0 (feed-based) |
| **Total** | **34** |

---

## 3. Failure Analysis

### 3.1 Wellfound — Confirmed Misconfigured / Effectively Disabled

**Status:** producing zero jobs on every production run.

**Root cause chain:**
- `WellfoundScraper.ts` lines 13–14 declare two env vars: `WELLFOUND_FEED_URL` and `WELLFOUND_DISABLED`.
- `validateWellfoundConfig()` (lines 28–51) checks `WELLFOUND_DISABLED` first, then whether `WELLFOUND_FEED_URL` is set.
- `.github/workflows/scrape.yml` does **not** configure either var (`reports/post-merge-audit.md` finding N4, lines 81–83 of that report).
- Result: every run hits the `invalid_config` branch (line 36: `reason: WELLFOUND_FEED_URL not set`), logs `[wellfound] invalid configuration: WELLFOUND_FEED_URL not set`, returns `[]`, and records `scrape_runs.status = 'success'` with `found_count = 0`.
- There is **no first-party Wellfound API**. The operator must run an external feed producer (scraped export, static JSON, etc.) and point `WELLFOUND_FEED_URL` at it. This is documented in `docs/sources/wellfound.md` but the setup has not been done.

**Expected vs. unexpected:** This is a **known, expected gap** for the current deployment phase. `design/limitations.md` §1.2 and `docs/sources/wellfound.md` document it. The recommended mitigation (set `WELLFOUND_DISABLED=true` in the workflow to suppress the config warning) has also not been applied.

**Fix:** Either set `WELLFOUND_DISABLED=true` in `.github/workflows/scrape.yml` to suppress the warning and make the intent explicit, or set up an external feed producer and configure `WELLFOUND_FEED_URL`.

---

### 3.2 ATS Board 404s — Expected vs. Unexpected

The validation system (`scripts/validate-sources.ts` + `src/features/sources/infrastructure/validators/`) probes active companies via HTTP GET and maps 404 → `not_found`. The scraper itself catches per-company errors in isolation (e.g. `GreenhouseScraper.ts` lines 66–70: `try/catch` per company, `console.warn` + continue), so 404 on one company does not block others.

**Known 404 risk companies (flagged in seed migration comments or by token mismatch):**

The batch 2 migration (`20260617000002_seed_companies_batch2.sql` line 3) notes: _"After first scrape, check scrape_runs for failed sources and remove bad tokens."_ This is a blanket acknowledgement that some tokens may be wrong from the start.

Specific tokens with elevated migration-risk:
- `CRED` uses board_token `dreamplug` (legal entity name) — token may not match Ashby's slug if CRED published under a different slug. This is explicitly noted in the migration comment.
- `Loom` (ashby `loom`) — Loom was acquired by Atlassian; their Ashby board may have been retired.
- `Carousell` (greenhouse `carousell`) — may have migrated ATS.
- `Swiggy` (greenhouse `swiggy`) — large Indian company; board token stability depends on whether they use Greenhouse or have migrated to a homegrown ATS.

The `docs/operations/source-validation.md` "Expected Output" example (lines 89–107) shows exactly this class of failures as the expected normal state:
```
Freshworks ❌ not_found (404)
Razorpay ❌ not_found (404)
Gojek ❌ not_found (404)
CRED ❌ not_found (404)
```
This is illustrative, not confirmed real data — no actual validation run output was found in the repo.

**How 404s manifest in production:** Each 404 board logs `[greenhouse] <CompanyName>: Greenhouse board "<token>" returned 404` (GreenhouseScraper.ts line 48 error string), contributes 0 jobs, and the overall source still records `status = 'success'` (since the scraper doesn't throw).

**No actual scrape_runs data is present in the repo** — all tables are empty in the local environment; the database exists only in Supabase (production). The validation script must be run manually (`npm run validate-sources`) to get real 404 counts.

---

### 3.3 RemoteOK and MyCareersFuture

Both are hardcoded public APIs with no board_token:
- `RemoteOkScraper.ts` line 9: `const REMOTEOK_API_URL = "https://remoteok.com/api"`. Uses a custom `User-Agent` header (line 50). No auth required. Will throw if API returns non-200 (line 52), recorded as `failed` in scrape_runs. No known structural issue.
- `MyCareersFutureScraper.ts` line 12: `const MCF_API_BASE = "https://api.mycareersfuture.gov.sg/v2/jobs"`. Added in migration `20260617000003_mycareersfuture_source.sql`. Issues parallel keyword searches (up to 4 terms). No known structural issue.

---

## 4. Yield Analysis

No historical `scrape_runs` data is accessible from this codebase. The following is estimated from source characteristics:

### Greenhouse (28 companies)

- Each company board is fetched in full; all jobs are returned before role-filter.
- Typical Greenhouse boards for mid-large tech companies: 20–200 open roles.
- At 28 companies × 50 average roles = ~1,400 raw jobs fetched per run.
- After role filter (`jobMatchesRoles` in `GreenhouseScraper.ts` line 74) and location filter (`hasAllowedLocation` in `scripts/scrape.ts` line 54): expected 5–20% survival rate → ~70–280 ingested jobs per run.
- **Likely the dominant source by volume.**
- Risk: some of the 28 boards may be dead (404); each dead board contributes 0 jobs.

### Lever (2 companies)

- Gojek and Meesho only.
- Gojek is a large SE Asian tech company — likely has many postings; token risk medium.
- Meesho is a large Indian e-commerce company; Lever token may be stale if they migrated.
- Expected: 20–100 raw jobs combined; low volume compared to Greenhouse.

### Ashby (4 companies)

- Linear, Vercel, Loom, CRED (via `dreamplug`).
- Linear and Vercel are remote-first US companies with global hiring — likely active Ashby boards.
- Loom: acquired by Atlassian, board may be retired (high 404 risk).
- CRED: Indian fintech using `dreamplug` slug — needs verification.
- Expected: 10–80 raw jobs combined; moderate risk.

### Wellfound

- **Zero jobs per run** until `WELLFOUND_FEED_URL` is configured (see §3.1).
- Contributes nothing to current production yield.

### RemoteOK

- Single global feed: `https://remoteok.com/api`. Typically returns 200–500 jobs per call.
- After role + location filter: only "Remote" tagged jobs matching expanded roles survive.
- Expected: 5–50 jobs per run depending on active role.
- Hardcoded URL, no configuration risk.

### MyCareersFuture

- Up to 4 parallel keyword searches × 100 results = up to 400 raw jobs.
- All tagged "Singapore" (hardcoded in `MyCareersFutureScraper.ts` line 56).
- After role filter: expected 20–100 jobs per run.
- Added later (migration `20260617000003`); no known issues.

### Estimated Yield Summary

| Source | Raw jobs / run (estimate) | Ingested after filters (estimate) | Current status |
|---|---|---|---|
| greenhouse | 800–2,000 | 50–200 | Active; some boards may 404 |
| lever | 20–100 | 5–20 | Active; low volume |
| ashby | 10–80 | 3–15 | Active; Loom/CRED risk |
| wellfound | 0 | 0 | **Misconfigured — no feed URL** |
| remoteok | 200–500 | 5–50 | Active |
| mycareersfuture | 100–400 | 20–100 | Active |

---

## 5. Priority Cleanup List

Ordered by impact × feasibility:

### P0 — Fix immediately (blocks yield or causes noisy logs)

1. **Set `WELLFOUND_DISABLED=true` in `.github/workflows/scrape.yml`**
   - File: `.github/workflows/scrape.yml` (env section, around line 27–31 per `post-merge-audit.md` N4)
   - Currently: neither `WELLFOUND_FEED_URL` nor `WELLFOUND_DISABLED` is set → every run logs `[wellfound] invalid configuration: WELLFOUND_FEED_URL not set`.
   - Fix: add `WELLFOUND_DISABLED: "true"` to suppress the warning until a feed is ready. This is the recommended approach per `docs/sources/wellfound.md` §A.

2. **Run `npm run validate-sources` against production** to get the real 404 map.
   - Command: `SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npm run validate-sources`
   - Script: `scripts/validate-sources.ts`; output format documented in `docs/operations/source-validation.md` lines 82–107.
   - This will identify every dead board_token across all 34 companies.

### P1 — Fix within one week (silent yield loss)

3. **Deactivate dead Greenhouse boards** (once validate-sources output is known).
   - Via `/settings` → Company Config UI, or direct DB: `UPDATE companies SET active = false WHERE source = 'greenhouse' AND board_token IN (...dead tokens...)`.
   - Dead boards waste HTTP requests and pollute `scrape_runs` error logs.

4. **Verify Loom (ashby `loom`) board is active.**
   - Loom was acquired by Atlassian. Their Ashby job board may have been retired or migrated to Atlassian's ATS. Check `https://api.ashbyhq.com/posting-api/job-board/loom` directly.
   - If dead: set `active = false` for this company row.

5. **Verify CRED (ashby `dreamplug`) board_token.**
   - The `dreamplug` token reflects the legal entity, not the brand. Check `https://api.ashbyhq.com/posting-api/job-board/dreamplug`.
   - If dead or wrong: update `board_token` to the correct Ashby slug, or deactivate.

### P2 — Medium term (coverage gaps)

6. **Consider expanding Lever coverage** — only 2 companies (Gojek, Meesho). Lever is widely used by Indian/SE Asian startups. Adding 5–10 Lever companies would increase yield proportionally.

7. **Set up a Wellfound feed** if coverage of startup/early-stage companies is desired.
   - Requires an external feed producer (custom scraper, static JSON, etc.) — out of scope for this repo.
   - Reference: `docs/sources/wellfound.md` §1 (Setup options).
   - Once a feed URL exists, set `WELLFOUND_FEED_URL` in GitHub Actions secrets.

8. **Schedule `validate-sources.yml` on a weekly cron** to surface stale boards proactively.
   - Currently `workflow_dispatch` only (`design/tech-stack.md` §7: "validate-sources.yml — workflow_dispatch only").
   - Reference: `docs/operations/source-validation.md` "Future Extensions" section.

### P3 — Low priority (known limitations)

9. **`partial` scrape_run status is never produced** (`docs/scrapers.md` §4, AD-13). Per-company 404s inside a source are swallowed — the source still records `success`. If monitoring for per-company failure counts matters, implement per-company failure counting in Greenhouse/Lever/Ashby scrapers and set `status = 'partial'` when `failedCount > 0`.

10. **No pre-scrape gate** — the scrape workflow does not run `validate-sources` before scraping. Dead boards waste API calls every 2 hours. The `docs/operations/source-validation.md` "Future Extensions" section already identifies this as a desired enhancement.

---

## Key File References

| File | Role |
|---|---|
| `src/features/sources/infrastructure/registry.ts` | Single list of all 6 scrapers |
| `supabase/migrations/20260617000001_seed_companies.sql` | 16 companies (batch 1) |
| `supabase/migrations/20260617000002_seed_companies_batch2.sql` | 20 companies (batch 2) |
| `supabase/migrations/20260617000003_mycareersfuture_source.sql` | Adds `mycareersfuture` enum value |
| `src/features/sources/infrastructure/wellfound/WellfoundScraper.ts` | Wellfound config validation (lines 28–51) |
| `src/features/sources/infrastructure/validators/index.ts` | Only greenhouse/lever/ashby are validated |
| `src/features/sources/application/validateSources.ts` | Validation use-case |
| `scripts/validate-sources.ts` | CLI to probe all boards |
| `scripts/report-sources.ts` | CLI to read scrape_runs history |
| `docs/sources/wellfound.md` | Wellfound setup guide |
| `docs/operations/source-validation.md` | Validation architecture and remediation guide |
| `design/limitations.md` §1.1–1.2 | Documented source coverage limitations |
| `reports/post-merge-audit.md` (N4) | Wellfound workflow gap finding |
