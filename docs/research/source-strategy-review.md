# Source Strategy Review

**Date:** 2026-06-22
**Scope:** Bangalore source expansion · Existing source health audit · HR contact detection

> Read-only research artifact. No code changes proposed. All figures derived from documentation
> (`docs/`, `design/`), seed migrations, and codebase analysis. Live DB queries not available.

---

## Executive Summary

The pipeline currently has **38 configured companies** across Greenhouse, Lever, and Ashby,
plus two feed-based sources (RemoteOK, Wellfound). Only **~13 are actively producing jobs**;
the other 25 are unhealthy or effectively dead. Wellfound and RemoteOK contribute zero usable
output. A source-expansion migration (June 2026) has already added 10 high-confidence companies
and repaired 15 existing ones — those changes are deployed but post-deployment validation
has not yet been fully confirmed.

**Three priority vectors emerge:**

1. **Repair > Add** — 15 companies were repaired in the June 2026 migration; confirming
   their health via `validate-sources` should be the first action before adding more.
2. **Bangalore-specific depth** — current Bangalore coverage is thin (Hevo Data, Glean,
   Moloco, HackerRank, CommerceIQ are unconfirmed additions). Targeted Lever/Ashby picks for
   Bangalore-HQ companies offer the best ROI.
3. **HR contact extraction is low-effort, low-risk** — job descriptions already stored in
   full text; a regex pass over `jobs.description` could surface recruiter emails for ~10–20%
   of postings without any scraper change.

---

## Current Source Health

### ATS Sources (company-token based)

| Source | Configured | Healthy (pre-June migration) | Status |
|--------|-----------|------------------------------|--------|
| Greenhouse | 29 companies | ~9–10 | Primary volume driver |
| Lever | 2–6 companies | 1–2 (Meesho healthy; Gojek broken) | Fixed by GoToGroup token migration |
| Ashby | 5 companies | 2–3 (CRED broken, Syfe broken) | CRED migrated to Lever |

### Feed Sources

| Source | Status | Evidence | Recommendation |
|--------|--------|----------|----------------|
| RemoteOK | **Dead (yield=0)** | 0% keep rate; location strings "Worldwide/USA" never match India/SG/UAE/Remote tags | Disable via `REMOTEOK_DISABLED=true` |
| Wellfound | **Dead (yield=0)** | Feed URL unconfigured (`WELLFOUND_FEED_URL` not set); no official API | Disable via `WELLFOUND_DISABLED=true` until a feed is wired up |
| MyCareersFuture | **Healthy (small)** | Singapore-specific board; near-100% location tag match; consistent small volume | Keep active |

### Known Failure Patterns

| Pattern | Affected companies | Evidence |
|---------|-------------------|---------|
| Wrong/stale board token → 404 | Razorpay (was `razorpay`, now `razorpaysoftwareprivatelimited`), Gojek (was `gojek`, now `GoToGroup`) | `source-expansion-plan.md §4.1` |
| ATS migration (off Greenhouse/Ashby, on to Lever) | CRED, Kitopi, Nium, CleverTap | `source-expansion-plan.md §4.3` |
| ATS migration to unsupported platform | Loom (Atlassian), Swiggy (proprietary), Carousell (SmartRecruiters), MoEngage (Trakstar), StashAway (Kula.ai), PropertyGuru (Workday), Syfe (Keka), G42 (proprietary) | `source-expansion-plan.md §3` |
| Transient probe failures (boards live, probe URL mismatch) | Meesho, Xendit, Aspire, Innovaccer, PhonePe, Retool, Brex, Mercury, Postman | `source-expansion-plan.md §4.2` |

### Post-June-2026-Migration Expected State

After applying migrations `20260620000001`–`20260620000003`:

| Metric | Before | After (expected) |
|--------|--------|-----------------|
| Configured companies | 38 | 38 (10 removed, 10 added = net 0) |
| Healthy | ~13 | ~26–28 |
| Disabled/removed | 0 | 10 (soft-deleted) |

