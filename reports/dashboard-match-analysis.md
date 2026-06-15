# Dashboard Match Count Analysis

## Question

How does the dashboard arrive at "50 jobs matched"?

## Source

`src/app/(protected)/dashboard/page.tsx` → `JobsSection` (line ~158):

```tsx
{jobs.length} job{jobs.length === 1 ? "" : "s"} matched, {scoredCount} scored by AI, {pendingCount} pending.
```

`jobs` comes from `jobRepository.findForDashboard(roleSelectionId, filters, limit)`.

## Query

`SupabaseJobRepository.findForDashboard` (src/features/jobs/infrastructure/SupabaseJobRepository.ts:184-215):

```ts
let query = this.client
  .from("jobs")
  .select(
    "id, source, source_job_id, company_id, company_name, title, location_raw, location_tags, url, posted_at, first_seen_at, updated_at, job_scores!left(keyword_score, ai_score, ai_reasoning, role_selection_id)",
  )
  .eq("job_scores.role_selection_id", roleSelectionId);

// + optional filters: locationTags (overlaps), sources (in), minAiScore (gte on job_scores.ai_score)

query = query
  .order("ai_score", { ascending: false, nullsFirst: false, foreignTable: "job_scores" })
  .order("posted_at", { ascending: false })
  .limit(limit + 1);
```

`limit` defaults to `DEFAULT_JOBS_LIMIT = 50` (page.tsx:16), via `parseLimit()`.

## Findings

1. **No role/title/description filter is applied on the `jobs` table at dashboard read time.** The `FROM jobs` clause has zero `WHERE` predicate tying rows to the active role selection's `expanded_roles`.
2. `roleSelectionId` is used **only** as the join condition for the `job_scores` left join (`.eq("job_scores.role_selection_id", roleSelectionId)`) — it scopes *which score* to attach, not *which jobs* to return.
3. Role expansion (`expanded_roles`) is **not considered at all** in this query.
4. Title/description matching is **not applied** in this query.
5. Score existence is **not required** — `job_scores!left` is a left join, so jobs with no matching `job_scores` row (any role) still appear, with `keywordScore`/`aiScore`/`aiReasoning` all `null`.
6. `.limit(limit + 1)` with default `limit=50` means the query returns at most 51 rows; `findForDashboard` slices to 50 and sets `hasMore` if a 51st row exists.

## Conclusion

**"50 jobs matched" is simply `min(total rows in jobs table, 50)`**, ordered by `(ai_score desc nulls last, posted_at desc)`. The word "matched" is a holdover from the page's framing ("Showing matches for `<primaryRole>`") but the query performs no match against that role at all — it's the first page of *every job ever scraped*, regardless of which role selection (current or historical) caused it to be scraped.

With 62 total rows in `jobs` and `limit=50`, the dashboard shows 50 and offers "Load more" for the remaining 12.
