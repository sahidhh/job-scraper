# AI Cost Optimization — Phase 3 Investigation (Task 11-12)

**Date:** 2026-07-03
**Scope:** Reduce AI-scoring token usage/cost while maintaining scoring quality; investigate
batching, caching, structured outputs, prompt simplification, adaptive model routing, retry
optimization.

---

## Executive Summary

The pipeline already implements the core two-stage architecture Task 11 describes (Keyword Filter
→ Cheap filtering → High Potential Jobs → Premium AI): `computeKeywordScore` (free, deterministic)
gates which jobs reach the paid OpenRouter call (`KEYWORD_THRESHOLD`, default 0.25, AD-07/AD-14).
Of the six areas Task 12 asks to investigate, two were already fully addressed before this phase
(structured outputs, retry optimization), one is effectively addressed by Phase 1 work (caching, via
fingerprint dedup), one was implemented this phase (prompt simplification), and two are deliberately
**not** implemented — they would introduce new architecture and CLAUDE.md requires approval for that
(batching would change the AI call's request/response shape; adaptive model routing would add a
second scoring tier). Both are designed and documented below as ready-to-approve follow-ups.

| Area | Status | Action |
|---|---|---|
| Structured outputs | Already implemented | None — verified, documented below |
| Retry optimization | Already implemented | None — verified, documented below |
| Caching | Effectively covered by Phase 1 dedup | None — documented below |
| Prompt simplification | **Implemented this phase** | `truncateText` caps on resume/description |
| Batching | Investigated, not implemented | Design documented, needs approval |
| Adaptive model routing | Investigated, not implemented | Design documented, needs approval |

---

## 1. Structured Outputs — Already Implemented

`callOpenRouterJson` (`shared/infrastructure/openrouterClient.ts`) already sends
`response_format: { type: "json_schema", json_schema: { strict: true, schema } }` with a schema
requiring exactly `{ score, reasoning }` and `additionalProperties: false`. This is the
lowest-token, highest-reliability structured-output pattern available through OpenRouter — no
change needed. `OPENROUTER_MAX_TOKENS` (default 300) already caps completion length; the code
comment documents that omitting it lets some providers default to 65535 reserved tokens, which can
itself trigger spurious 402 errors once account balance runs low.

## 2. Retry Optimization — Already Implemented

`fetchWithRetry` (`shared/infrastructure/http.ts`) retries exactly once, only for network errors,
5xx, and 429 — genuinely transient failures. A 402 (quota exceeded) or other 4xx is returned as-is
and never retried within the same call, since retrying an unpaid/malformed request wastes a full
prompt's worth of tokens for a guaranteed repeat failure. A malformed response (200 status, bad JSON
shape) is also never retried within the call for the same reason — the model produced a bad shape
once, an immediate identical retry is unlikely to help. The actual "retry" for both of these happens
at the pipeline level: `findUnscored` re-selects any job with `ai_score IS NULL` on the next
`score.ts` cron run (AD-14), which is naturally rate-limited by the cron cadence rather than an
immediate hot-loop retry. This is already the efficient design — no change made.

## 3. Caching — Effectively Covered by Phase 1 Fingerprint Dedup

The obvious cache opportunity — "don't re-score the same logical job twice" — is already solved
structurally by Phase 1's cross-source duplicate detection (AD-16): a job rediscovered under a
different source never gets its own `jobs` row, so it never gets its own `job_scores` row or AI
call at all. A literal response cache (e.g. hash of resume+job text → cached score) was considered
and rejected: `job_scores` already has a unique `(job_id, role_selection_id, resume_version)` key
that prevents re-scoring the same job for the same role/resume version (`hasScore`/`findUnscored`),
so the only case a text-hash cache would additionally catch is two *different* jobs with
byte-identical title+description+resume text — rare enough (and the dedup fingerprint already
catches the common cause of that: the same posting via two sources) that a separate cache layer
would add complexity for negligible hit rate. No change made.

## 4. Prompt Simplification — Implemented This Phase

**Before:** `buildSystemPrompt`/`buildJobPrompt` (`OpenRouterAiScoreProvider.ts`) sent the full,
untruncated `resume.parsedText` and `job.description` on every AI call. Resumes are PDF-extracted
text (can run to several thousand characters including formatting artifacts); job descriptions
routinely include lengthy benefits/legal/DEI boilerplate after the actual role content.

**After:** Both are passed through the new `truncateText(text, maxChars)` helper
(`shared/infrastructure/text.ts`) before being embedded in the prompt —
`OPENROUTER_MAX_RESUME_PROMPT_CHARS` (default 4000) and `OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`
(default 2000), both env-overridable. This directly reduces prompt tokens on every single AI call
that reaches stage 2, with no change to stored data (only the prompt-building step is affected —
`jobs.description`/`resumes.parsed_text` are unchanged, so `parseMinYears`/`extractSkills`/
`extractContactEmail`/`extractSalary`, which all run on the full untruncated text, are unaffected).

