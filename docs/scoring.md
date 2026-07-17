# Scoring (`features/scoring`, `features/resume`)

Two-stage pipeline: cheap deterministic keyword scoring runs for every candidate job; AI refinement runs only for jobs that pass the keyword threshold. This bounds AI/OpenRouter usage to a small fraction of scraped jobs.

## 1. Resume Parsing (`features/resume`)

1. User uploads a PDF via `/resume`.
2. File stored in Supabase Storage; path saved to `resumes.file_path`.
3. Text extracted via `pdfjs-dist` → `resumes.parsed_text` (plain text, whitespace-normalized).
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

## 2a. Eligibility Pre-Filter (`features/scoring/domain/classifyEligibility.ts`, scoring-accuracy session)

Runs between the keyword gate and stage 2, on every job whose `keyword_score >= KEYWORD_THRESHOLD`.
Deterministic, no AI call, no new columns -- operates only on `locationRaw`/`locationTags`/`description`.

The candidate is India-based and needs visa sponsorship for any onsite role. A job is **hard-excluded**
(skips stage 2 entirely, `ai_score` stays null, no tokens spent) when:

- it is tagged **remote** (`locationTags` includes `"remote"`) but the text matches a
  `GEO_LOCK_EXCLUSION_PHRASES` entry (e.g. "US residents only", "must reside in the UK") --
  `shared/config/candidate-constraints.ts`, editable list; or
