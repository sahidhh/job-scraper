# Scraper Review Audit

Scope: `src/features/sources/infrastructure/*` (5 adapters + registry), `src/shared/infrastructure/http.ts`, `src/shared/infrastructure/text.ts`, vs. `docs/scrapers.md`.

---

## Findings

### 1. `findUnscored` builds an `.or()` filter from unsanitized expanded-role strings

- **Severity:** Medium
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:124-144`
- **Location:** `const titleFilter = expandedRoles.map((role) => \`title.ilike.%${role}%\`).join(",")` then `.or(titleFilter)`
- **Description:** `expandedRoles` originates from `role_expansion_map.related_roles` (AI- or seed-generated free-text role names) and the user's `primary_role` input (validated only for non-empty/length in `roles/domain/validation.ts`, not for character content). These strings are interpolated directly into a PostgREST filter string passed to `.or()`. PostgREST filter syntax uses `,`, `.`, `(`, `)`, `*` as structural characters — a role name containing a comma (e.g., an AI-expanded role like `"Engineer, Backend"`) would split into an unintended extra `.or()` clause, and a role containing `%` or PostgREST-reserved characters could produce an invalid filter or unintended matches.
- **Why it matters:** This is technically a query-construction correctness issue, not a classic SQL-injection (PostgREST filters don't execute arbitrary SQL), but a malformed/unexpected role string could cause `findUnscored` to throw (breaking the scoring pipeline for that role selection) or silently match more/fewer jobs than intended. Since `expandedRoles` partly comes from an LLM (`OpenRouterRoleExpansionProvider`), the content isn't fully controlled even though it isn't directly attacker-supplied.
- **Recommended fix:** Sanitize each `role` before interpolation — at minimum strip/escape `,`, `.`, `(`, `)`, `*`, and `%` (PostgREST's `ilike` wildcard meaning is fine for the value itself, but commas/parens break `.or()` syntax), or build the filter using `supabase-js`'s `.filter()` per-condition chaining with parameterized values instead of string concatenation. Alternatively, cap/normalize AI-returned role names in `expandRole.ts` to a known-safe character set (letters, digits, spaces, hyphens) before they're ever persisted to `role_expansion_map`.

---

### 2. `findUnscored`'s `.not("id","in", ...)` list has no upper bound

- **Severity:** Low
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:124-144`
- **Location:** `.not("id", "in", \`(${scoredIds.join(",")})\`)`
- **Description:** `scoredIds` is the full set of job IDs already scored for a role selection, fetched without limit and joined into a single `NOT IN (...)` clause. As `job_scores` grows over time (every job ever scored against this role selection), this list grows unbounded.
- **Why it matters:** Eventually this produces a very large query string and a `NOT IN` clause over potentially thousands of UUIDs, which is slow for Postgres to plan/execute and increases payload size on every scoring run. Not a correctness bug yet, but a latent performance/cost issue that grows with usage (ties into performance-audit and cost-audit).
- **Recommended fix:** Restructure as a `NOT EXISTS` / anti-join via a Postgres view or RPC (`select j.* from jobs j where j.role_selection... and not exists (select 1 from job_scores s where s.job_id = j.id and s.role_selection_id = $1)`), or limit the unscored query to jobs with `first_seen_at` after some retention window, so the candidate set and the exclusion set both stay bounded.

---

## Summary of Compliant Areas (no action needed)

- **Source isolation / adapter pattern**: all five adapters (`GreenhouseScraper`, `LeverScraper`, `AshbyScraper`, `RemoteOkScraper`, `WellfoundScraper`) implement the `JobSourceScraper` interface with the same `fetch(companies?: Company[]): Promise<RawJob[]>` shape, and `registry.ts`'s `sourceScrapers` array order (`greenhouse, lever, ashby, wellfound, remoteok`) matches `scrapers.md` §2 exactly.
- **Per-company error isolation**: `GreenhouseScraper`/`LeverScraper`/`AshbyScraper` each wrap the per-company fetch in try/catch and `console.warn` + `continue` on failure, so one bad `board_token` doesn't abort the whole source — matches `scrapers.md` §4.
- **`fetchWithRetry`** (`src/shared/infrastructure/http.ts`): single shared helper used by all adapters, default `retries=1`, `retryDelayMs=2000`, retries only on network errors or `status >= 500` — matches `scrapers.md` §4 exactly, no per-adapter duplicated retry logic.
- **Normalization consistency**: all adapters funnel raw provider responses through the same `stripHtml`/`normalizeWhitespace` helpers (`src/shared/infrastructure/text.ts`) before producing `RawJob.description`/`title`, and all produce the same `RawJob` shape (`source`, `sourceJobId`, `companyName`, `title`, `description`, `locationRaw`, `url`, `postedAt`) per `scrapers.md` §3 field-mapping table — no per-adapter duplicated normalization logic.
- **Wellfound defensiveness (AD-10)**: `WellfoundScraper.fetch()` is wrapped such that any parse/network failure results in `return []` rather than throwing, confirmed correct — matches AD-10 and `scrapers.md` §1/§4 exactly.
- **`RemoteOkScraper` and `WellfoundScraper` take no `companies` argument** (feed-based sources, no `board_token` config needed), consistent with `scrapers.md` §1's source table distinguishing config-required vs. feed-based sources.
- **Rate limiting**: company-configured adapters (`Greenhouse`/`Lever`/`Ashby`) apply the documented ~250ms delay between per-company requests, matching `scrapers.md` §4.
- **No duplicated scraping logic across adapters** beyond the shared `fetchWithRetry`/text-normalization helpers — each adapter's provider-specific parsing (Greenhouse's `jobs[]` shape, Lever's flat array, Ashby's `jobs[]` under `jobBoardName`, RemoteOK's array-with-legal-notice-first-element quirk, Wellfound's HTML/JSON-LD scraping) is appropriately adapter-local since it's genuinely provider-specific.

(Note: the absence of a caller for `scrapers.md` §4's `scrape_runs.status` aggregation is tracked in `architecture-audit.md` Finding #2, since it's a missing-orchestration issue rather than an adapter-correctness issue.)
