# Cost Review Audit

Scope: OpenRouter (AI) usage, GitHub Actions (cron) usage, Vercel suitability, Supabase usage — for a single-user job-intelligence app.

---

## Findings

### 1. Cron pipeline (the primary ongoing cost driver) doesn't exist yet — cost model is currently theoretical

- **Severity:** Critical (carried from architecture-audit Finding #1)
- **File:** N/A — `scripts/scrape.ts`/`score.ts`/`notify.ts`, `.github/workflows/*`
- **Description:** All recurring-cost categories this review is meant to evaluate (GitHub Actions minutes for "every 2h" runs, OpenRouter API spend from the scoring pipeline, Supabase request volume from scraping/scoring/notifying) are driven by the cron pipeline described in AD-04. Since that pipeline doesn't exist (architecture-audit Finding #1), **actual current operating cost is effectively just Vercel hosting + idle Supabase + zero OpenRouter spend** — the interactive app alone (login, dashboard reads, resume upload, company CRUD, role expansion preview) generates only on-demand, low-volume Supabase/OpenRouter calls.
- **Why it matters:** This audit can validate that the *design* of the cost-sensitive code (two-stage scoring gate, batching, etc.) is sound, but cannot validate *actual* recurring spend because the recurring job doesn't run. Once implemented, the findings below (especially #2 and #3) become directly load-bearing for the monthly bill.
- **Recommended fix:** No code action here — tracked under architecture-audit Finding #1. When implementing the cron scripts, re-run this cost review against the real "every 2h × 5 sources × N companies" volume to validate OpenRouter/Supabase spend projections before enabling the schedule in production.

---

### 2. Two-stage scoring gate is correctly minimizing AI calls — verified, no issue, documented for cost traceability

- **Severity:** N/A (informational / compliant)
- **File:** `src/features/scoring/application/scoreJob.ts`, `src/features/scoring/application/computeKeywordScore.ts`
- **Description:** `scoreJob` computes `computeKeywordScore(job, resume)` (free, local, deterministic) first. `deps.aiScoreProvider.score(...)` (the OpenRouter call) is only invoked when `keywordScore >= KEYWORD_THRESHOLD` (default `0.5`, per `scoring.md` §5 / AD-07). For role expansion, `expandRole.ts` checks `role_expansion_map` (seed + previously-cached AI results) before falling back to `OpenRouterRoleExpansionProvider`, and any AI-derived expansion is persisted with `source = 'ai'` so it's never re-requested for the same role (AD-06).
- **Why it matters:** This is the single biggest lever for OpenRouter cost control in the whole system, and it's implemented correctly. Flagging as a positive finding because it's the thing most likely to regress silently (e.g., someone "simplifying" `scoreJob` by removing the threshold check would dramatically increase AI spend with no functional symptom in dev/test).
- **Recommended fix:** None. Recommend adding a comment at the `KEYWORD_THRESHOLD` check in `scoreJob.ts` noting it's a deliberate cost gate (if not already present), so future refactors don't remove it inadvertently. Consider a regression test asserting `aiScoreProvider.score` is NOT called when `keywordScore < KEYWORD_THRESHOLD` (if such a test doesn't already exist) to make this gate refactor-proof.

---

### 3. `upsertMany`'s redundant pre-upsert SELECTs add Supabase request volume at scrape-time scale (cross-reference)

- **Severity:** Low
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:70-122`
- **Description:** Already detailed in performance-audit Finding #1 — `findExistingKeys` issues extra SELECT queries (one per distinct source per 500-row batch) purely to compute an unused `{inserted, updated}` count.
- **Why it matters:** Supabase's free/pro tiers meter database requests (and, depending on plan, compute time). At "every 2h across 5 sources" scale (once Finding #1 above is resolved), this roughly doubles the request count for the ingestion step specifically — a small but easily-eliminated multiplier on a recurring cost, for a return value nobody reads.
- **Recommended fix:** See performance-audit Finding #1 — remove `findExistingKeys` / the unused `{inserted, updated}` breakdown.

---

### 4. `findUnscored` / `findUnnotifiedMatches` query patterns grow with historical data, not active workload (cross-reference)

- **Severity:** Low
- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:124-144`, `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts:38`
- **Description:** Already detailed in scraper-audit Finding #2 and performance-audit Findings #3-4 — both queries fetch ID/row sets whose size grows with *all-time* job/score/notification history, then filter in JS, rather than scaling with the *current* unscored/unnotified workload.
- **Why it matters:** For a long-running single-user deployment (months/years of accumulated `jobs`/`job_scores`/`notifications_log` rows), these two query patterns are the ones most likely to cause a noticeable Supabase request-size/compute creep over time, even though the *useful* output (new jobs to score, new matches to notify) stays roughly constant per 2h run. This is the kind of thing that's invisible in week 1 and shows up as a Supabase plan-tier bump 6-12 months in.
- **Recommended fix:** Same as performance-audit Findings #3-4 — anti-join via view/RPC so query cost scales with new/unscored/unnotified rows, not total historical rows. Not urgent; worth addressing before the cron pipeline (Finding #1) has been running long enough for this to matter.

---

## Summary of Compliant Areas (no action needed)

- **Vercel suitability**: `next.config.ts`'s `serverExternalPackages: ["pdf-parse"]` correctly opts the `pdf-parse` native/CJS dependency out of Vercel's default bundling, avoiding build failures or oversized serverless function bundles — appropriate for Vercel's hobby/pro serverless function size limits. No other heavyweight/native dependencies found that would be problematic on Vercel.
- **No client-side polling or always-on connections**: dashboard and other pages are server components fetching on-demand (per-request), not maintaining websockets/realtime subscriptions or client-side polling intervals that would generate continuous Supabase load — appropriate for a low-traffic single-user app on Vercel's serverless model.
- **OpenRouter client has bounded request cost**: `REQUEST_TIMEOUT_MS = 15_000` ensures a hung OpenRouter request can't indefinitely hold open a serverless function invocation (which on some Vercel plans is billed by duration) or a GitHub Actions job step.
- **Role-expansion caching (AD-06)** ensures each distinct role string incurs at most one AI call ever (subsequent lookups hit `role_expansion_map`), which is the correct design for a cost driver that would otherwise scale with every role-selection change.
- **GitHub Actions cron (AD-04, "every 2h")**: the *design* (shared `src/` codebase invoked via `tsx`, no separate build step needed for cron) is appropriate for minimizing Actions minutes — once implemented, each run should be a single short-lived Node process per script (scrape/score/notify), which is cheap on GitHub Actions' free tier for a personal repo. No design issue found; implementation is the only gap (Finding #1).
