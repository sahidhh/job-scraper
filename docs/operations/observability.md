# Source Observability

How to monitor, diagnose, and report on scrape pipeline health.

---

## 1. Schema — `scrape_runs`

One row is inserted per source per cron run by `scripts/scrape.ts`.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | uuid | No | Primary key |
| `source` | job_source enum | No | `greenhouse \| lever \| ashby \| wellfound \| remoteok \| mycareersfuture` |
| `status` | scrape_run_status enum | No | `success \| partial \| failed` |
| `found_count` | integer | No | Raw jobs returned by the adapter before any filtering |
| `kept_count` | integer | Yes | Jobs that passed the location filter (null for pre-migration rows) |
| `inserted_count` | integer | Yes | Net-new jobs upserted (null for pre-migration rows) |
| `updated_count` | integer | Yes | Jobs refreshed via upsert (null for pre-migration rows) |
| `failed_count` | integer | No | Sub-run processing errors (0 when the source itself failed entirely) |
| `started_at` | timestamptz | Yes | Wall-clock start of the fetch (null for pre-migration rows) |
| `completed_at` | timestamptz | Yes | Wall-clock end of the run (null for pre-migration rows) |
| `duration_ms` | integer | Yes | `completed_at − started_at` in milliseconds |
| `error` | text | Yes | Exception message on failure; null on success |
| `metadata` | jsonb | Yes | Reserved for future extensibility (source-specific context) |
| `run_at` | timestamptz | No | DB-generated insert timestamp; used for ordering |

### Status values

| Status | Meaning |
|---|---|
| `success` | Adapter returned results; all jobs were processed without error |
| `partial` | Adapter returned results but some processing steps encountered errors |
| `failed` | Adapter threw an exception; `error` column contains the message |

---

## 2. Reporting

Run the report script locally or in CI (requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npx tsx scripts/report-sources.ts
```

### Sample output

```
Source Observability Report
Generated: 2026-06-19T10:00:00.000Z
====================================================================================================

Last Run Per Source:
Source               Last Run (UTC)         Status    Found   Kept   Inserted   Updated   Duration
---------------------------------------------------------------------------------------------------
ashby                2026-06-19 08:02:00Z   FAILED    0       0      0          0         234ms
greenhouse           2026-06-19 08:00:00Z   success   45      32     12         20        1234ms
lever                2026-06-19 08:01:00Z   success   20      15     5          10        890ms
mycareersfuture      2026-06-19 08:03:00Z   success   60      41     18         23        2100ms
remoteok             2026-06-19 08:04:00Z   success   30      22     8          14        450ms
wellfound            2026-06-19 08:05:00Z   success   25      18     6          12        560ms

Failures in the last 7 days:

Source               Run Time (UTC)         Status    Error
---------------------------------------------------------------------------------------------------
ashby                2026-06-19 08:02:00Z   failed    Network timeout after 15000ms

Total failures: 1 across 1 source(s)
```

### Fields shown

| Column | Source |
|---|---|
| Source | `scrape_runs.source` |
| Last Run | `scrape_runs.run_at` |
| Status | `scrape_runs.status` |
| Found | `scrape_runs.found_count` |
| Kept | `scrape_runs.kept_count` |
| Inserted | `scrape_runs.inserted_count` |
| Updated | `scrape_runs.updated_count` |
| Duration | `scrape_runs.duration_ms` |

---

## 3. Troubleshooting

### A source shows `FAILED`

1. Check the `error` column in the failure summary — it contains the exception message.
2. Common causes:
   - **Network timeout** — the ATS board API was unreachable. Usually self-resolving on the next cron run.
   - **HTTP 404** — the board token for a company is no longer valid. Check the `companies` table and disable stale rows.
   - **Parse error** — the board's API response changed shape. Review the adapter in `src/features/sources/infrastructure/<source>/`.
3. Re-run manually to confirm recovery:
   ```bash
   npx tsx scripts/scrape.ts
   ```

### `found_count` is unexpectedly zero

- For Greenhouse/Lever/Ashby: verify the company has `active = true` and a valid `board_token` in the `companies` table.
- For Wellfound/RemoteOK/MyCareersFuture: the public feed may be empty for the current role selection. Check that `role_selections.is_active = true` and `expanded_roles` is non-empty.

### `kept_count` is much lower than `found_count`

The location filter is dropping many jobs. This is expected if the source posts globally — most jobs won't be in India, Singapore, UAE, or Remote. If the ratio is unexpectedly bad, inspect `jobs.location_raw` for recent rows from that source to see what location strings are being filtered.

### `inserted_count` and `updated_count` are both zero

All jobs from this run already exist in the database and were not refreshed. This is normal when the source has no new postings. The `last_seen_at` column on `jobs` rows is still updated by the upsert.

### Historical runs show `null` for metric columns

Rows created before migration `20260619000001_scrape_run_metrics.sql` only have `found_count`, `status`, `error`, and `run_at`. The new columns are nullable to preserve backward compatibility.

---

## 4. Operational Workflow

### Daily check

```bash
# Quick health check — look for FAILED sources
npx tsx scripts/report-sources.ts
```

### After a scraper change

1. Deploy the change.
2. Trigger a manual scrape run via the GitHub Actions workflow (`scrape.yml`), or run locally.
3. Re-run the report and verify `status = success` and counts look reasonable.

### Investigating a spike in `inserted_count`

A large spike (e.g., 200+ insertions from a source that normally inserts 10–20) can mean:
- A new batch of companies was added to the `companies` table.
- The source refreshed its job IDs (breaking dedup). Check `source_job_id` patterns in recent `jobs` rows.
- The role selection changed, causing previously-skipped jobs to now match.

### Archiving old runs

`scrape_runs` grows by ~6 rows per cron run (one per source). At 12 runs/day that is ~72 rows/day. There is no automatic pruning — rows are cheap and the full history is useful for trend analysis. If storage becomes a concern, delete rows older than 90 days:

```sql
DELETE FROM scrape_runs WHERE run_at < now() - interval '90 days';
```
