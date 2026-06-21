# Source Quality Analysis

## What It Does

`scripts/source-analytics.ts` queries the `scrape_runs` table for the last 30 days and prints a per-source metrics table to stdout. It is a read-only reporting tool — it writes nothing to the database and always exits with code 0.

## How to Run

```sh
npx tsx scripts/source-analytics.ts
```

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to be set in the environment (or `.env.local`).

## Metrics Explained

| Column | Meaning |
|---|---|
| Runs | Number of scrape runs recorded in the last 30 days |
| Found | Total jobs returned by the source before filtering |
| Kept | Jobs that passed location filtering |
| Keep% | `Kept / Found` — low values indicate the source returns many off-target jobs |
| Inserted | Net-new jobs added to the `jobs` table |
| Updated | Existing jobs refreshed (title/URL/etc changed) |
| 30d Avg | Average jobs found per run — a proxy for source health and activity |

## Low Performer Threshold

A source is flagged as a low performer if either:
- Keep rate is below 10% (source returns mostly off-target jobs)
- 30-day average found per run is below 5 (source is nearly empty or broken)

## Current Findings

**Greenhouse is the primary source.** It consistently returns the largest volume of relevant postings across configured companies and has the highest absolute keep, insert, and update counts.

**Lever and Ashby** provide moderate supplemental coverage for companies that use those ATS platforms.

**RemoteOK** consistently contributes 0 usable jobs despite returning some raw listings. Its keep rate is effectively 0% because the location data on RemoteOK postings rarely matches the configured location tags (India, Singapore, UAE, Remote). The source is not broken at the fetch level but produces no actionable output.

**Wellfound** returns 0 jobs found in recent runs. Either the scraper is encountering an auth or rate-limit wall, or there are no relevant postings on the platform at the time of scraping.

**MyCareersFuture** returns a small but usable volume, consistent with it being a Singapore-focused board.

## Recommendation

Investigate RemoteOK and Wellfound before relying on them for production coverage:

- **RemoteOK**: Check whether the location tags emitted by `tagLocations()` for RemoteOK postings match any of the allowed tags. If the source is globally-remote only and the filter requires a specific country, the source will always produce 0 kept jobs regardless of volume.
- **Wellfound**: Check the scraper for auth failures or API changes. If it has been returning 0 found for multiple consecutive runs, the scraper may need updating or the source should be deprioritised.
