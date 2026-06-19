# Wellfound Source

## Overview

The Wellfound adapter (`features/sources/infrastructure/wellfound/WellfoundScraper.ts`)
ingests job listings from a user-configured JSON feed URL. Wellfound has no
documented public API, so the adapter does not call Wellfound directly — it
fetches a URL you supply that serves the expected JSON shape.

See `docs/decisions.md` AD-10 and `docs/scrapers.md` §1 for the architectural
rationale.

---

## Setup

### 1. Acquire a feed URL

Wellfound does not publish a public API or RSS feed. To populate this source
you need a feed that:

- Returns `200 OK` with `Content-Type: application/json`
- Responds with a **JSON array** (`[…]`) of job objects
- Serves job objects matching the schema below

**Options for producing a compatible feed:**

| Approach | Description |
|---|---|
| Wellfound saved-search export | Some third-party tools can export a Wellfound saved search to JSON. If you use one, verify it outputs the expected shape. |
| Custom scraping microservice | A small Node/Python script that fetches Wellfound search results and re-serves them as JSON. This is the most flexible option and keeps the feed under your control. |
| Static JSON file on a CDN | For low-volume or manual workflows: periodically export listings to a static JSON file hosted on S3 / Cloudflare R2 / GitHub Gist and point the adapter at it. |

Building a feed producer is **out of scope for this repository**. If you do
not have a feed, leave `WELLFOUND_FEED_URL` unset and set
`WELLFOUND_DISABLED=true` to make the intent explicit (see "Disabling the
source" below).

### 2. Configure the environment variable

In your GitHub Actions repository secrets / variables (for cron runs), set:

```
WELLFOUND_FEED_URL=https://your-feed-host.example.com/wellfound.json
```

For local testing, add it to `.env.local`:

```
WELLFOUND_FEED_URL=http://localhost:3001/wellfound-feed
```

---

## Feed Schema

The feed must return a top-level JSON **array**. Each element is validated by
`isWellfoundEntry` — invalid items are silently dropped (not the whole feed).

| Field | Type | Required | Maps to |
|---|---|---|---|
| `id` | `string \| number` | yes | `RawJob.sourceJobId` |
| `title` | `string` | yes | `RawJob.title` |
| `company` | `string` | yes | `RawJob.companyName` |
| `url` | `string` | yes | `RawJob.url` |
| `location` | `string` | no | `RawJob.locationRaw` (`""` if absent) |
| `description` | `string` | no | `RawJob.description` (HTML stripped, `""` if absent) |
| `postedAt` | `string` | no | `RawJob.postedAt` (ISO 8601, `null` if absent/invalid) |

**Minimal valid example:**

```json
[
  {
    "id": "123456",
    "title": "Senior Software Engineer",
    "company": "Acme Corp",
    "url": "https://wellfound.com/jobs/123456"
  }
]
```

**Full example:**

```json
[
  {
    "id": "123456",
    "title": "Senior Software Engineer",
    "company": "Acme Corp",
    "url": "https://wellfound.com/jobs/123456",
    "location": "Remote",
    "description": "<p>Join our team building the future of work.</p>",
    "postedAt": "2026-06-01T00:00:00Z"
  }
]
```

---

## Configuration States

The adapter recognises three states, logged at startup/run time:

### A — Disabled intentionally

Set `WELLFOUND_DISABLED=true` (or `1`) to explicitly opt out. The adapter
emits `[wellfound] disabled` and returns zero jobs without attempting a
network call. Use this when you have no feed and want to suppress the
"invalid configuration" warning.

```
WELLFOUND_DISABLED=true
```

### B — Misconfigured

If `WELLFOUND_DISABLED` is not set and `WELLFOUND_FEED_URL` is absent or
invalid, the adapter emits:

```
[wellfound] invalid configuration: <reason>
```

Possible reasons:

| Log message | Cause |
|---|---|
| `WELLFOUND_FEED_URL not set` | The env var is missing or empty |
| `malformed URL` | The value cannot be parsed as a URL |
| `unsupported protocol "ftp:"` | URL uses a protocol other than `http:` / `https:` |

### C — Active feed

When the URL is valid and the feed responds correctly, jobs are fetched,
filtered by your active role selection, and ingested normally. The scrape
run is recorded in `scrape_runs` with `status = 'success'`.

---

## Validation Rules

`validateWellfoundConfig()` (exported from `WellfoundScraper.ts`) returns a
discriminated union that can be called at startup for early diagnostics:

```ts
import { validateWellfoundConfig } from "@/features/sources/infrastructure/wellfound/WellfoundScraper";

const config = validateWellfoundConfig();
// { status: 'disabled' }
// { status: 'invalid_config', reason: string }
// { status: 'ok', feedUrl: string }
```

Validation checks (in order):

1. `WELLFOUND_DISABLED` is `"true"` or `"1"` → `disabled`
2. `WELLFOUND_FEED_URL` is empty or unset → `invalid_config`
3. URL fails `new URL()` parse → `invalid_config` (malformed URL)
4. URL protocol is not `http:` or `https:` → `invalid_config` (unsupported protocol)
5. All checks pass → `ok`

---

## Observability

Each scrape run writes a row to `scrape_runs`:

| `status` | Condition |
|---|---|
| `success` | Feed fetched and mapped without error (zero jobs is still success) |
| `failed` | Adapter threw unexpectedly |

Note: when the source is `disabled` or `invalid_config`, the adapter returns
`[]` without throwing, so `scrape_runs` records `success` with `jobs_found = 0`.
This matches the intentional degraded-mode design (AD-10) — a missing feed is
not an error that should alert, just silence.

---

## Troubleshooting

**Log: `[wellfound] invalid configuration: WELLFOUND_FEED_URL not set`**

Set `WELLFOUND_FEED_URL` in your environment, or set `WELLFOUND_DISABLED=true`
to suppress the warning when Wellfound is not in use.

**Log: `[wellfound] invalid configuration: malformed URL`**

Check that `WELLFOUND_FEED_URL` is a complete URL including the scheme, e.g.
`https://...` not just `example.com/feed`.

**Log: `[wellfound] feed returned 404`**

The URL is reachable but the path is wrong. Verify the feed URL is correct and
the feed producer is running.

**Log: `[wellfound] unexpected response shape (expected an array)`**

The feed returned a non-array JSON body (e.g. `{}` or `null`). Update your
feed producer to return a top-level array.

**Zero jobs returned despite valid feed**

- Check that your active role selection's `expandedRoles` match terms in the
  feed's `title` or `description` fields — the adapter filters client-side
  by role after fetching.
- Check location tags: jobs without an allowed location are dropped before
  ingestion.
- Verify that feed items contain the required fields (`id`, `title`,
  `company`, `url`) — items missing any required field are silently skipped.
