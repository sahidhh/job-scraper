# Scrapers (`features/sources`)

## 1. Supported Sources

| Source | Type | Endpoint pattern | Needs `board_token`? |
|---|---|---|---|
| Greenhouse | ATS public API | `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` | yes (per company) |
| Lever | ATS public API | `https://api.lever.co/v0/postings/{board_token}?mode=json` | yes (per company) |
| Ashby | ATS public API (Job Board API) | `https://api.ashbyhq.com/posting-api/job-board/{board_token}` | yes (per company) |
| RemoteOK | Public job feed | `https://remoteok.com/api` | no — single global feed |
| Wellfound | Unofficial / scraped feed | Web search results (no stable public API) | no — single query-based feed |

Greenhouse, Lever, and Ashby require a `companies` row per employer (`board_token` = the slug in the URL, e.g. `stripe`, `figma`, `ramp`). RemoteOK and Wellfound return many companies' postings from one feed and ignore `companies`.

**Wellfound caveat:** Wellfound has no documented public API. The adapter must treat its response shape as unstable — wrap parsing defensively (section 4) and prefer returning an empty array over throwing if the page/response structure doesn't match expectations. This source is the most likely to need maintenance over time.

## 2. Source Adapter Pattern

Interface, in `features/sources/domain/JobSourceScraper.ts`:

```ts
interface JobSourceScraper {
  readonly source: JobSource;            // 'greenhouse' | 'lever' | 'ashby' | 'wellfound' | 'remoteok'
  readonly requiresCompanyConfig: boolean; // true for greenhouse/lever/ashby

  fetchJobs(companies: Company[], roles: readonly string[]): Promise<RawJob[]>;
  // companies is [] for sources where requiresCompanyConfig === false
  // roles is the active role selection's expandedRoles (architecture.md
  // §3.4, decisions.md AD-15) -- see "Role-aware fetching" below.
}
```

### Role-aware fetching (`roles` parameter, AD-15)

`fetchJobs` takes a second argument, `roles: readonly string[]` -- the active
role selection's `expandedRoles`. This constrains *what gets fetched and
ingested* by role, not just how it's scored:

- **No upstream ATS API in this project supports a role/keyword query
  parameter** (Greenhouse, Lever, Ashby, RemoteOK, Wellfound all return
  full feeds/boards). Every adapter therefore fetches its normal full
  set, then filters the resulting `RawJob[]` client-side using the shared
  pure helper `features/sources/domain/roleMatch.ts`:
  - `hasRoleFilter(roles)` -- true if at least one role sanitizes to a
    non-empty term.
  - `jobMatchesRoles(job, roles)` -- true if any role term (after
    stripping the same unsafe characters `,.()%*` that
    `SupabaseJobRepository.sanitizeRoleForFilter` strips for the
    equivalent scoring-time ILIKE match) appears as a case-insensitive
    substring of `title` or `description`.
- **Empty `roles` array = no filter** (current/legacy behavior, preserved
  as the safe default): every adapter returns everything it fetched.
  This is what makes `roles: []` backward-compatible for any caller that
  doesn't (yet) have a role selection.