**This has not been confirmed via `validate-sources`.** The post-deployment verification
steps in `docs/reviews/source-expansion-verification.md` should be run before any further expansion.

---

## Bangalore Source Opportunities

### Current Bangalore Coverage (confirmed or high-confidence)

| Company | ATS:Token | Status in repo | Bangalore signal |
|---------|-----------|---------------|-----------------|
| Freshworks | greenhouse:freshworks | Healthy (pre-migration) | Chennai/Hyderabad HQ; BLR office |
| Razorpay | greenhouse:razorpaysoftwareprivatelimited | Repaired (June migration) | Bangalore HQ; primary eng hub |
| Glean | greenhouse:gleanwork | Added (June migration) | "Backend Engineer - India" roles confirmed; BLR-explicit |
| Moloco | greenhouse:moloco | Added (June migration) | Bengaluru + Gurgaon roles confirmed |
| HackerRank | greenhouse:hackerrank | In top-30 list (not yet added) | "Backend Engineer II, hybrid BLR" |
| CommerceIQ | greenhouse:commerceiq | In top-30 list (not yet added) | "SDE I/II/Senior Backend, Bangalore" |
| Hevo Data | lever:hevodata | In top-30 list (not yet added) | Bangalore HQ; SDE II/III; 29 active roles |
| Confluent | ashby:confluent | Added (June migration) | Bangalore hub; staff engineer roles |
| CRED | lever:cred | Repaired/migrated (June migration) | Bangalore HQ; consumer fintech |

### Gaps: High-Value Bangalore Sources Not Yet Configured

#### Tier 1 — Bangalore-HQ, high engineering volume

| Company | Expected ATS | Likely Token | Why valuable | Difficulty |
|---------|-------------|--------------|-------------|------------|
| **Hevo Data** | Lever | `hevodata` | BLR HQ; data engineering platform; 29 confirmed active roles | Low — already in top-30, just needs DB insert |
| **HackerRank** | Greenhouse | `hackerrank` | BLR office; "Backend Engineer II" roles explicitly BLR-hybrid | Low — in top-30 list |
| **CommerceIQ** | Greenhouse | `commerceiq` | BLR office; SDE I/II/III pipeline; Series D startup | Low — in top-30 list |
| **Stable Money** | Lever | `stable-money1` | BLR fintech startup; SWE/Senior Backend | Low — in top-30 list, small volume |

#### Tier 2 — BLR presence, large volume

| Company | Expected ATS | Likely Token | Why valuable | Difficulty |
|---------|-------------|--------------|-------------|------------|
| **Samsara** | Greenhouse | `samsara` | Hyderabad eng hub (300+ employees India); overlaps BLR | Low — already added in June migration |
| **Okta** | Greenhouse | `okta` | India dev center; explicit India/SG roles | Low — already added |
| **HighLevel** | Lever | `gohighlevel` | Remote-first, India hires; large SaaS platform | Medium — in top-30, needs validation |
| **Onehouse** | Lever | `Onehouse` | Distributed systems / Lakehouse; India + Remote; K8s infra roles | Medium — in top-30 list |

#### Tier 3 — India presence but BLR coverage not guaranteed

| Company | ATS | Notes |
|---------|-----|-------|
| **Paytm** | Lever | Post-RBI uncertainty; board exists but volume may have shrunk |
| **Groww** | Greenhouse (EU endpoint) | Worth probing `job-boards.eu.greenhouse.io/groww`; Indian fintech unicorn |
| **Zepto / Blinkit** | Unknown | Fast-commerce; large BLR eng teams; ATS not confirmed in docs |

### Access Methods Summary

| Method | Sources | Difficulty | Notes |
|--------|---------|-----------|-------|
| Greenhouse ATS API | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | Low | Public JSON; no auth |
| Lever ATS API | `api.lever.co/v0/postings/{token}?mode=json` | Low | Public JSON; no auth |
| Ashby ATS API | `api.ashbyhq.com/posting-api/job-board/{token}` | Low | Public JSON; no auth |
| RSS/Feed (Naukri, LinkedIn India) | External feeds | High | No stable public API; scraping fragile; out of current scope |
| Proprietary portals (Workday, SmartRecruiters, Kula.ai, Trakstar) | Not applicable | Very High | Not supported by current adapter architecture |