- it is **not** tagged remote (treated as onsite, including hybrid) and the text matches a
  `NO_SPONSORSHIP_EXCLUSION_PHRASES` entry (e.g. "not able to sponsor", "citizens only", "must have
  work authorization") -- same config file, editable list.

A remote-open job (no geo-lock phrase) and an onsite job that is merely *silent* on sponsorship both
pass this filter -- silence is unconfirmed eligibility, not disqualification; that distinction is
instead handled by the stage-2 prompt (§3) capping such jobs below a "strong" score.

`scripts/score.ts` logs a distinct `hard-excluded` line per job (recomputing the same pure
`classifyEligibility()` call purely for logging, not persisted) and a per-run count, separate from
"below keyword gate" and "AI call failed".

## 3. AI Scoring Flow (`features/scoring`, stage 2 — gated)

Triggered only when `keyword_score >= KEYWORD_THRESHOLD` (config default `0.25`, env-overridable) AND
the job passes the eligibility pre-filter (§2a).

1. Build a single OpenRouter chat completion request:
   - **System/context:** resume `parsed_text`, capped at `OPENROUTER_MAX_RESUME_PROMPT_CHARS` (default 4000 chars, Phase 3 Task 11-12 cost control -- see `docs/research/ai-cost-optimization-phase3.md`); the skills list is not sent separately — it is already embedded in `parsed_text`. The system prompt also injects the candidate's constraints (`shared/config/candidate-constraints.ts`: location + sponsorship need, ~years experience, primary/secondary stack) and instructs the model that a seniority mismatch, a primary-stack mismatch, or a sponsorship-silent onsite posting each caps the score below a "strong" match (`STRONG_MATCH_THRESHOLD`, `features/notifications/domain/types.ts`), regardless of skill-keyword overlap.
   - **User content:** job `title`, `company_name`, `location_raw` + `location_tags` (structured geography, e.g. `tags: singapore, remote`), `min_years` when non-null (e.g. `Experience required: 5+ years`), `description` capped at `OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS` (default 2000 chars). Only the AI prompt is truncated -- the stored `jobs.description`/`resumes.parsed_text` and the free keyword-gate stage (`extractSkills`) always see the full, untruncated text.
   - **Requested output:** structured JSON — `{ "score": number (0-1), "reasoning": string (1-3 sentences) }`, enforced via OpenRouter's JSON response-format / schema feature.
2. Model is configurable via `OPENROUTER_MODEL` env var (pick a low-cost model suitable for short classification+reasoning tasks — exact model left as a deploy-time choice, not hardcoded).
3. Request has a timeout and **one retry** on timeout/5xx. On repeated failure: `ai_score`/`ai_reasoning` stay `null`, `keyword_score` row already upserted — job still visible in dashboard, just unscored at stage 2.

**Token budget:** `max_tokens` is set explicitly to `OPENROUTER_MAX_TOKENS` (default 300). This is sufficient for all valid responses (score float + 1-3 sentences ≈ 50-120 tokens). Without an explicit limit, OpenRouter defaults to 65535, which reserves ~500× more credits per request than needed and triggers 402 errors once the balance drops below that reservation.

**Expected token usage per AI call:**

| Component | Typical range |
|---|---|
| System prompt (resume text, capped at 4000 chars — skills list removed) | 1 000 – 3 500 tokens |
| User prompt (title + location tags + min_years + description, capped at 2000 chars) | 500 – 2 000 tokens |
| Output (score + reasoning JSON) | 50 – 120 tokens |
| `max_tokens` ceiling | 300 tokens |

**Failure modes and classification:**

| Reason | Trigger | Retry? |
|---|---|---|
| `quota_exceeded` | HTTP 402 | No — fix requires reducing `max_tokens` or adding credits |
| `provider_rate_limit` | HTTP 429 | Yes — one automatic retry with 2 s backoff |
| `provider_error` | HTTP 5xx | Yes — one automatic retry with 2 s backoff |
| `malformed_response` | Missing/invalid `score` or `reasoning` in response | No |
| `timeout` | AbortError after 15 s | No (retry path via `findUnscored` on next run) |
| `unknown` | Any other network error | No (retry path via `findUnscored` on next run) |

All failures leave `ai_score` null. `OpenRouterAiScoreProvider.getStats()` returns per-run analytics (`successful`, `failed`, `failuresByReason`), logged by `score.ts` at the end of each batch.
4. On success: the same `job_scores` row is upserted with `ai_score = $score, ai_reasoning = $reasoning` (on conflict `(job_id, role_selection_id)` → update, not ignore — `repositories.md` §5).

### 3.1 Local embedding-similarity signal (`embedding_score`, decisions.md AD-31)

Alongside the OpenRouter call, the same `keywordThreshold` gate also runs a **local, offline** semantic-similarity check ported from jobhunt-app's `scoring.py`:

1. `TransformersEmbeddingScoreProvider` embeds the resume's `parsedText` and the job's `title + description` via a `@huggingface/transformers` `feature-extraction` pipeline (`onnx-community/all-MiniLM-L6-v2-ONNX`, mean-pooled + normalized). The model loads once per `score.ts` run and is reused across all jobs in that run.
2. Cosine similarity between the two vectors (`embeddingSimilarity.ts`) is mapped to `[0,1]` via the **continuous** transform `(sim + 1) / 2`, applied to every value with no special case at zero — the reference implementation's bug (jobhunt bug #1: only negative similarities were remapped, positive ones passed through raw, producing a discontinuity at `sim=0`) does not reproduce here.
3. Stored as `job_scores.embedding_score` (nullable `real`). It is a **stage-2, informational** signal only — it does not feed `computeOverallScore`'s ranking blend or the dashboard sort (that remains exactly `ai_score` + configurable bonuses, per AD-26).
4. Never throws. Returns `null` (leaving `embedding_score` unset) when there's no resume/job text to embed, or when the pipeline call fails for any reason (model load error, etc.) — and every such fallback is logged via `console.warn` (jobhunt bug #7: the reference implementation swallowed this failure silently).

No API key or network call is needed at scoring time beyond the model's one-time download (cached on disk afterward), so this signal has zero marginal per-job cost, unlike the OpenRouter call.

**Retry logic for `ai_score IS NULL` rows:** `JobRepository.findUnscored()` receives `keywordThreshold` and uses an OR filter to exclude two categories of "done" jobs:

   - **`ai_score IS NOT NULL`** — fully scored; excluded always.
   - **`keyword_score < keywordThreshold`** — intentionally skipped at the keyword gate; `ai_score` is null by design. These are also excluded so they are not re-queued forever (see `docs/fixes/scoring-loop-fix.md`).

   Jobs where `keyword_score >= keywordThreshold AND ai_score IS NULL` (genuine AI call failure) are **not** excluded — they are returned by `findUnscored` and retried on the next `score.ts` run. This preserves retry behavior for transient AI provider failures while preventing infinite re-queuing of below-gate jobs.

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
| `OPENROUTER_MAX_TOKENS` | `300` | Maximum output tokens for stage-2 AI response (score + reasoning); keep at 300 unless reasoning is being truncated |
| `OPENROUTER_MAX_RESUME_PROMPT_CHARS` | `4000` | Caps resume text sent in the AI prompt (Phase 3 Task 11-12 cost control) |
| `OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS` | `2000` | Caps job description text sent in the AI prompt (Phase 3 Task 11-12 cost control) |
| `OPENROUTER_COST_PER_1K_TOKENS` | _(unset)_ | Blended per-1k-token rate for the model in use (e.g. `0.0008` for $0.80/1M tokens). When set, each successful AI call stores an `estimated_cost_usd` on the `job_scores` row and `score.ts` logs estimated run cost. When unset, `estimated_cost_usd` is left null and the cost log line is omitted. |