- Each adapter applies `jobMatchesRoles` as the last step before
  returning, after normalization (so filtering sees the same
  `title`/`description` text that's persisted).

`scripts/scrape.ts` loads the active role selection via
`SupabaseRoleRepository.getActiveSelection()` (same call `scripts/score.ts`
already makes) and passes `roleSelection.expandedRoles` to every adapter's
`fetchJobs`. **If there is no active role selection, `scrape.ts` logs and
returns without scraping any source** -- it does not fall back to fetching
everything, since that would re-introduce the "most scraped jobs are
irrelevant" problem this change fixes.

Each adapter lives in its own folder and exports one object implementing this interface:

```
features/sources/
├── domain/
│   ├── JobSourceScraper.ts   # interface above
│   └── RawJob.ts              # normalized output type (section 3)
├── greenhouse/index.ts
├── lever/index.ts
├── ashby/index.ts
├── wellfound/index.ts
├── remoteok/index.ts
└── registry.ts                 # exports JobSourceScraper[] — all five
```

`registry.ts` is the only place that knows about all five adapters:

```ts
export const sourceScrapers: JobSourceScraper[] = [
  greenhouseScraper,
  leverScraper,
  ashbyScraper,
  wellfoundScraper,
  remoteokScraper,
];
```

`scripts/scrape.ts` loops `sourceScrapers`, passing `companies.filter(c => c.source === scraper.source)` to each. **Adding a new source = new folder + one line in `registry.ts`.** No other file changes.

For `requiresCompanyConfig: true` adapters, the adapter itself loops its assigned companies internally (so it can apply per-company error isolation and rate-limit delay — see section 4) and returns one combined `RawJob[]`.

## 3. Normalization: `RawJob`

All adapters return `RawJob[]`, defined in `features/sources/domain/RawJob.ts`:

```ts
interface RawJob {
  source: JobSource;
  sourceJobId: string;     // stable id from the source, used for dedup
  companyId: string | null; // companies.id if known (greenhouse/lever/ashby), else null
  companyName: string;
  title: string;
  locationRaw: string;     // best-effort single string, pre-tagging
  description: string;     // plain text, HTML stripped
  url: string;
  postedAt: string | null; // ISO 8601, or null if source doesn't provide it
}
```

### Per-source field mapping

| RawJob field | Greenhouse | Lever | Ashby | RemoteOK | Wellfound |
|---|---|---|---|---|---|
| `sourceJobId` | `job.id` | `posting.id` | `job.id` | `job.id` | listing id from result item |
| `companyName` | `companies.name` (config) | `companies.name` (config) | `companies.name` (config) | `job.company` | scraped company name |
| `title` | `job.title` | `posting.text` | `job.title` | `job.position` | scraped title |
| `locationRaw` | `job.location.name` | `posting.categories.location` | `job.location` | `job.location` | scraped location string |
| `description` | `job.content` (HTML → text) | `posting.descriptionPlain` (fallback: `description` HTML → text) | `job.descriptionHtml` (HTML → text) | `job.description` (HTML → text) | scraped description, may be truncated |
| `url` | `job.absolute_url` | `posting.hostedUrl` | `job.applyUrl` (or job board posting URL) | `job.url` | listing URL |
| `postedAt` | `job.updated_at` | `posting.createdAt` (epoch ms → ISO) | `job.publishedAt` | `job.date` | `null` if not present |

### Normalization rules (apply uniformly, in `features/sources/domain` helpers shared by adapters)

1. **HTML → plain text:** Greenhouse/Lever/Ashby/RemoteOK descriptions are HTML — strip tags to plain text (preserve line breaks as `\n`). Keep raw HTML out of `jobs.description`; it's only used for keyword/AI scoring, not rendered as HTML in the dashboard.
2. **Whitespace:** trim and collapse repeated whitespace in `title`, `locationRaw`, `companyName`.
3. **Dates:** convert all `postedAt` values to ISO 8601 UTC strings. If a source gives epoch milliseconds (Lever), convert. If absent (Wellfound), set `null` — `jobs.posted_at` is nullable.
4. **Missing/empty `locationRaw`:** set to `""` (empty string), not `null` — `filtering` treats empty string as "no tags match" → dropped.
5. **`sourceJobId` stability:** must be the source's own immutable identifier, never derived from `title`/`url` (titles/URLs can change on re-post; ids should not).

## 4. Error Handling Strategy

**Per-company isolation (Greenhouse/Lever/Ashby):** the adapter iterates its companies in a loop; each company's fetch is wrapped individually:

```
for company in companies:
  try:
    jobs = fetchOne(company)
    results.push(...jobs)
  catch (err):
    log warning, continue to next company
```

One company's API returning 404 (wrong/stale `board_token`) or timing out doesn't block the other companies for that source.

**Per-source isolation:** `scripts/scrape.ts` wraps each adapter's `fetchJobs()` call in its own try/catch. One source throwing entirely (e.g. RemoteOK API down) doesn't block the other four sources.

**Retries:** a shared `fetchWithRetry()` helper in `shared/http` — one retry with a short fixed backoff (e.g. 2s), only for network errors and `5xx` responses. `4xx` responses (e.g. bad board token) are not retried — logged and skipped immediately.

**Rate limiting:** for Greenhouse/Lever/Ashby adapters looping many companies, a small fixed delay (e.g. 250ms) between per-company requests avoids hammering each API. RemoteOK/Wellfound make one request total, no delay needed.

**Wellfound defensiveness:** because there's no stable contract, the Wellfound adapter validates the response shape before mapping (e.g. checks expected keys exist on at least one item); if validation fails, it logs a warning and returns `[]` rather than throwing or returning garbage `RawJob`s. This degrades gracefully — that source contributes zero jobs for the run instead of corrupting the pipeline or crashing it.

**Observability:** `scripts/scrape.ts` writes one `scrape_runs` row per source per cron run:

| status | meaning |
|---|---|
| `success` | adapter returned jobs (or legitimately zero — e.g. no new postings) with no errors |
| `partial` | *(reserved, not currently produced — see decisions.md AD-13)* some companies/items failed but at least one succeeded (Greenhouse/Lever/Ashby only); requires `JobSourceScraper.fetchJobs` to report per-company failure counts, not yet implemented |
| `failed` | adapter threw, or returned `[]` due to validation failure (Wellfound) |

`scripts/scrape.ts` currently writes only `success` (adapter call completed without throwing) or `failed` (adapter threw) per source per run — see AD-13.

`jobs_found` = count of `RawJob`s returned (before location filtering); `error` = last error message if `status != success`.

## 5. Wellfound feed configuration (`WELLFOUND_FEED_URL`)

Wellfound has no official public API (§1, AD-10), so `WellfoundScraper.ts` does not call Wellfound directly. Instead it reads `WELLFOUND_FEED_URL` (`optionalEnv`, default `""`) and `GET`s that URL as the entire Wellfound source.

**Default / degraded mode (unset):** if `WELLFOUND_FEED_URL` is empty, the adapter logs `[wellfound] WELLFOUND_FEED_URL not configured; skipping` and returns `[]` every run — `scrape_runs` records a `success` row with `jobs_found = 0` for `wellfound`. This is intentional (AD-10) and **safe to leave unset for staging/go-live**: every other source is unaffected, and the dashboard simply never shows Wellfound-sourced jobs.

**Configuring a feed (optional):** `WELLFOUND_FEED_URL` must point to an endpoint that returns `200 OK` with a JSON **array** body. Each array item is validated by `isWellfoundEntry` and, if valid, mapped to a `RawJob` (§3); invalid items are silently dropped, not the whole response. Required/optional fields per item:

| Field | Type | Required | Maps to |
|---|---|---|---|
| `id` | `string \| number` | yes | `RawJob.sourceJobId` (via `String(id)`) |
| `title` | `string` | yes | `RawJob.title` (whitespace-normalized) |
| `company` | `string` | yes | `RawJob.companyName` (whitespace-normalized) |
| `url` | `string` | yes | `RawJob.url` |
| `location` | `string` | no | `RawJob.locationRaw` (`""` if absent) |
| `description` | `string` | no | `RawJob.description` (HTML stripped, `""` if absent) |
| `postedAt` | `string` | no | `RawJob.postedAt` (parsed to ISO 8601, `null` if absent/invalid) |

There is no first-party Wellfound API or scraper that produces this shape today — operators who want this source populated must run their own feed (e.g. a small scraping service or scheduled export) that serves this JSON array at a stable URL, then set `WELLFOUND_FEED_URL` to it. Building that feed producer is out of scope for this repo.
