# Dashboard Match Count vs Scoring Eligibility — Discrepancy Report

## Phase 3 — Side-by-side comparison

| | Dashboard "matched" (`findForDashboard`) | Scoring eligible (`findUnscored`) |
|---|---|---|
| **Source table** | `jobs` (left join `job_scores`) | `jobs` (anti-join `job_scores` on ai_score) |
| **Role filter on `jobs`** | **None** | `title`/`description` ILIKE any of `roleSelection.expandedRoles` (sanitized) |
| **Role selection's role** | Only scopes which `job_scores` row to *attach* (join key) | Scopes which `jobs` rows are *returned at all* |
| **Score-existence requirement** | None (left join — nulls allowed) | Excludes jobs already AI-scored *for this role_selection_id* |
| **Pagination** | `limit` (default 50, `Load more` for rest) | None — returns all matches |
| **Result for role 607a4e34** | 50 (of 62 total rows, unfiltered) | 24 |
| **Label shown to user** | "50 jobs **matched**" | (not shown directly; drives `scored`/`pending` counts) |

### Differing filters
- Dashboard: location/source/minAiScore filters only — no role-relevance filter.
- Scoring: role-relevance filter (title/description vs `expandedRoles`) is the *primary* filter.

### Differing role-matching logic
- Dashboard: **none**.
- Scoring: substring ILIKE match against current `expandedRoles`, same shape as the scrape-time filter (`jobMatchesRoles`, AD-15) but re-evaluated against the *current* role selection rather than whatever role selection was active when each job was scraped.

### Differing sources of truth
- Dashboard's "matched" set = historical scrape output (jobs admitted under *whatever role selection was active at scrape time*, e.g. `0f84d299` which included "Systems Programmer").
- Scoring's eligible set = re-evaluation against the *currently active* role selection (`607a4e34`).
- When the active role selection changes (as it did today), these two sets diverge: jobs that matched the old role terms remain in `jobs` and keep showing on the dashboard, but no longer match the new role's `expandedRoles`, so `findUnscored` never selects them — they sit permanently with `ai_score = null`, displayed as "pending AI review" forever.

## Phase 3 — Classification

**D. Product design inconsistency** (with elements of B).

- Not a UI rendering bug — the dashboard renders exactly what `findForDashboard` returns.
- Not strictly a query bug — both queries do what their respective domain logic intends (dashboard = "browse all scraped jobs", scoring = "score jobs relevant to the active role").
- It *is* inconsistent: the dashboard's copy ("X jobs **matched**", "Showing matches for `<primaryRole>`") implies the same role-relevance filter that scoring applies, but the underlying query doesn't apply it. This mismatch is what's surfacing as "26 jobs stuck pending forever" after a role-selection change.

## Phase 4 — Recommended fix (smallest change, not implemented)

**Decouple the dashboard's wording from "matched" semantics it doesn't have, and surface the real eligibility split.**

Smallest change: in `JobsSection` (src/app/(protected)/dashboard/page.tsx:158), replace:

```
{jobs.length} jobs matched, {scoredCount} scored by AI, {pendingCount} pending.
```

with copy that doesn't claim role-relevance for the unfiltered set, e.g.:

```
{jobs.length} jobs found, {scoredCount} scored by AI, {pendingCount} pending or not relevant to "<primaryRole>".
```

And/or compute a second count — "eligible for scoring under current role" — by reusing the same `expandedRoles` ILIKE predicate `findUnscored` already has, so the pending banner can distinguish:

```
24 eligible for scoring · 4 AI scored · 19 pending (below keyword threshold) · 1 retrying
26 not matching "developer" role — won't be scored
```

### Options considered

| Option | Effort | Tradeoff |
|---|---|---|
| **A. Reword dashboard copy only** ("found" instead of "matched") | Tiny | Cheapest; doesn't fix that 26 jobs are permanently unscored/stale — just stops mislabeling them. |
| **B. Apply the same `expandedRoles` filter to `findForDashboard`** | Small–medium | Makes "matched" accurate, but silently hides 26 jobs from the dashboard entirely (no indication they exist or why); also changes pagination counts users may be used to. |
| **C. Add a separate "eligible for current role" count alongside existing counts (no filter change)** | Small | Keeps all jobs visible (useful for browsing history across role changes) while making the pending/eligible split honest. Requires one extra query or reuse of `findUnscored`'s predicate as a `count`-only query. |
| **D. Prune/archive jobs that no longer match any expanded role of the active selection** | Medium–large | Architectural change (data lifecycle policy) — out of scope per "do not implement," and risks losing historical data users may want to browse. |

### Recommendation

**C**, optionally combined with **A**'s copy change. Add a lightweight `countEligibleForScoring(roleSelectionId, expandedRoles)` (or reuse `findUnscored`'s `roleFilter` as a `head: true, count: "exact"` query) and surface it in the existing status line, e.g.:

```
50 jobs found · 24 match "developer" role · 4 AI scored · 19 pending · 1 retrying · 26 from a previous role selection
```

This requires no schema change, no new architecture layer, and directly resolves the user confusion (many jobs "pending AI review" that will never be scored) without hiding data or silently changing what the dashboard lists.
