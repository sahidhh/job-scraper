# Scoring Eligibility Analysis

## Question

Why did the scoring pipeline process only 24 jobs (out of 62 total / 50 shown on dashboard) for active role selection `607a4e34-ac1f-4fa0-b5e5-a1bdfe794028`?

## Source

`scripts/score.ts` calls `jobRepository.findUnscored(roleSelection.id, roleSelection.expandedRoles)`.

## Query

`SupabaseJobRepository.findUnscored` (src/features/jobs/infrastructure/SupabaseJobRepository.ts:147-182):

```ts
async findUnscored(roleSelectionId: string, expandedRoles: string[]): Promise<Job[]> {
  if (expandedRoles.length === 0) return [];

  const sanitizedRoles = expandedRoles.map(sanitizeRoleForFilter).filter((role) => role.length > 0);
  if (sanitizedRoles.length === 0) return [];

  // 1. Jobs already AI-scored for THIS role selection -> exclude
  const { data: aiScored } = await this.client
    .from("job_scores")
    .select("job_id")
    .eq("role_selection_id", roleSelectionId)
    .not("ai_score", "is", null);
  const aiScoredIds = (aiScored ?? []).map((row) => row.job_id);

  // 2. Title OR description must contain at least one expanded-role term
  const roleFilter = sanitizedRoles
    .flatMap((role) => [`title.ilike.%${role}%`, `description.ilike.%${role}%`])
    .join(",");
  let query = this.client.from("jobs").select("*").or(roleFilter);
  if (aiScoredIds.length > 0) {
    query = query.not("id", "in", `(${aiScoredIds.join(",")})`);
  }

  const { data } = await query;
  return (data ?? []).map(toJob);
}
```

## Eligibility criteria (both must hold)

1. **Role-term match**: `title` or `description` contains (case-insensitive substring) at least one of `roleSelection.expandedRoles` (sanitized — `,.()%*` stripped).
2. **Not already AI-scored for this `role_selection_id`** (i.e., no `job_scores` row with this `role_selection_id` and non-null `ai_score`).

## Active role selection's expanded_roles (607a4e34, created 2026-06-15)

```json
["Software Engineer", "Frontend Engineer", "Application Developer", "Web Developer", "Software Architect", "Backend Developer", "Full Stack Developer"]
```

(7 terms — vs. the prior active selection `0f84d299`, which had the same 7 plus `"Systems Programmer"`.)

## Why 24, not 50/62

- Total rows in `jobs`: **62**.
- `job_scores` rows for `role_selection_id = 607a4e34...` before this run: **0** → criterion 2 excludes nothing.
- Criterion 1 (title/description ilike match against the 7 current expanded-role terms) passes for only **24** of the 62 jobs.
- The remaining **38** jobs do not contain any of the 7 current role terms in title or description — most were likely scraped while the *previous* role selection (`0f84d299`, which included `"Systems Programmer"`) was active and `jobMatchesRoles` (scrape-time filter, AD-15) admitted them on that extra term, or on a role selection active even earlier.

## Run result (this session)

```
[score] scoring 24 unscored/retry job(s) for role selection 607a4e34...
  4 AI-scored (ai 0.10-0.40)
  19 skipped — keyword score < 0.5 gate (ai_score stays null by design, retried every run)
  1 OpenRouter 429 — ai_score left null for retry
```

## Conclusion

`findUnscored` is correctly scoped to **jobs whose title/description still match the *current* role selection's expanded roles**. It is intentionally narrower than "all jobs ever scraped" — 62 total, 24 eligible. The 26-job gap between the dashboard's "50 matched" and the 24 scored is a downstream symptom of [[dashboard-match-analysis]] (dashboard applies no role filter at all), not a defect in the scoring eligibility logic itself.
