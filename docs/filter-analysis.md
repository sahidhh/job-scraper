# Filter Effectiveness Analysis

## Pipeline Overview

Every scrape run passes jobs through four sequential stages:

```
fetchJobs(companies, roles)
  → role filter (at fetch time, inside each adapter)
  → tagLocations()       — assigns india/singapore/uae/remote tags
  → hasAllowedLocation() — drops jobs with no matching tags
  → ingestJobs()         — dedup via upsert (insert or update)
```

The `scrape_runs` table records counts at two checkpoints:

| Column | Stage |
|---|---|
| `found_count` | After role filter, before location filter |
| `kept_count` | After location filter, before ingest |
| `inserted_count` | New rows written to `jobs` |
| `updated_count` | Existing rows refreshed |

## Role Filter

Role filtering runs inside each adapter's `fetchJobs()` call. Adapters whose upstream APIs have no keyword-search parameter (Greenhouse, Lever, Ashby, RemoteOK, Wellfound) filter the raw response client-side using `jobMatchesRoles()`. This means `found_count` already reflects the post-role-filter result — role drop-off is not visible in `scrape_runs`.

## Location Filter

`tagLocations()` matches `locationRaw` (case-insensitive substring) against the keyword rules in `src/shared/config/location-keywords.ts`. A job must match at least one tag or it is dropped.

| Tag | Keywords |
|---|---|
| india | india, bengaluru, bangalore, hyderabad, mumbai, pune, delhi, gurugram, gurgaon, noida, chennai, ncr |
| singapore | singapore |
| uae | uae, dubai, abu dhabi, united arab emirates, sharjah |
| remote | remote, work from home, wfh, anywhere, distributed |

## Why Greenhouse Drops So Many Jobs

Greenhouse boards are used primarily by US and EU companies. The vast majority of listings carry US city names or no location at all. None of those strings match the accepted keyword set, so they fail `hasAllowedLocation()`. Expected drop rates in the 60–80% range are normal given the current company list.

To improve yield: add more companies that actively post India/Singapore/UAE positions to the Greenhouse company list (`companies` table, `source = 'greenhouse'`).

## Why Ashby Drops So Many Jobs

Ashby is popular with US/EU seed-to-Series B startups. The same location mismatch applies. With a smaller absolute volume, even a handful of India-based companies would measurably improve the kept-count.

## Dedup Stage

Jobs that pass the location filter are handed to `ingestJobs()`, which upserts on `(source, source_job_id)`. A job already in the database is counted as `updated_count`; a new job is `inserted_count`. The gap between `kept_count` and `inserted_count + updated_count` is zero by construction — every kept job is either inserted or updated.

## Recommendations

1. **Add more India/Singapore/UAE companies to Greenhouse and Ashby** — this is the highest-leverage change to increase useful job volume without changing the filter logic.

2. **Treat "Remote" as a valid location globally** — already supported; ensure adapters that return blank `locationRaw` for remote-friendly roles are patched to emit "remote" explicitly.

3. **Consider disabling RemoteOK if it consistently shows 100% location drop rate** — set `REMOTEOK_DISABLED=true` in the environment. RemoteOK jobs are globally remote but the platform does not tag them with the target region keywords, so they are all dropped.

4. **Do not widen the keyword list indiscriminately** — adding "global" or "worldwide" would pass through many irrelevant jobs from US-only companies that claim global operations.

## Running the Analysis

```bash
npx tsx scripts/filter-analysis.ts
```

Output is plain text to stdout. No writes to the database.
