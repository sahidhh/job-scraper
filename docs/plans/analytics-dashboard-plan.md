# Phase 5A — Analytics Dashboard Plan

**Goal:** Extend `/analytics` with AI cost visibility, scored-job source breakdown, and source health. Zero new tracking. No new tables. Reuse existing `job_scores`, `scrape_runs`, and `companies` data.

---

## Evidence Base

| Table | Relevant columns |
|---|---|
| `job_scores` | `tokens_input`, `tokens_output`, `estimated_cost_usd`, `ai_score`, `model`, `scored_at`, `role_selection_id` |
| `scrape_runs` | `found_count`, `kept_count`, `inserted_count`, `failed_count`, `status`, `source`, `run_at` |
| `companies` | `health_status`, `consecutive_failures`, `last_success_at`, `last_failure_at`, `name`, `source` |

**Already shipped (P3):** `/analytics` page has 6 recharts charts — jobs over time, by source (scrape-based), score histogram, status breakdown, by experience, by location. `recharts` installed. `SupabaseMatchedJobsRepository` exists.

**Gaps:** Token usage and AI cost not surfaced anywhere. Source "contribution" is scrape volume, not scored-job volume. Source health is shown as dashboard warnings only — never visualized.

---

## What NOT to build

- No new columns or migrations — all data already exists.
- No per-model breakdown — speculative; zero demand.
- No cost-over-time trend chart — nice-to-have, not minimum useful.
- No token tracking for keyword scoring — it's free; zero cost to surface.
- No global "scoring session" aggregation layer — DB aggregation at query time is sufficient at single-user scale.

---

## P0 — AI Cost & Token Summary

**Value:** Answers "what has this cost me?" with a single page load. Currently invisible.

### Required query

```sql
SELECT
  COALESCE(SUM(tokens_input), 0)         AS total_tokens_input,
  COALESCE(SUM(tokens_output), 0)        AS total_tokens_output,
  COALESCE(SUM(estimated_cost_usd), 0)   AS total_cost_usd,
  COUNT(*) FILTER (WHERE ai_score IS NOT NULL) AS jobs_scored_by_ai,
  COUNT(*)                                AS total_scored_rows
FROM job_scores
```

Global (no role-selection scope) — cost is cost regardless of which role scored it.

### Required types

Add to `src/features/insights/domain/types.ts`:

```ts
export interface TokenUsageStats {
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;       // sum of estimated_cost_usd; null rows treated as 0
  jobsScoredByAi: number;     // COUNT(*) WHERE ai_score IS NOT NULL
}
```

### Required repo change

Extend `MatchedJobsRepository` interface (`domain/MatchedJobsRepository.ts`):

```ts
getTokenUsageStats(): Promise<TokenUsageStats>;
```

Implement in `SupabaseMatchedJobsRepository`:
- Single `.select()` with `{ count: 'exact' }` won't work for multi-aggregate. Use `.rpc()` or two separate queries. Simplest: two queries — one `SELECT` via `.select('tokens_input, tokens_output, estimated_cost_usd, ai_score')` returning all rows and aggregate in JS (acceptable at single-user scale; a few thousand rows max). If row count grows, promote to a DB function.

**Alternative (simpler):** `SELECT COUNT(*), SUM(tokens_input), SUM(tokens_output), SUM(estimated_cost_usd)` via `.rpc('get_token_usage_stats')`. Keeps bandwidth minimal. Requires one migration to add the RPC — but no new table.

**Recommended:** JS aggregation on fetched rows for now (no migration). Add RPC if perf becomes an issue.

```ts
async getTokenUsageStats(): Promise<TokenUsageStats> {
  const { data, error } = await this.client
    .from('job_scores')
    .select('tokens_input, tokens_output, estimated_cost_usd, ai_score');
  if (error) throw toAppError(error);
  const rows = data ?? [];
  return {
    totalTokensInput: rows.reduce((s, r) => s + (r.tokens_input ?? 0), 0),
    totalTokensOutput: rows.reduce((s, r) => s + (r.tokens_output ?? 0), 0),
    totalCostUsd: rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
    jobsScoredByAi: rows.filter((r) => r.ai_score !== null).length,
  };
}
```

### Required UI changes

Add a 4-stat card row to `/analytics` **above** the existing charts:

```
[ Total input tokens ]  [ Total output tokens ]  [ Est. cost USD ]  [ Jobs AI-scored ]
```

Use existing shadcn `Card`/`CardContent`/`CardHeader` — no new component library. Stat value formatted with `toLocaleString()`. Cost: `$0.0000` (4 decimal places).

No chart — stat cards only. P0 is read-only KPIs.

### Required tests