**Key insight:** Every unimplemented Tier 1/2 opportunity above uses an already-supported ATS
(Greenhouse, Lever, Ashby). Adding them is a database insert only — no code change required.

---

## HR Contact Opportunities

### Feasibility Assessment

**Data already available:** `jobs.description` is stored as full plain text (HTML stripped) for
all ingested jobs. The pipeline does not currently extract or store recruiter contact information.

**Signal presence in job descriptions:**

ATS-sourced descriptions (Greenhouse, Lever, Ashby) are structured employer copy. HR contact
email patterns appear in a minority of postings, primarily from:

- Smaller companies / startups that include a recruiter email for direct applications
- India-specific postings where recruiter outreach is culturally common (Lever boards especially)
- ATS boards used by newer/smaller startups (Ashby boards more likely than large Greenhouse boards)

Estimated prevalence based on ATS type:
| Source | Email frequency estimate | Reasoning |
|--------|------------------------|-----------|
| Greenhouse (large cos) | <5% | Structured ATS; apply buttons only |
| Greenhouse (small/startup) | 5–15% | Some include a `jobs@company.com` for questions |
| Lever | 10–20% | More startup-heavy; recruiter info occasionally embedded |
| Ashby | 15–25% | Startup-focused; Ashby boards often include team/recruiter info |
| MyCareersFuture | 20–30% | Government-integrated Singapore board; employer contacts common |

### Common Patterns to Detect

```
careers@<domain>
jobs@<domain>
hiring@<domain>
recruitment@<domain>
talent@<domain>
hr@<domain>
<name>@<domain>  (with context: "reach out to", "contact", "email us")
```

A simple regex over `jobs.description` can extract these patterns:
```
/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g
```
Combined with a role-prefix filter (`careers|jobs|hiring|recruitment|talent|hr`) for high-confidence
results, or full extraction for manual review.

### Implementation Paths

#### Option A — One-off analysis query (no code change)

Run a read-only SQL query against the existing `jobs` table:
```sql
SELECT company_name, title, url,
       regexp_matches(description, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'g') AS emails
FROM jobs
WHERE description ~* '\m(careers|jobs|hiring|recruitment|talent|hr)@';
```
Zero implementation cost. Useful for understanding actual prevalence before committing to infrastructure.

#### Option B — Extract at ingest time (schema change required)

Add `hr_contacts text[]` column to `jobs` (nullable); populate during `ingestJobs()` via a
pure `extractHrContacts(description): string[]` function. Follows existing `min_years` parse pattern.
Requires: migration + domain type update + ingest change + tests. Medium effort.

#### Option C — Extract at scoring time (no schema change)

Extract HR emails during AI scoring as an additional field in the structured JSON output.
OpenRouter already returns `{ score, reasoning }` — extend to `{ score, reasoning, hr_email?: string }`.
Low incremental cost if AI scoring is already running. But adds latency/cost per job.

### Dashboard Opportunities

If HR contacts are stored:
- Show recruiter email as a copyable chip on each job card
- Filter: "has direct contact" — surfaces jobs where cold outreach is possible
- Sort boost: jobs with HR contacts could receive a small score nudge (configurable)

### Telegram Opportunities

If HR contacts are stored:
- Include `📧 careers@company.com` in the Telegram digest for jobs where present
- Telegram inline button: `[Copy email]` (Telegram supports `copy_text` button type since Bot API 7.4)
- Could increase conversion rate on high-score matches where a direct contact exists

### Recommendation

1. **Start with Option A** — run the regex query on the live DB before any implementation.
   This gives ground truth on prevalence with zero effort.
2. **If prevalence >10%**, implement Option B (ingest-time extraction) following the existing
   `parseMinYears` pattern. The change is small and self-contained.
3. **Telegram integration** is a natural extension once the data is stored; the digest template
   already supports conditional fields.

