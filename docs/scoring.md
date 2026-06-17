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

The same `extractSkills(text, dictionary)` (`shared/domain/skills.ts`) also powers the `insights` feature (P1): the `/insights` page recomputes each role-matched job's skills at read time to build the skill-gap ("level up") and skill-demand views. No skills are persisted on `jobs` — recomputation is cheap at single-user scale and keeps the scrape/ingest pipeline untouched.

## 2. Keyword Scoring Algorithm (`features/scoring`, stage 1 — always runs)

For each job returned by `JobRepository.findUnscored()` (already filtered by title or description against `expanded_roles` — consistent with the scrape-time role filter, AD-15 — and now also including previously-inserted rows with `ai_score IS NULL` — see §3):

1. Run the **same skill-dictionary extraction** used for resumes against `job.title + "\n" + job.description` → `jobSkills: Set<string>` (canonical skill names mentioned in the posting).
2. `keyword_score = |resumeSkills ∩ jobSkills| / |jobSkills|`, clamped to `[0, 1]`.
   - This measures **what fraction of the skills the job asks for, the resume covers** — a recall-style score against the job's stated requirements.
   - If `|jobSkills| === 0` (posting mentions no dictionary skills — common for very generic listings), `keyword_score = 0`. The job is still stored with this score (visible in the dashboard, sortable) but will not reach stage 2.
3. Upsert `job_scores` row with `keyword_score`, `ai_score = null`, `ai_reasoning = null` (on conflict, `keyword_score` is refreshed and `ai_score`/`ai_reasoning` are overwritten with the latest stage-2 result — see §3).

This is pure set arithmetic over two string arrays — no external calls, runs for every candidate job, deterministic and free.

## 3. AI Scoring Flow (`features/scoring`, stage 2 — gated)

Triggered only when `keyword_score >= KEYWORD_THRESHOLD` (config default `0.25`, env-overridable).

1. Build a single OpenRouter chat completion request:
   - **System/context:** resume `parsed_text` (or `skills` list, whichever fits token budget — prefer `skills` + a short summary excerpt to keep prompts small).
   - **User content:** job `title`, `company_name`, `location_raw`, `description`.
   - **Requested output:** structured JSON — `{ "score": number (0-1), "reasoning": string (1-3 sentences) }`, enforced via OpenRouter's JSON response-format / schema feature.
2. Model is configurable via `OPENROUTER_MODEL` env var (pick a low-cost model suitable for short classification+reasoning tasks — exact model left as a deploy-time choice, not hardcoded).
3. Request has a timeout and **one retry** on timeout/5xx. On repeated failure: `ai_score`/`ai_reasoning` stay `null`, `keyword_score` row already upserted — job still visible in dashboard, just unscored at stage 2.
4. On success: the same `job_scores` row is upserted with `ai_score = $score, ai_reasoning = $reasoning` (on conflict `(job_id, role_selection_id)` → update, not ignore — `repositories.md` §5).

**Retry of null `ai_score` rows (decisions.md AD-07 follow-up):** `JobRepository.findUnscored()` returns a job if it has *no* `job_scores` row for the active `role_selection_id`, **or** if its existing row has `ai_score IS NULL` (stage 2 never ran, below the old/the current gate, or a previous AI call failed). Such jobs are re-run through `scoreJob` on the next `score.ts` invocation:
   - If `keyword_score` still falls below `KEYWORD_THRESHOLD`, the row is re-upserted with `ai_score` still `null` (logged as "skipped: keyword below gate") — it remains eligible for retry on a future run if the threshold or job content changes.
   - If `keyword_score` clears the threshold and the AI call succeeds, `ai_score`/`ai_reasoning` are written and the row is excluded from `findUnscored` on subsequent runs (logged as "scored").
   - If the AI call fails again, `ai_score` stays `null` and the row remains eligible for retry on the next run (logged as "AI provider returned null (call failed)").

   Only rows with a non-null `ai_score` are considered "fully scored" and excluded going forward — this supersedes the previous "permanent null, never retried" behavior.

**Cost bound:** AI calls per cron run ≤ number of jobs with `keyword_score >= KEYWORD_THRESHOLD` among jobs returned by `findUnscored` (new jobs, plus null-`ai_score` retries). Switching the active role selection increases this set once (new role_selection_id → all matching jobs are "unscored" again for it) — an expected, bounded one-time cost per role change. The lower default threshold (`0.25` vs the prior `0.5`) increases the fraction of jobs that reach stage 2, but stage 1 (role-title filter + skill overlap) still bounds it to skill-relevant candidates.

## 4. Notification Thresholds (`features/notifications`)

- `notify.ts` selects rows from `findUnnotifiedMatches(activeRoleSelectionId, NOTIFY_THRESHOLD)` (config default `0.75`).
- The query condition `s.ai_score >= $threshold` naturally excludes rows where `ai_score is null` (SQL `null >= x` is `null`, not `true`) — **only jobs that passed both stages can ever be notified**. A job with `keyword_score >= KEYWORD_THRESHOLD` but `ai_score = null` (AI call failed) is not notified until it gets a non-null `ai_score` — but per §3, such rows are now retried by `findUnscored` on subsequent `score.ts` runs, so a transient AI failure no longer permanently blocks notification.
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
| `KEYWORD_THRESHOLD` | `0.25` | Minimum stage-1 score to trigger an AI call |
| `NOTIFY_THRESHOLD` | `0.75` | Minimum `ai_score` to trigger a Telegram message |
| `OPENROUTER_MODEL` | (set at deploy) | Model used for stage-2 scoring and role-expansion AI fallback |
