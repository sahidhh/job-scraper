# OpenRouter Scoring Investigation

**Date:** 2026-06-19
**Status:** Root cause confirmed
**Confidence:** High

---

## Summary

Repeated 402 errors during AI scoring are caused by a single missing field: `max_tokens` is never sent to OpenRouter. When omitted, OpenRouter defaults the value to **65535** — its theoretical maximum — and reserves credits proportionally. Earlier jobs in a batch succeed while the credit balance is sufficient; once the running reservation drops below 65535-token-equivalent credits, every subsequent request in that run returns 402.

---

## Error Message (from pipeline log)

```
OpenRouter request failed with status 402
This request requires more credits, or fewer max_tokens.
You requested up to 65535 tokens, but can only afford 62025.
```

The number 65535 is not in any project source file. It is OpenRouter's default when no `max_tokens` parameter is present in the request body.

---

## Root Cause

**File:** `src/shared/infrastructure/openrouterClient.ts`, lines 43–50

```typescript
body: JSON.stringify({
  model,
  messages: request.messages,
  response_format: {
    type: "json_schema",
    json_schema: { name: request.schemaName, strict: true, schema: request.schema },
  },
}),
```

`max_tokens` is absent. The request body only contains `model`, `messages`, and `response_format`. No caller, no environment variable, and no library default in this project supplies the missing field — the raw `fetch` call goes out without it, and OpenRouter infers 65535.

The task only requires a score (0–1 float) and 1–3 sentences of reasoning, expressed as a small JSON object. The actual output is roughly 50–120 tokens. Reserving 65535 is ~500× the true need.

---

## Complete Execution Path

```
scripts/score.ts
  line 47: scoreJob(job, resume, roleSelectionId, { aiScoreProvider, ... })

src/features/scoring/application/scoreJob.ts
  line 37: if (keywordScore >= keywordThreshold) → aiScoreProvider.score()

src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts
  lines 22–29: buildSystemPrompt(resume)   → resume.parsedText + skills list
  lines 32–39: buildJobPrompt(job)         → title + company + location + description
  lines 49–56: callOpenRouterJson({ messages, schemaName, schema })

src/shared/infrastructure/openrouterClient.ts        ← ROOT CAUSE HERE
  lines 29–69: callOpenRouterJson()
    lines 43–50: JSON.stringify body — no max_tokens field
    line 37: fetchWithRetry(OPENROUTER_API_URL, { method: "POST", body, ... })

src/shared/infrastructure/http.ts
  line 10: isRetryableStatus — returns true only for status >= 500 or 429
  line 26: 402 is NOT retried (4xx that isn't 429 → returned immediately)

back in openrouterClient.ts
  line 54: response.ok is false → throws Error("OpenRouter request failed with status 402: ...")

back in OpenRouterAiScoreProvider.ts
  line 70–73: catch block → console.warn, returns null

back in scoreJob.ts
  line 39: result is null → aiScore stays null, keyword_score row is still upserted

back in scripts/score.ts
  line 59: aiScore == null → aiCallFailed counter incremented, job left for retry
```

---

## Evidence by Code Location