`SupabaseMatchedJobsRepository.test.ts`: add case for `getTokenUsageStats` — mock returns rows with/without nulls, verify aggregation and null-safety.

---

## P1 — Scored Jobs by Source

**Value:** Shows which sources actually produce AI-scored candidates, not just raw scrape volume. The existing "Jobs by source" chart uses `scrape_runs.found_count` — high volume sources don't necessarily score well.

### Required query

```sql
SELECT j.source, COUNT(DISTINCT j.id) AS scored_count
FROM jobs j
JOIN job_scores js ON js.job_id = j.id
WHERE js.ai_score IS NOT NULL
  AND js.role_selection_id = $role_selection_id
GROUP BY j.source
ORDER BY scored_count DESC
```

Role-scoped (matches the analytics page's existing `getAiScores(roleSelectionId)` pattern).

### Required types

Add to `src/features/insights/domain/types.ts`:

```ts
export interface ScoredBySourceEntry {
  source: string;
  count: number;  // distinct jobs with ai_score IS NOT NULL for this role
}
```

### Required repo change

Extend `MatchedJobsRepository`:

```ts
getScoredJobsBySource(roleSelectionId: string): Promise<ScoredBySourceEntry[]>;
```

Implement in `SupabaseMatchedJobsRepository`:

```ts
async getScoredJobsBySource(roleSelectionId: string): Promise<ScoredBySourceEntry[]> {
  const { data, error } = await this.client
    .from('job_scores')
    .select('jobs!inner(source)')
    .eq('role_selection_id', roleSelectionId)
    .not('ai_score', 'is', null)
    .returns<{ jobs: { source: string } }[]>();
  if (error) throw toAppError(error);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const src = row.jobs.source;
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}
```

### Required UI changes

Add second chart to the "Jobs by source" card — or add a new card beside it:

```
[ Jobs found by source (scrape volume) ] [ AI-scored jobs by source ]
```

Reuse `JobsBySourceChart` component — same `{ source, count }[]` shape. No new chart component needed; `ScoredBySourceEntry` maps directly.

### Required tests

`SupabaseMatchedJobsRepository.test.ts`: case for `getScoredJobsBySource` — mock returns expected grouping.

---

## P2 — Source Health View

**Value:** Shows which ATS board sources are degraded without navigating to Settings. Currently health warnings only appear in the dashboard header area, not in analytics.

**Scope:** Company-configured sources only (Greenhouse / Lever / Ashby). Feed-based sources (RemoteOK, Wellfound, MyCareersFuture) have no `health_status` column — exclude gracefully (they have no rows in `companies`).

### Required query

```sql
SELECT name, source, health_status, consecutive_failures, last_success_at, last_failure_at
FROM companies
ORDER BY
  CASE health_status WHEN 'disabled' THEN 0 WHEN 'unhealthy' THEN 1 ELSE 2 END,
  consecutive_failures DESC
```

### Required types

Add to `src/features/insights/domain/types.ts`:

```ts
export interface SourceHealthEntry {
  name: string;
  source: string;                    // greenhouse | lever | ashby
  healthStatus: 'active' | 'unhealthy' | 'disabled';
  consecutiveFailures: number;
  lastSuccessAt: string | null;      // ISO
  lastFailureAt: string | null;      // ISO
}
```

### Required repo change

Option A: Add `getHealthSummary()` to `SupabaseCompanyRepository` (already imported in `DashboardContent`).
Option B: Add to `MatchedJobsRepository`.

**Recommendation: Option A.** Health is a company concern, not an insights concern. `SupabaseCompanyRepository` is the correct boundary.

Extend `CompanyRepository` domain interface + `SupabaseCompanyRepository`:

```ts
// domain/CompanyRepository.ts — add:
getHealthSummary(): Promise<SourceHealthEntry[]>;

// infrastructure/SupabaseCompanyRepository.ts — implement:
async getHealthSummary(): Promise<SourceHealthEntry[]> {
  const { data, error } = await this.client
    .from('companies')
    .select('name, source, health_status, consecutive_failures, last_success_at, last_failure_at')
    .order('health_status')       // lexicographic: active < disabled < unhealthy — reorder in sort below
    .returns<CompanyHealthRow[]>();
  if (error) throw toAppError(error);
  return (data ?? [])
    .map(row => ({
      name: row.name,
      source: row.source,
      healthStatus: row.health_status,
      consecutiveFailures: row.consecutive_failures,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
    }))
    .sort((a, b) => {
      const rank = { disabled: 0, unhealthy: 1, active: 2 };
      return rank[a.healthStatus] - rank[b.healthStatus] || b.consecutiveFailures - a.consecutiveFailures;
    });
}
```

### Required UI changes

New section in `/analytics` below existing charts:

**"Source Health"** — a compact table or list:

```
| Source name     | Board  | Status    | Failures | Last seen |
| Stripe          | lever  | ✓ active  | 0        | 2h ago    |
| Shopify         | ashby  | ⚠ unhealthy | 3      | 2d ago    |
| Dead Corp       | gh     | ✗ disabled | 10      | 7d ago    |
```

Use shadcn `Badge` for status (reuse the color palette already used in `CompanyList`). No chart needed — tabular data is cleaner here.

New server component `SourceHealthTable` in `features/insights/ui/` (or reuse company UI patterns from `features/companies/ui/`).

`/analytics` page: add `companyRepository.getHealthSummary()` to the `Promise.all` block.

### Required tests

`SupabaseCompanyRepository.test.ts`: add case for `getHealthSummary` — mock returns mixed statuses, verify sort order.

---

## Required Changes Summary

### New types (1 file)

`src/features/insights/domain/types.ts` — add:
- `TokenUsageStats`
- `ScoredBySourceEntry`
- `SourceHealthEntry`

### New repo methods

| Interface | Method | Table |
|---|---|---|
| `MatchedJobsRepository` | `getTokenUsageStats()` | `job_scores` |
| `MatchedJobsRepository` | `getScoredJobsBySource(roleSelectionId)` | `job_scores` + `jobs` join |
| `CompanyRepository` | `getHealthSummary()` | `companies` |

### New pure fns

None. Token aggregation happens in the repo (JS reduce). Source health sort happens in the repo. P0 and P1 have no pure-fn extraction value at this data size.

### New chart/UI components

| Component | Type | Location | Priority |
|---|---|---|---|
| Token stat cards (4 cards) | Static stat cards (no chart) | `features/insights/ui/` or inline in page | P0 |
| `ScoredBySourceChart` | `BarChart` (reuse `JobsBySourceChart` pattern) | `features/insights/ui/AnalyticsCharts.tsx` | P1 |
| `SourceHealthTable` | Table with Badge | `features/insights/ui/SourceHealthTable.tsx` | P2 |

### Updated pages

`src/app/(protected)/analytics/page.tsx`:
- Add `getTokenUsageStats()` to `Promise.all` (P0)
- Add `getScoredJobsBySource(activeSelection.id)` to `Promise.all` (P1)
- Add `companyRepository.getHealthSummary()` to `Promise.all` (P2)
- Add `SupabaseCompanyRepository` import (P2)

### API changes

None. Analytics page is server-rendered; no new API routes needed.

### Design doc updates

Per `CLAUDE.md` document maintenance rules:

| Document | Change |
|---|---|
| `design/erd.md` | No change (no new tables) |
| `design/api-reference.md` | No change (no new routes) |
| `design/use-cases.md` | Add "View AI cost and token usage" use case |
| `design/scope.md` | Move analytics from P3 bullet to "shipped" |
| `design/architecture.md` | Note `CompanyRepository.getHealthSummary` crosses feature boundary into analytics page |

---

## Implementation Order

```
5A-P0: Token & Cost Cards
  1. types.ts — add TokenUsageStats
  2. MatchedJobsRepository — add getTokenUsageStats()
  3. SupabaseMatchedJobsRepository — implement
  4. Test: SupabaseMatchedJobsRepository.test.ts
  5. analytics/page.tsx — fetch + render stat cards

5A-P1: Scored Jobs by Source
  1. types.ts — add ScoredBySourceEntry
  2. MatchedJobsRepository — add getScoredJobsBySource()
  3. SupabaseMatchedJobsRepository — implement
  4. Test: SupabaseMatchedJobsRepository.test.ts
  5. AnalyticsCharts.tsx — add ScoredBySourceChart (copy JobsBySourceChart)
  6. analytics/page.tsx — fetch + render

5A-P2: Source Health
  1. types.ts — add SourceHealthEntry (or put in companies/domain)
  2. CompanyRepository — add getHealthSummary()
  3. SupabaseCompanyRepository — implement
  4. Test: SupabaseCompanyRepository.test.ts
  5. SourceHealthTable.tsx — new component
  6. analytics/page.tsx — fetch + render

5A-Final: Design doc updates
  - design/use-cases.md, design/scope.md, design/architecture.md
```

---

## Constraints Checklist

- [x] Reuse existing tables (`job_scores`, `scrape_runs`, `companies`)
- [x] No new tracking or columns
- [x] No speculative metrics (no per-model, no time-series cost trend)
- [x] No new dependencies (recharts already installed, shadcn Card/Badge already present)
- [x] No new migrations
- [x] Repository pattern maintained
- [x] Layer order: domain → application (none needed) → infrastructure → tests → UI
- [x] No `any` types
- [x] `SupabaseCompanyRepository` already imported in dashboard — safe to reuse in analytics
