# Phase 3 Report — AI Cost Optimization

**Date:** 2026-07-03
**Branch:** `claude/job-scraper-stabilization-s8mzi5`
**Commit:** `6e17c59`

## Objective

Reduce AI-scoring token usage/cost while maintaining scoring quality; investigate batching,
caching, structured outputs, prompt simplification, adaptive model routing, retry optimization.

## Implementation Summary

Full investigation write-up: `docs/research/ai-cost-optimization-phase3.md`. Summary per area:

| Area | Finding |
|---|---|
| Structured outputs | Already implemented (`response_format: json_schema, strict: true`) — no change |
| Retry optimization | Already correctly scoped (1 retry only for genuinely transient failures: network/5xx/429; no retry for 402/malformed, which naturally retry on the next cron cycle via `findUnscored`) — no change |
| Caching | Effectively covered by Phase 1's fingerprint-based cross-source dedup (a rediscovered duplicate job never gets its own `job_scores` row or AI call at all) — no separate cache layer added |
| **Prompt simplification** | **Implemented.** Resume text and job descriptions are now capped before being sent to the AI (`OPENROUTER_MAX_RESUME_PROMPT_CHARS`/`OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`, defaults 4000/2000 chars) via a new `truncateText` helper |
| Batching | Investigated, designed, **not implemented** — would change `AiScoreProvider`'s per-job contract to a per-batch one, losing per-job failure isolation; needs approval as new architecture |
| Adaptive model routing | Investigated, designed, **not implemented** — would add a third scoring tier (cheap-then-premium AI cascade); needs approval as new architecture, and a validated threshold needs live cost/quality data unavailable in this session |

Only the AI *prompt* is truncated — `jobs.description`/`resumes.parsed_text` are stored in full, and
the free keyword-gate stage (`extractSkills`, `computeKeywordScore`) always operates on the full
untruncated text, so truncation never changes which jobs reach the AI stage, only what the AI sees
once there.

## Database Changes

None. This phase touched only application/infrastructure code and two new env vars.

## Architecture Decisions

`docs/decisions.md` AD-23 — full rationale, alternatives considered, consequences, plus the two
ready-to-build designs (batching, adaptive routing) for a future approved follow-up.

## Testing

- 552 tests passing (up from 546 at end of Phase 2). New coverage: `truncateText` unit tests, plus
  `OpenRouterAiScoreProvider` tests confirming resume/description truncation at custom and default
  caps, and confirming no truncation marker appears for text within the defaults.
- `npx tsc --noEmit`, `npm run build`, `npm run check:service-role-boundary` all pass.

## Performance / Cost Impact

Direct reduction in prompt tokens on every stage-2 AI call for any resume/description exceeding the
new caps (4000/2000 chars respectively) — the exact percentage reduction depends on real resume and
job-description lengths, which aren't measurable in this sandboxed session (no live OpenRouter
account). No latency change (still one call per job, same as before); no change to output token
budget (`OPENROUTER_MAX_TOKENS` unchanged).

## Risks

- A resume or job posting whose most relevant matching detail appears only after the character cap
  loses that signal to the AI score/reasoning — documented tradeoff (`design/limitations.md` §3.7),
  not a silent bug.
- Batching and adaptive model routing remain unimplemented; if AI cost is still a concern after this
  phase, those are the next concrete levers (designs ready in the research doc).

## Sign-off

Phase 3 (Tasks 11-12) complete. Build, typecheck, and full test suite green. Pushed to
`claude/job-scraper-stabilization-s8mzi5`. Proceeding to Phase 4 (analytics).
