---
name: manual-job-routine
description: Run the ad hoc "Claude routine" job search and import its matches into job-scraper's dashboard as source=claude_routine rows. Use when asked to search/find/curate job matches manually, run "the Claude routine", or import manual job matches.
---

# Manual (Claude-Routine) Job Matches

Design doc: `docs/tasks/manual-job-matches.md`. Decision record: `docs/decisions.md` AD-65.

This is the same interactive job-search routine historically run against the
separate `job-match-tracker` repo (search, read listings, score, annotate) --
only the final step changed: output feeds job-scraper's own dashboard instead
of (or in addition to) that repo's browser-localStorage `state.json`.

## Steps

1. **Search and curate matches** the same way as before: search/read job
   listings for the user's active roles, score each 0-100, and note anything
   worth flagging (`standout`) or double-checking (`verify`) before applying.
2. **Write the results** as a state.json-shaped JSON file to
   `reports/manual-matches/<YYYY-MM-DD>.json`:

   ```json
   {
     "runDate": "2026-08-03",
     "jobs": [
       {
         "id": "stable-unique-id",
         "title": "Senior Backend Engineer",
         "company": "Acme",
         "location": "Remote - India",
         "score": 88,
         "link": "https://example.com/jobs/123",
         "standout": "Optional: why this one stands out",
         "verify": "Optional: something to confirm before applying",
         "requirements": "Optional: key requirements text"
       }
     ]
   }
   ```

   Required per entry: `id`, `title`, `company`, `location`, `score`, `link`.
   `standout`/`verify`/`requirements` are optional narrative fields.
3. **Import it:**

   ```
   npm run import:manual-matches -- reports/manual-matches/<YYYY-MM-DD>.json
   ```

   This upserts each entry as a `jobs` row with `source='claude_routine'`,
   `manual_score`/`manual_standout`/`manual_verify`/`manual_requirements`
   populated, and `location_tags` derived from `location` the same way the
   automated scrapers do. Dedup key is `(source, source_job_id)` — re-running
   with the same file (or an updated one reusing the same `id`s) is safe and
   idempotent, it never creates duplicates.
4. **View the results** on `/dashboard` — click the "Claude routine" side of
   the origin toggle. These rows are ranked by `manual_score` descending, not
   `overall_score` (they're never touched by the automated AI scoring
   pipeline).

## Notes

- No env vars beyond what the repo already requires — the script reuses
  `SUPABASE_SERVICE_ROLE_KEY`, already scoped to `scripts/` (`design/security.md` §3).
- `claude_routine` is intentionally excluded from source-health checks and
  `/analytics`'s per-source probe table (same treatment as `careers_url`) —
  it's a manual entry point, not a polled source.
- A malformed entry (missing `id`/`title`/`company`) fails the whole import
  loudly rather than silently dropping a partial row — fix the source file
  and re-run.