---

## Recommended Priorities

### P0 — Immediate Wins (no code, DB-only or read-only)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Run `validate-sources` GitHub Actions workflow to confirm June migration health | 5 min | Confirms 26+ healthy sources vs. current ~13 |
| 2 | Set `REMOTEOK_DISABLED=true` in env | 2 min | Eliminates 0-yield scrape noise |
| 3 | Set `WELLFOUND_DISABLED=true` in env (until feed URL configured) | 2 min | Eliminates invalid-config warnings |
| 4 | Run HR contact SQL query (Option A above) on live `jobs` table | 15 min | Ground truth on email prevalence |

### P1 — Next Expansion (DB inserts only, no code change)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 5 | Add Hevo Data (lever:hevodata) — Bangalore HQ, 29 active roles | 1 migration | +BLR data engineering coverage |
| 6 | Add HackerRank (greenhouse:hackerrank) — BLR hybrid roles | 1 migration | +BLR backend coverage |
| 7 | Add CommerceIQ (greenhouse:commerceiq) — BLR SDE pipeline | 1 migration | +BLR Series D startup coverage |
| 8 | Add HighLevel (lever:gohighlevel) — India remote, large volume | 1 migration | +India remote backend coverage |
| 9 | Probe `job-boards.eu.greenhouse.io/groww` — Indian fintech unicorn | 10 min research | High upside if confirmed |

### P2 — Future Enhancements (code changes required)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 10 | HR contact extraction at ingest (Option B) — `hr_contacts text[]` column | Medium (migration + ingest + tests) | Enables direct recruiter outreach; Telegram integration |

---

## Effort vs Impact Matrix

```
HIGH IMPACT
│
│  ✅ Confirm June migration   ✅ Add Hevo Data/HackerRank
│  ✅ Disable RemoteOK/WF      ✅ Add CommerceIQ/HighLevel
│
│                              📋 HR contact ingest (Option B)
│  📋 HR contact SQL query
│
│                              📋 Groww probe + add
│
│                              📋 Onehouse / Paytm validation
│
LOW IMPACT
└─────────────────────────────────────────────────────────
  LOW EFFORT                                  HIGH EFFORT
```

Legend: ✅ = P0/immediate, 📋 = P1/P2

---

## Actionable Recommendations

> Limited to 10 items. Ordered by effort-to-impact ratio.

1. **Run `validate-sources` workflow** — confirm the June 2026 migration is live and healthy
   before planning any further expansion. Expected result: ~26+ healthy boards.

2. **Disable RemoteOK** (`REMOTEOK_DISABLED=true`) — zero yield, non-zero scrape time; disable
   immediately.

3. **Disable Wellfound** (`WELLFOUND_DISABLED=true`) — feed URL unconfigured; disable to
   suppress log noise until a feed is available.

4. **Run HR contact prevalence query** (SQL, read-only) — determine actual email frequency
   in current `jobs.description` corpus before any implementation decision.

5. **Add Hevo Data** (lever:hevodata) via DB migration — Bangalore HQ, 29 confirmed active
   roles, SDE II/III pipeline, zero code change.

6. **Add HackerRank** (greenhouse:hackerrank) — BLR hybrid Backend II roles explicitly posted;
   zero code change.

7. **Add CommerceIQ** (greenhouse:commerceiq) — Bangalore SDE I/II/Senior pipeline;
   zero code change.

8. **Probe Groww** — run `curl -I https://job-boards.eu.greenhouse.io/groww` to confirm board
   liveness; if healthy, add as one more DB row.

9. **Add HighLevel** (lever:gohighlevel) — remote-first, India engineering hires, large SaaS
   platform; one DB insert.

10. **Implement HR contact ingest** (Option B) only after step 4 confirms >10% prevalence —
    follow `parseMinYears` pattern: pure function, ingest-time, nullable column, fully tested.

---

*Research basis: codebase documentation (`docs/`, `design/`), seed migrations, and source
architecture analysis. No live DB access; figures marked as [inferred] where applicable.
No code was modified in the production of this document.*
