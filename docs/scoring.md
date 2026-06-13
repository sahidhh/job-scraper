# Scoring (`features/scoring`, `features/resume`)

Two-stage pipeline: cheap deterministic keyword scoring runs for every candidate job; AI refinement runs only for jobs that pass the keyword threshold. This bounds AI/OpenRouter usage to a small fraction of scraped jobs.

## 1. Resume Parsing (`features/resume`)

1. User uploads a PDF via `/resume`.
2. File stored in Supabase Storage; path saved to `resumes.file_path`.
3. Text extracted via `pdf-parse` → `resumes.parsed_text` (plain text, whitespace-normalized).
4. **Skill extraction** against a static **skills dictionary** (`shared/config/skills-dictionary.ts`) — a curated list of canonical skill names with aliases, e.g.:
   ```ts
   { canonical: "React", aliases: ["react", "react.js", "reactjs"] }
   { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"] }
   { canonical: ".NET", aliases: [".net", "dotnet", "asp.net"] }
   ```
   For each dictionary entry, check (case-insensitive, word-boundary) whether any alias appears in `parsed_text`. Matches → `resumes.skills` (canonical names only, deduped).
5. `/resume` displays extracted `skills`; user can manually add/remove entries before confirming (manual edits override extraction, stored as the final `skills` array — no AI involved).
6. `create()` deactivates the previous active resume and activates the new one (see `repositories.md` §3).

No AI is used in resume parsing — extraction is purely dictionary lookup.

## 2. Keyword Scoring Algorithm (`features/scoring`, stage 1 — always runs)

For each job returned by `JobRepository.findUnscored()` (already title-filtered against `expanded_roles`):

1. Run the **same skill-dictionary extraction** used for resumes against `job.title + "\n" + job.description` → `jobSkills: Set<string>` (canonical skill names mentioned in the posting).
2. `keyword_score = |resumeSkills ∩ jobSkills| / |jobSkills|`, clamped to `[0, 1]`.
   - This measures **what fraction of the skills the job asks for, the resume covers** — a recall-style score against the job's stated requirements.
   - If `|jobSkills| === 0` (posting mentions no dictionary skills — common for very generic listings), `keyword_score = 0`. The job is still stored with this score (visible in the dashboard, sortable) but will not reach stage 2.
3. Insert `job_scores` row with `keyword_score`, `ai_score = null`, `ai_reasoning = null`.

This is pure set arithmetic over two string arrays — no external calls, runs for every candidate job, deterministic and free.

## 3. AI Scoring Flow (`features/scoring`, stage 2 — gated)

Triggered only when `keyword_score >= KEYWORD_THRESHOLD` (config default `0.5`).

1. Build a single OpenRouter chat completion request:
   - **System/context:** resume `parsed_text` (or `skills` list, whichever fits token budget — prefer `skills` + a short summary excerpt to keep prompts small).
   - **User content:** job `title`, `company_name`, `location_raw`, `description`.
   - **Requested output:** structured JSON — `{ "score": number (0-1), "reasoning": string (1-3 sentences) }`, enforced via OpenRouter's JSON response-format / schema feature.
2. Model is configurable via `OPENROUTER_MODEL` env var (pick a low-cost model suitable for short classification+reasoning tasks — exact model left as a deploy-time choice, not hardcoded).
3. Request has a timeout and **one retry** on timeout/5xx. On repeated failure: `ai_score`/`ai_reasoning` stay `null`, `keyword_score` row already inserted — job still visible in dashboard, just unscored at stage 2. Not retried again on subsequent `score.ts` runs (job already has a `job_scores` row → `findUnscored` excludes it). If this is undesirable later, a manual "retry AI score" action can be added — out of scope for v1.
4. On success: `update job_scores set ai_score = $score, ai_reasoning = $reasoning where job_id = $jobId and role_selection_id = $roleSelectionId`.

**Cost bound:** AI calls per cron run ≤ number of jobs with `keyword_score >= KEYWORD_THRESHOLD` among *newly unscored* jobs only (already-scored jobs for the active `role_selection` are never re-sent). Switching the active role selection increases this set once (new role_selection_id → all matching jobs are "unscored" again for it) — an expected, bounded one-time cost per role change.

## 4. Notification Thresholds (`features/notifications`)

- `notify.ts` selects rows from `findUnnotifiedMatches(activeRoleSelectionId, NOTIFY_THRESHOLD)` (config default `0.75`).
- The query condition `s.ai_score >= $threshold` naturally excludes rows where `ai_score is null` (SQL `null >= x` is `null`, not `true`) — **only jobs that passed both stages can ever be notified**. A job with `keyword_score = 0.9` but `ai_score = null` (AI call failed) is not notified until/unless it gets an `ai_score` on a future run — but per §3, it won't be re-sent to AI. Accepted tradeoff for v1 (see `decisions.md`).
- Telegram message format (plain text):
  ```
  🎯 New match (87%)
  Senior React Developer @ Acme Corp
  📍 Remote
  <reasoning excerpt>
  <job url>
  ```
- After sending, `markNotified(jobId)` writes to `notifications_log`, guaranteeing exactly one notification per job for the lifetime of the data.

## 5. Config Summary

| Env var | Default | Effect |
|---|---|---|
| `KEYWORD_THRESHOLD` | `0.5` | Minimum stage-1 score to trigger an AI call |
| `NOTIFY_THRESHOLD` | `0.75` | Minimum `ai_score` to trigger a Telegram message |
| `OPENROUTER_MODEL` | (set at deploy) | Model used for stage-2 scoring and role-expansion AI fallback |