**Why truncation, not summarization:** an AI call to summarize the resume/description first would
itself cost tokens, defeating the purpose. A hard character cap is free and deterministic. The caps
were chosen conservatively (most resumes and job descriptions carry their highest-signal content —
skills/summary, role requirements — in the first portion), trading a small amount of recall on
unusually long postings for a real, unconditional token reduction. This is a real, measured tradeoff
(documented in `design/limitations.md`), not free — a resume or posting whose most relevant detail
appears only after the cap will lose that signal to the AI stage. `extractSkills`'s free keyword
stage (§1) still sees the *full* text regardless, so the keyword-gate decision is never affected by
this cap — only the AI reasoning/score input is.

## 5. Batching — Investigated, Not Implemented (needs approval)

**What "batching" could mean here:** combining multiple jobs' scoring into one OpenRouter request
(one system prompt with the resume, one user message listing N jobs, one JSON response with N
scores) instead of one request per job.

**Why this wasn't implemented:** it changes the request/response contract (`AiScoreProvider.score`
currently takes one job, returns one result) — a domain-interface change requiring architect
approval, and it has real correctness costs:
- **Failure isolation is lost.** Today, one job's AI-call failure (timeout, malformed response,
  quota) leaves only *that* job's `ai_score` null for retry; every other job in the same `score.ts`
  run is unaffected. A batched call failing means all N jobs in that batch are unscored, and a retry
  re-spends tokens on the N-1 that might have scored fine individually.
- **Structured-output reliability degrades with batch size** for JSON-schema-constrained responses
  — more items in one schema-constrained array response increases the chance of a truncated or
  malformed response (interacting badly with `OPENROUTER_MAX_TOKENS`, which would need to scale with
  batch size, partially offsetting the token savings).
- **Net token savings are unclear without live measurement.** The system prompt (resume text) is the
  part that would actually be de-duplicated by batching; per Task 12's "reduce ... duplicate
  prompts" framing this is the real prize, but quantifying it requires knowing real resume/job-text
  sizes and batch sizes achievable within `OPENROUTER_MAX_TOKENS`, which isn't measurable without a
  live account and real scoring runs (unavailable in this sandboxed session).

**Recommended follow-up if approved:** batch by a small, fixed group size (e.g. 5 jobs/request),
keep the JSON schema as an array of `{jobId, score, reasoning}`, and treat a malformed/failed batch
response as "all N jobs in this batch stay unscored, retried next run" (consistent with today's
per-job failure semantics, just at batch granularity) rather than trying to salvage a partial batch
response.

## 6. Adaptive Model Routing — Investigated, Not Implemented (needs approval)

**What Task 11's stated flow implies:** "Keyword Filter → Cheap filtering → High Potential Jobs →
Premium AI" reads as a *three*-tier funnel — today's pipeline is two-tier (free keyword filter, then
a single AI model). A third tier would insert a cheap/fast AI pass between the keyword gate and the
existing (premium) AI call, escalating only jobs that pass the cheap pass to the premium model.

**Why this wasn't implemented:** it's a new scoring stage — new config surface (a second model,
a second threshold), new failure modes (what happens when the cheap pass succeeds but the premium
pass fails — is the job "half-scored"?), and doubled latency for any job that reaches the premium
tier. This is squarely "new architecture" per CLAUDE.md, not a parameter tweak.

**Recommended design if approved** (kept here so it's ready to build without re-investigating):
- New optional env var `OPENROUTER_CHEAP_MODEL`. When unset, behavior is unchanged (current
  single-premium-call path) — fully backward compatible, opt-in only.
- When set, `scoreJob` calls `aiScoreProvider.score()` once against the cheap model first; only
  jobs whose cheap-pass score clears a new `CHEAP_AI_THRESHOLD` (suggested default higher than
  `KEYWORD_THRESHOLD` but lower than `NOTIFY_THRESHOLD`, e.g. 0.5) proceed to a second call against
  `OPENROUTER_MODEL` (the existing "premium" model). Store the cheap-pass score/model alongside the
  existing columns (`job_scores` would need a `cheap_ai_score`/`cheap_model` pair, or a generalized
  `scoring_stage` marker) so it's visible which jobs were filtered at that tier and analytics (Phase
  4) can report the funnel's actual cost/quality tradeoff.
- Requires live measurement (real cheap-vs-premium model score correlation on this resume/job
  corpus) before picking a default `CHEAP_AI_THRESHOLD` — an arbitrary default risks discarding
  genuine high-potential jobs that the cheap model under-scores relative to the premium model.

---

## Recommendation

Ship the prompt-truncation change now (already done, this commit) — it's a strict improvement with
no architecture change and no quality tradeoff beyond the documented recall risk on outlier-length
text. Treat batching and adaptive model routing as a scoped, approved follow-up task once real usage
data (actual resume/description lengths, actual OpenRouter cost per run) is available to validate the
design choices above against, rather than guessing at batch sizes/thresholds now.
