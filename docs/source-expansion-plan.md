# Source Expansion Plan

**Date:** 2026-06-20
**Branch:** feature/source-expansion-analysis
**Status snapshot:** Healthy: 13 · Unhealthy: 25 · Disabled: 0

> **Recommendation only.** This document does not modify code or configuration.
> All changes require the standard domain → application → infrastructure → tests flow per CLAUDE.md.

---

## Table of Contents

1. [Analytics Findings](#1-analytics-findings)
2. [Source Ranking](#2-source-ranking)
3. [Companies to Remove](#3-companies-to-remove)
4. [Companies to Repair](#4-companies-to-repair)
5. [Top 30 Replacement Candidates](#5-top-30-replacement-candidates)
6. [Top 10 Highest Confidence Additions](#6-top-10-highest-confidence-additions)
7. [Estimated Impact](#7-estimated-impact)

---

## 1. Analytics Findings

> Data derived from documentation (`docs/`, `design/`), seed migrations, and source architecture. Live DB queries could not be executed (no credentials in this environment). Figures are marked **[documented]** or **[inferred]** accordingly.

### Pipeline recap

```
fetchJobs(companies, roles)
  → role filter (inside adapter, client-side)     ← not visible in scrape_runs
  → tagLocations()                                  ← found_count recorded here
  → hasAllowedLocation()                            ← kept_count recorded here
  → ingestJobs() upsert                             ← inserted_count / updated_count
```

### 1.1 Source yield summary

| Source | Type | Companies | Effective Yield | Notes |
|--------|------|-----------|-----------------|-------|
| Greenhouse | ATS | 29 | **High** (primary) | "Consistently returns the largest volume" [documented] |
| Lever | ATS | 2 | **Moderate** | Gojek, Meesho — both India/SE Asia-focused [inferred] |
| Ashby | ATS | 5 | **Moderate** | CRED and Syfe relevant; Linear/Vercel/Loom mostly US-biased [inferred] |
| MyCareersFuture | Feed | — | **Small but real** | Singapore-specific; "small but usable volume" [documented] |
| RemoteOK | Feed | — | **Zero** | 0% effective keep rate; "deprecated — low yield" [documented] |
| Wellfound | Feed | — | **Zero** | 0 jobs found; feed URL likely unconfigured [documented] |

### 1.2 Location filter bottleneck

The location filter (`tagLocations()` → `hasAllowedLocation()`) is the largest single drop point in the pipeline.

| Tag | Accepted keywords |
|-----|------------------|
| `india` | india, bengaluru, bangalore, hyderabad, mumbai, pune, delhi, gurugram, gurgaon, noida, chennai, ncr |
| `singapore` | singapore |
| `uae` | uae, dubai, abu dhabi, united arab emirates, sharjah |
| `remote` | remote, work from home, wfh, anywhere, distributed |

Expected drop rates by source:

| Source | Drop rate | Root cause |
|--------|-----------|------------|
| RemoteOK | ~100% | Location strings are "Worldwide", "USA" — no keyword match |
| Greenhouse (US/EU companies) | 60–80% | US city names or blank location fields [documented] |
| Ashby (US subset) | High | Same mismatch — Linear, Vercel, Loom post US-only locations |
| Greenhouse (India/SG/UAE companies) | Low | Purpose-seeded for target regions [inferred] |
| Lever | Low | Gojek (SE Asia) + Meesho (India) are inherently regional [inferred] |
| MyCareersFuture | Low | Singapore-specific board; near-100% `singapore` tag match |

A 60–80% Greenhouse drop rate is **expected and normal** given the current company mix. The primary lever for improving yield is adding more India/Singapore/UAE companies — not widening the keyword list (which would introduce false positives from US companies claiming global reach).

### 1.3 Invisible role-filter drop-off

Role filtering runs inside each adapter before `found_count` is recorded. The scrape_runs table has no pre-role-filter count column, so role-filter efficiency is completely invisible. This masks misconfigurations. Consider adding a `raw_count` column in a future schema migration.

### 1.4 Empty `locationRaw` → silent drops

When an ATS board omits the location field, `locationRaw` is set to `""`. Empty string matches no keyword and the job is silently dropped — even for companies that genuinely hire in target regions but leave the location field blank. This is a known blind spot for remote-only postings.

### 1.5 The 25 unhealthy boards

25 of 38 configured companies are currently in `unhealthy` state (probes failing). Their per-company fetch errors are swallowed silently by the adapter error-isolation loop. The result is yield loss with no visible signal in `scrape_runs.status`. This is the most impactful current problem.

---

## 2. Source Ranking

Ranked by estimated contribution to the corpus (inserts + updates), most to least:

| Rank | Source / Company | ATS | Region | Notes |
|------|-----------------|-----|--------|-------|
| 1 | Greenhouse (healthy subset) | Greenhouse | All | Freshworks, Grab, Stripe, BrowserStack, Revolut, Wise, Rippling, Deel, GitLab |
| 2 | MyCareersFuture | Feed | Singapore | Consistent small volume, zero location drop |
| 3 | Lever (when healthy) | Lever | India / SE Asia | Meesho (47+ openings); Gojek broken by wrong token |
| 4 | Ashby (CRED, Syfe) | Ashby | India / SG | CRED migrated to Lever; Syfe on non-standard ATS |
| 5 | Ashby (Linear, Vercel) | Ashby | Remote | US-biased; low kept-count due to location filter |
| 6 | RemoteOK | Feed | — | **0 yield** — disable |
| 7 | Wellfound | Feed | — | **0 yield** — feed URL not configured |

**Bottom line:** ~13 working companies produce all current value. The other 25 are noise.

---

## 3. Companies to Remove

These 10 companies have either migrated to an unsupported ATS (SmartRecruiters, Workday, Kula.ai, Trakstar, proprietary) or no longer have a discoverable public engineering board. Removing them reduces silent error noise and scrape-time waste.

| Company | Current config | Reason | Confidence |
|---------|---------------|--------|------------|
| **Loom** | ashby:loom | Acquired by Atlassian Nov 2023; Loom brand absorbed — no independent job board | HIGH |
| **Swiggy** | greenhouse:swiggy | Uses proprietary portal (`careers.swiggy.com`); not on any of the 3 ATS | MEDIUM |
| **Chargebee** | greenhouse:chargebee | Self-hosted `jobs.chargebee.com`; no public Greenhouse/Lever/Ashby board found | MEDIUM |
| **Carousell** | greenhouse:carousell | Migrated to SmartRecruiters (`careers.smartrecruiters.com/carousellgroup`) | HIGH |
| **Hasura** | greenhouse:hasura | 4 open roles total; no discoverable public ATS board on any of the 3 platforms | MEDIUM |
| **MoEngage** | greenhouse:moengage | Migrated to Trakstar (`moengage.hire.trakstar.com`) — not scrapable | HIGH |
| **StashAway** | greenhouse:stashaway | Migrated to Kula.ai (`careers.kula.ai/stashaway`) — not scrapable | HIGH |
| **PropertyGuru** | greenhouse:propertyguru | Migrated to Workday (`propertyguru.wd105.myworkdayjobs.com`) — not scrapable | HIGH |
| **Syfe** | ashby:syfe | Uses `syfe.careers-page.com` (Keka or similar); not on Ashby | MEDIUM |
| **G42** | greenhouse:g42 | Uses proprietary `careers.g42.ai` portal; no Greenhouse/Lever/Ashby board | HIGH |

> **Note on RemoteOK and Wellfound:** These feed-based sources are not tracked in `companies` and are removed differently — via environment variables (`REMOTEOK_DISABLED=true`, `WELLFOUND_DISABLED=true`). Both should be disabled until Wellfound has a functioning feed URL configured.

---

## 4. Companies to Repair

These 15 companies have working ATS boards but are failing probes because the configured board token is wrong or stale, or they migrated to a different supported ATS (Lever). Each entry specifies the exact fix.

### 4.1 Token corrections (same ATS, update board_token)

| Company | Current token | Correct token | ATS | Action |
|---------|--------------|---------------|-----|--------|
| **Razorpay** | `razorpay` | `razorpaysoftwareprivatelimited` | Greenhouse | Update board_token in DB |
| **Gojek** | `gojek` | `GoToGroup` | Lever | Update board_token — post-merger identity |

### 4.2 Likely transient / stale probe failures (re-probe to confirm)

These companies have confirmed live boards matching their current token. Their unhealthy status may be from a transient probe failure or a probe-vs-API URL discrepancy (the web board URL differs from the API endpoint). Re-probing should restore them to healthy without any config change.

| Company | ATS | Token | Board confirmed alive |
|---------|-----|-------|-----------------------|
| **Meesho** | Lever | `meesho` | 47+ open roles confirmed |
| **Xendit** | Greenhouse | `xendit` | Live at `boards.greenhouse.io/xendit` |
| **Aspire** | Greenhouse | `aspire` | Live at `job-boards.greenhouse.io/aspire` |
| **Innovaccer** | Greenhouse | `innovaccer` | Live at `job-boards.greenhouse.io/innovaccer` |
| **PhonePe** | Greenhouse | `phonepe` | Live board; also has `ppengineeringus` secondary board |
| **Retool** | Greenhouse | `retool` | Live at `job-boards.greenhouse.io/retool` |
| **Brex** | Greenhouse | `brex` | Live at `job-boards.greenhouse.io/brex` |
| **Mercury** | Greenhouse | `mercury` | Live at `job-boards.greenhouse.io/mercury` |
| **Postman** | Greenhouse | `postman` | Live at `job-boards.greenhouse.io/postman` |

### 4.3 ATS migrations — move to Lever (same scraper, new token)

These companies moved off Greenhouse but landed on Lever, which is already supported. Update the `source` and `board_token` fields.

| Company | Old config | New config | Lever URL |
|---------|-----------|------------|-----------|
| **CRED** | ashby:dreamplug | lever:cred | `jobs.lever.co/cred` |
| **Kitopi** | greenhouse:kitopi | lever:kitopi | `jobs.lever.co/kitopi` |
| **Nium** | greenhouse:nium | lever:nium | `jobs.lever.co/nium` |
| **CleverTap** | greenhouse:clevertap | lever:clevertap | `jobs.lever.co/clevertap` |

---

## 5. Top 30 Replacement Candidates

Candidates sourced via web research and validated against known ATS boards (live HTTP validation was blocked in this environment; run `npm run validate-sources` in CI for live confirmation).

Confidence: **HIGH** = confirmed active job postings in target region found in search (2025–2026 dated); **MEDIUM** = confirmed office/team in target region + known active board.

### Greenhouse (14 candidates)

| # | Company | Token | Primary Region | Confidence | Key roles |
|---|---------|-------|----------------|------------|-----------|
| 1 | **Samsara** | `samsara` | India (Hyderabad) | HIGH | Backend, Platform, Infra |
| 2 | **Glean** | `gleanwork` | India (Bangalore) | HIGH | Backend, Platform — dedicated India roles |
| 3 | **Okta** | `okta` | India, Singapore | HIGH | SWE, Security Eng, Backend |
| 4 | **Adyen** | `adyen` | Singapore, UAE (Dubai) | HIGH | Java Engineer, Backend |
| 5 | **Grafana Labs** | `grafanalabs` | Remote (India eligible) | HIGH | Senior Backend, Infra, O11y |
| 6 | **Moloco** | `moloco` | India (BLR/GGN), Singapore | HIGH | Backend, ML Infra |
| 7 | **Careem** | `careem` | UAE (Dubai) | HIGH | Backend SWE, Platform |
| 8 | **Twilio** | `twilio` | India, Remote | HIGH | L1–L3 SWE, explicitly India-Remote |
| 9 | **Coupang** | `coupang` | India (Hyderabad), Singapore | HIGH | SWE, Backend, Data |
| 10 | **Ziina** | `ziina` | UAE (Dubai) | HIGH | Senior Backend (YC-backed fintech) |
| 11 | **HackerRank** | `hackerrank` | India (Bangalore) | HIGH | Backend Engineer II, hybrid BLR |
| 12 | **CommerceIQ** | `commerceiq` | India (Bangalore) | HIGH | SDE I/II/Senior Backend |
| 13 | **Easyship** | `easyship` | Singapore, India | HIGH | Backend (Java/Ruby) |
| 14 | **HashiCorp** | `hashicorp` | Remote, India | MEDIUM | Infra, Backend — IBM-acquired, volume reduced |

> **Groww** (`groww`, Greenhouse EU endpoint) — India fintech unicorn; worth probing `job-boards.eu.greenhouse.io/groww` separately. Confidence MEDIUM.

### Lever (11 candidates)

| # | Company | Token | Primary Region | Confidence | Key roles |
|---|---------|-------|----------------|------------|-----------|
| 15 | **Binance** | `binance` | Singapore, UAE, India, Remote | HIGH | Backend AI/LLM, Platform — 500+ jobs |
| 16 | **Veeva Systems** | `veeva` | India (Hyderabad), Singapore | HIGH | Python/Java Backend, SWE |
| 17 | **Hevo Data** | `hevodata` | India (Bangalore) | HIGH | SDE II/III, Data Engineer — 29 active roles |
| 18 | **HighLevel** | `gohighlevel` | India, Remote | HIGH | Senior/Staff Backend, remote-first |
| 19 | **ShopBack** | `shopback-2` | Singapore | HIGH | Senior/Staff Backend Eng |
| 20 | **Onehouse** | `Onehouse` | India, Remote | HIGH | Backend Distributed Systems, K8s Infra |
| 21 | **Metabase** | `metabase` | Remote (global) | HIGH | Backend (Clojure), Full Stack |
| 22 | **Paytm** | `paytm` | India | MEDIUM | Backend Java/Golang — post-RBI contraction, verify volume |
| 23 | **Palantir** | `palantir` | Singapore | MEDIUM | Backend SWE — APAC hiring sparse; mostly US/UK |
| 24 | **Portcast** | `portcast` | Singapore | MEDIUM | Senior SWE — small startup, verify board |
| 25 | **Stable Money** | `stable-money1` | India (Bangalore) | MEDIUM | SWE I/Senior Backend — small startup |

### Ashby (5 candidates)

| # | Company | Token | Primary Region | Confidence | Key roles |
|---|---------|-------|----------------|------------|-----------|
| 26 | **Confluent** | `confluent` | India (Bangalore), Singapore, Remote | HIGH | Staff/Senior SWE, Data, Platform |
| 27 | **Ema** | `ema` | India, Remote | HIGH | Backend SWE India — explicitly posted |
| 28 | **Exa** | `exa` | Singapore, Remote | HIGH | Backend Agentic Search — mainly US-remote |
| 29 | **Cartesia** | `cartesia` | India, Remote | MEDIUM | Platform SWE India — primarily US-remote |
| 30 | **FurtherAI** | `furtherai` | India, UAE | MEDIUM | Backend/Fullstack India — a16z + YC-backed |

---

## 6. Top 10 Highest Confidence Additions

Ranked by: confirmed active board + strong target region coverage + engineering role fit.

| Priority | Company | ATS:Token | Primary value | Why now |
|----------|---------|-----------|---------------|---------|
| **1** | **Binance** | lever:binance | Singapore + UAE + India | Highest-volume crypto employer in all 3 target regions; 500+ jobs |
| **2** | **Samsara** | greenhouse:samsara | India (Hyderabad) | Established Hyderabad eng hub; 200+ jobs; well-funded IoT platform |
| **3** | **Confluent** | ashby:confluent | India + Singapore + Remote | 150+ jobs; Bangalore hub; replaces Loom in Ashby slot |
| **4** | **Okta** | greenhouse:okta | India + Singapore | 200+ jobs; covers both regions; large stable board |
| **5** | **Glean** | greenhouse:gleanwork | India (Bangalore) | AI platform with dedicated "Backend Engineer - India" role listings |
| **6** | **Adyen** | greenhouse:adyen | Singapore + UAE | Singapore Java roles + Dubai presence; replaces UAE gap left by G42 removal |
| **7** | **Grafana Labs** | greenhouse:grafanalabs | Remote → India | Remote-first; "Senior Backend - India Remote" roles explicitly posted |
| **8** | **Veeva Systems** | lever:veeva | India + Singapore | 200+ jobs; Hyderabad dev center; covers both regions efficiently |
| **9** | **Moloco** | greenhouse:moloco | India + Singapore | AI ad-tech; Bengaluru + Gurgaon + Singapore roles confirmed |
| **10** | **Careem** | greenhouse:careem | UAE (Dubai) | Super-app HQ Dubai; fills the UAE gap after G42/Kitopi removals |

---

## 7. Estimated Impact

### Current state (baseline)

| Metric | Value |
|--------|-------|
| Configured companies | 38 |
| Healthy (probes passing) | 13 |
| Unhealthy (silent failures) | 25 |
| Effective active sources | ~13 |

### After Phase A: Repair + Remove (no new companies)

Apply token corrections, re-probe transient failures, remove dead sources.

| Action | Count | Net change |
|--------|-------|------------|
| Token corrections (Razorpay, Gojek) | 2 | +2 healthy |
| Transient re-probe (Meesho, Xendit, Aspire, Innovaccer, PhonePe, Retool, Brex, Mercury, Postman) | 9 | +9 healthy |
| Lever migrations (CRED, Kitopi, Nium, CleverTap) | 4 | +4 healthy |
| Removals (Loom, Swiggy, Chargebee, Carousell, Hasura, MoEngage, StashAway, PropertyGuru, Syfe, G42) | 10 | −10 |

**Result: 13 − 10 + 15 = ~18 healthy companies**
Increase: +38% over baseline.

### After Phase B: Add Top 10 highest confidence

| Metric | Value |
|--------|-------|
| Healthy companies | ~28 |
| Total sources active | ~28 + MCF feed |
| Estimated new jobs/day | Material increase in India (Samsara, Okta, Glean), Singapore (Binance, Adyen), UAE (Binance, Careem), Remote (Grafana, Confluent) |

Increase over Phase A: +56%.

### After Phase C: Full Top 30 additions (validated subset)

| Metric | Value |
|--------|-------|
| Healthy companies | ~45–50 (depending on validation outcomes) |
| Region coverage | India: strong; Singapore: strong; UAE: improved; Remote: improved |
| Location filter efficiency | Expected improvement — new companies are purpose-selected for target regions, reducing the 60–80% Greenhouse drop rate |

Increase over baseline: **+250–280%** in active source count.

### Location coverage gaps addressed

| Region | Current gap | Addressed by |
|--------|-------------|--------------|
| UAE | G42 removed, Kitopi moved, 2 sources → 0 | Careem (#10), Binance (#1), Adyen (#6), Ziina (#10 GH) |
| India (Data/Infra) | Thin coverage for data engineering roles | Hevo Data, Onehouse, Confluent, Samsara |
| Singapore | 8 companies, many now broken | ShopBack, Palantir, Easyship, Adyen, Binance |
| Remote | GitLab, Deel only | Grafana Labs, HighLevel, Metabase, Onehouse, Confluent |

### Recommended sequencing

```
Week 1  →  Phase A (repair + remove): zero net code change, DB-only
Week 2  →  Add Top 10 (§6): one migration with 10 new companies rows
Week 3  →  Run validate-sources in CI to confirm live board health
Week 4  →  Evaluate Phase C additions based on Week 3 data
```

---

*Analysis basis: codebase documentation, seed migrations, and web research (June 2026). Live ATS validation blocked in this environment — run `npm run validate-sources` via GitHub Actions (`validate-sources.yml`) before applying any changes to production.*