| Location | Line(s) | Finding |
|---|---|---|
| `src/shared/infrastructure/openrouterClient.ts` | 43–50 | `max_tokens` absent from request body |
| `src/shared/infrastructure/openrouterClient.ts` | 30–31 | Only `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are read from env; no `MAX_TOKENS` env var exists |
| `src/shared/infrastructure/http.ts` | 10–11 | `isRetryableStatus` does not include 402 → no retry on credit errors |
| `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts` | 22–29 | System prompt includes full `resume.parsedText` (variable length, typically 1 000–3 500 tokens) |
| `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts` | 32–39 | User prompt includes full `job.description` (variable length, 500–2 000+ tokens) |
| `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts` | 70–73 | On any error, returns `null` — 402 is silently swallowed here |
| `scripts/score.ts` | 37 | `keywordThreshold` defaults to `0.25` (lowered from `0.5` in AD-14) |
| `docs/scoring.md` | §5 | Config table does not list `MAX_TOKENS` or any token-budget env var |
| `docs/decisions.md` | AD-14 | Threshold lowered to 0.25, explicitly noting "more jobs reach stage 2 per run" |

---

## Why Some Jobs Succeeded and Later Jobs Failed

OpenRouter bills per-request based on `input_tokens + max_tokens`. With `max_tokens = 65535`, each AI call reserves a large block of credits up front regardless of actual output length:

1. Run begins with, say, 130 000 token-equivalents of credit.
2. First request: 65535 reserved → succeeds (130k > 65535).
3. Second request: another 65535 → succeeds (~64k remaining).
4. Third request: 65535 requested → **fails** — only 62 025 token-equivalents remain, which is less than 65 535.
5. All subsequent requests in the same run fail with identical 402 errors.

This is a **credit exhaustion** pattern caused by the inflated default, not a single-request failure. The threshold lowering in AD-14 increased the number of AI calls per run, accelerating the rate at which credits are consumed and making the exhaustion observable sooner.

---

## Token Budget Estimate (Actual Need)

| Component | Typical tokens |
|---|---|
| System prompt (resume.parsedText + skills) | 1 000 – 3 500 |
| User prompt (job title + description) | 500 – 2 000 |
| Expected output (JSON score + 1-3 sentence reasoning) | 50 – 120 |
| **Appropriate max_tokens ceiling** | **150 – 300** |
| **What OpenRouter currently assumes** | **65 535** |

Setting `max_tokens` to 256 would be sufficient for all valid responses while reserving ~220× fewer credits per request.

---

## Root Cause Classification

This is a combination of **(b) token misconfiguration** and **(d) quota exhaustion**:

- **Primary:** token misconfiguration — `max_tokens` is never sent, causing OpenRouter to default to 65535.
- **Secondary:** quota exhaustion — the inflated reservation depletes credits after only a few calls, making the failure look like a persistent credit shortage even when the actual credit balance could afford hundreds of correctly-scoped requests.

This is not a provider fallback issue (c) — a single model is used with no routing. It is not a pure credit shortage (a) — the credits are sufficient for the task at the correct token count.

---

## Recommended Fix

**Single-line change in `src/shared/infrastructure/openrouterClient.ts`, in the `JSON.stringify` body:**

```typescript
body: JSON.stringify({
  model,
  messages: request.messages,
  max_tokens: 256,          // add this line
  response_format: {
    type: "json_schema",
    json_schema: { name: request.schemaName, strict: true, schema: request.schema },
  },
}),
```

256 is generous for the expected output (50–120 tokens) while leaving headroom for unusually long reasoning. If the value should be env-configurable, read it alongside `OPENROUTER_MODEL`:

```typescript
const maxTokens = Number(optionalEnv("OPENROUTER_MAX_TOKENS", "256"));
```

Then include `max_tokens: maxTokens` in the body. This matches the pattern already used for `KEYWORD_THRESHOLD` in `scripts/score.ts` (line 37).

### Retry Strategy

The current retry in `http.ts` (line 10–11) only covers 5xx and 429. A 402 caused by misconfigured `max_tokens` is not worth retrying — once `max_tokens` is set correctly it will not occur. Do not add 402 to the retry set; that would retry a structural misconfiguration rather than fix it.

The existing retry behavior for 5xx/429 (one retry, 2 000 ms delay) is appropriate for transient provider errors and requires no change.

### Docs to update after fix

Per CLAUDE.md document-maintenance rules, the following must be updated in the same commit as any code change:

| Document | What to add |
|---|---|
| `docs/scoring.md` §5 (Config Summary) | `OPENROUTER_MAX_TOKENS` row (default 256) |
| `docs/decisions.md` | New AD entry recording the fix and rationale |

---

## Confidence

**High.** The 65535 value in the error message matches OpenRouter's documented default for requests with no `max_tokens` parameter. The request body in `openrouterClient.ts` (lines 43–50) confirms the field is absent. No other file in the project sets or passes `max_tokens`. The credit-exhaustion pattern (early jobs succeed, later jobs fail identically) is consistent with per-request credit reservation at the inflated default.
