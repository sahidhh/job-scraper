# Job Platform Improvement Roadmap

> **Superseded by [`ROADMAP.md`](../../ROADMAP.md) (root, current as of the 2026-07-04 consolidation session).** Most of this doc's 8 initiatives are now done (Token Cost Tracking, Bangalore Source Expansion, source-validation scheduling, HR/contact-email detection via a different approach, Worth Reviewing via `digest_sessions` rather than the `telegram_interactions` design proposed here). This file is retained for its detailed effort/risk/dependency analysis on the still-open items (Scoring Logic Improvements, Experience Matching, per-model cost breakdown, Telegram alert on source failure) — check `ROADMAP.md`'s Backlog section first for current status before reading further.

**Document version:** 1.0  
**Date:** 2026-06-22  
**Owner:** Platform / Engineering  
**Status:** Draft — for review and prioritization

---

## Executive Summary

The Job Intelligence Platform has completed its initial feature build-out (P0–P3: job status, skill-gap insights, experience soft filter, analytics graphs) and a full pipeline stabilization pass (scoring loop fix, source health tracking, auto-disable, Telegram digest MVP). The platform is functionally stable, running on a 2-hour cron cadence with AI-assisted scoring via OpenRouter.

This roadmap captures **eight improvement initiatives** identified through codebase analysis, architectural decisions, and operational observations. They range from low-effort operational wins (Token Cost Tracking) to medium-complexity product improvements (HR Email Detection) to more strategic investments (Bangalore Source Expansion, Scoring Logic Improvements).

**Key findings:**

- The two most impactful quick wins are **Dead/Broken Source Detection alerting** (currently silent failures) and **Token Cost Tracking** (no spend visibility despite daily AI scoring runs).
- The highest-leverage product investment is **Bangalore Job Source Expansion** — 25 of 38 configured companies are currently unhealthy, and adding purpose-seeded India/Singapore/UAE companies would directly increase quality job volume.
- **Scoring Logic Improvements** and **Experience Matching Improvements** address known accuracy gaps in the core pipeline and are medium-complexity with outsized long-term value.
- **Worth Reviewing Investigation** and **HR Email Detection** are product-quality improvements that increase user trust in recommendations and reduce time-to-apply friction.

---

## Recommended Implementation Order

| Order | Initiative | Priority | Complexity | Rationale |
|---|---|---|---|---|
| 1 | Dead/Broken Source Detection | P0 | Low | Highest impact per effort; silent failures are a live data gap |
| 2 | Token Cost Tracking | P0 | Low | No spend visibility is an operational blind spot; single-run fix |
| 3 | OpenRouter Cost Tracking | P1 | Low | Extends #2; provides per-model and per-period cost breakdown |
| 4 | Bangalore Job Source Expansion | P0 | Medium | Data quality depends on source health; 25/38 companies broken |
| 5 | Worth Reviewing Investigation | P1 | Medium | Closes UX loop on the Telegram digest; users can't act on opaque lists |
| 6 | Experience Matching Improvements | P1 | Medium | Increases filter accuracy; soft filter coverage currently ~40% of postings |
| 7 | HR Email Detection and Prioritization | P2 | Medium | High user value, requires new data field and UI; independent of core pipeline |
| 8 | Scoring Logic Improvements | P1 | High | Core quality improvement; benefits all downstream features |

---

## Effort vs Impact Matrix

```
          │ HIGH IMPACT
          │
          │   [4] Bangalore Source    [8] Scoring Logic
          │   Expansion               Improvements
          │
 I        │   [6] Experience          [5] Worth Reviewing
 M  MED   │   Matching Improvements   Investigation
 P        │
 A        │   [1] Dead/Broken Source  [7] HR Email Detection
 C  LOW   │   Detection               and Prioritization
 T        │   [2] Token Cost Tracking
          │   [3] OpenRouter Cost
          │   Tracking
          │
          └─────────────────────────────────────────────────
               LOW          MED           HIGH
                        EFFORT
```

*Note: Low effort = 1–2 days; Medium = 3–7 days; High = 1–3 weeks.*

---

## Research Tasks Suitable For Delegation

The following sub-tasks within initiatives require investigation rather than implementation and can be delegated to a research agent or junior engineer without risk of production regression:

1. **ATS board token audit** (Initiative 4): Run `npm run validate-sources` against all 38 configured companies and document which are `healthy` vs `broken` vs `redirected`. Cross-reference against `docs/source-expansion-plan.md` §3–4 repair/removal candidates.
2. **OpenRouter model cost survey** (Initiative 3): Research current per-token pricing for the models in use (`OPENROUTER_MODEL` env var) and calculate projected monthly AI scoring cost at current scrape volume.
3. **HR signal vocabulary survey** (Initiative 7): Compile a list of phrases commonly appearing in recruiter/HR-posted job descriptions vs direct engineering team postings. Basis for a detection dictionary.
4. **Experience regex coverage audit** (Initiative 6): Run `parseMinYears` against a sample of 200 recent job descriptions and measure what fraction return `null`. Identify unparsed patterns to improve coverage.
5. **Skills dictionary gap analysis** (Initiative 8): Compare the current `shared/config/skills-dictionary.ts` against in-demand skills from recent job descriptions in the `jobs` table (use the `computeSkillDemand` output from `/insights`). Flag missing canonical terms.
6. **Worth Reviewing click-through audit** (Initiative 5): Review Vercel request logs for `/api/telegram/worth-reviewing` to establish baseline click-through rate before adding persistence.

---

## Low Risk Independent Tasks

These tasks can be implemented in isolation without touching the core scraping/scoring pipeline, making them safe to parallelize with other work:

1. **Add `OPENROUTER_COST_PER_1K_TOKENS` env var and log cost estimate per run** (Initiative 2/3) — pure addition to `scripts/score.ts` logging; no schema change, no behavioral change.
2. **Add Telegram alert when `MIN_HEALTHY_SOURCE_COUNT` is breached** (Initiative 1) — extension of existing `validate-sources.ts`; reads an existing threshold, sends one message.
3. **Schedule `validate-sources.yml` on a weekly cron** (Initiative 1) — GitHub Actions config change only; zero code change.
4. **Persist Worth Reviewing acknowledgment in `notifications_log`** (Initiative 5) — adds a Supabase call to an existing route; isolated to `src/app/api/telegram/worth-reviewing/route.ts`.
5. **Add `raw_count` column to `scrape_runs`** (Initiative 4) — forward-only migration + one field in `scrape.ts`; enables pre-role-filter visibility.
6. **Add `poster_type` nullable field to `jobs`** (Initiative 7) — forward-only migration; field is null until detection is implemented; no pipeline behavior change.

---

## Initiatives

---

# 1. Scoring Logic Improvements

## Problem

The two-stage scoring pipeline (keyword overlap → AI refinement) has accuracy limitations that reduce the relevance of ranked results. The keyword stage uses a static dictionary that misses synonyms and domain-specific terminology, and the AI stage prompt lacks structured context about the user's preferences beyond resume text. Jobs with genuinely good fit but unusual phrasing score lower than they should.

## Current State

- **Stage 1 (keyword overlap):** `computeKeywordScore` computes `|resumeSkills ∩ jobSkills| / |jobSkills|` using exact dictionary matching. The dictionary (`shared/config/skills-dictionary.ts`) is a manually curated list of canonical skills with aliases. Jobs that use non-canonical terms (e.g., "Golang" vs "Go", "k8s" vs "Kubernetes") may receive lower keyword scores if aliases are missing.
- **Stage 2 (AI):** The OpenRouter call sends resume `parsedText` (up to 3,500 tokens) and the full job description. The model returns a score (0–1) and 1–3 sentences of reasoning. The prompt has no structured schema for user preferences beyond the resume.
- **Threshold:** `KEYWORD_THRESHOLD = 0.25`. Jobs scoring below this never receive an AI call. `NOTIFY_THRESHOLD = 0.75` gates Telegram alerts.
- **Failure mode:** If `ai_score IS NULL` and `keyword_score >= 0.25`, the job is retried on the next `score.ts` run indefinitely (documented in `docs/fixes/scoring-loop-fix.md`).
- **Model tracking:** `model` name is now persisted in `job_scores` (post-stabilization fix).

## Recommendation

1. **Expand the skills dictionary** with common aliases, especially for infrastructure/cloud tooling and newer frameworks. Use the `/insights` demand view to identify top-demanded skills not yet in the dictionary.
2. **Add user preference context to the AI prompt** — include the user's selected roles (from `role_selections.expanded_roles`) and desired experience level (from `app_settings`) as structured fields alongside resume text. This gives the AI richer context without increasing token usage significantly.
3. **Introduce score confidence bands** — separate `ai_score` into a `STRONG_MATCH_THRESHOLD` (0.80, already used by digest) vs `NOTIFY_THRESHOLD` (0.75) vs `WEAK_MATCH` (<0.50). Surface these bands in the dashboard UI.
4. **Experiment with lower `max_tokens` cap** (currently 300) — investigate whether 150 tokens is sufficient for the score+reasoning JSON, halving per-call credit reservation.

## Expected Benefits

- Broader keyword gate coverage reduces "false negative" jobs that pass through unscored.
- AI prompt enrichment improves score accuracy, reducing misranked results.
- Score confidence bands give users a faster triage signal on the dashboard without reading reasoning text.
- Lower `max_tokens` reduces OpenRouter credit consumption by up to 50%.

## Implementation Complexity

**High** — dictionary expansion is low-risk but manual; AI prompt restructuring requires careful prompt engineering and regression testing across a representative job sample to confirm scores don't degrade.

## Dependencies

- `shared/config/skills-dictionary.ts` (dictionary expansion)
- `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts` (prompt changes)
- `src/shared/infrastructure/openrouterClient.ts` (`max_tokens` tuning)
- `features/scoring/domain/types.ts` (if score confidence bands are added as a domain type)
- `/dashboard` UI (if confidence bands are surfaced)

## Risks

- Widening the dictionary could increase false positives at the keyword gate, sending more jobs to AI scoring and raising costs.
- AI prompt changes are not deterministic — a prompt that improves scores for some jobs may subtly regress others. Must be validated against a held-out set before deploying.
- Changing score thresholds affects which jobs trigger Telegram notifications; a misconfigured threshold could cause notification floods or silence.

## Future Scope

- Embedding-based semantic similarity as an alternative Stage 1 (noted as "rejected" in AD-07 but worth revisiting if dictionary maintenance becomes burdensome).
- AI-generated skill synonyms to auto-extend the dictionary from job description corpora.
- A/B scoring: run two models in parallel and compare scores to identify systematic biases in the chosen model.

## Success Metrics

- Keyword gate pass rate increases from baseline without a proportional cost increase (targeted: +15% pass rate at same AI spend).
- User reports fewer irrelevant top-scored jobs in the dashboard.
- `ai_score` variance improves (fewer 0.5–0.6 "mediocre" scores for clearly strong or weak fits).

## Priority

**P1**

## Notes

The current `OPENROUTER_MAX_TOKENS=300` setting was added in the pipeline stabilization pass to fix a 402 credit exhaustion bug (the prior default was 65535). Any further reduction should be validated against production logs first — truncated reasoning JSON causes `malformed_response` failures that are not retried.

---

# 2. Experience Matching Improvements

## Problem

The experience soft filter (`jobs.min_years`) has low parse coverage — many job descriptions phrase experience requirements in ways the current regex does not capture. When `min_years IS NULL`, jobs are always shown (soft by design), meaning the filter has no practical effect for a large fraction of the corpus.

## Current State

- `parseMinYears` (pure function in `features/jobs/application/parseMinYears.ts`) extracts the smallest plausible years figure from patterns like `\b(\d{1,2})\+?\s*(?:years|yrs)\b`.
- Result stored in `jobs.min_years` (nullable integer, added in migration `20260616000002_experience.sql`).
- Dashboard filter: `min_years IS NULL OR min_years <= N` (null always passes).
- Pre-migration and existing rows have `min_years = NULL` until re-scraped.
- User sets desired max years via `/settings` → `ExperienceCard`.
- No backfill was done on initial deploy (documented in `docs/plans/phase-p2-experience.md`).

## Recommendation

1. **Expand regex coverage** — add patterns for: "minimum X years", "X to Y years of experience" (take X), "entry level" (→ 0), "mid-level" (→ 3), "senior" (→ 5), "lead/principal/staff" (→ 8). Validate against a sample before deploying.
2. **One-time backfill script** — run `parseMinYears` over all existing `jobs.description` rows where `min_years IS NULL` and update in batches. The function is pure and deterministic; backfill is safe to run offline.
3. **Dashboard coverage indicator** — show users what percentage of their visible jobs have a parsed `min_years` vs null, so they understand filter effectiveness.
4. **AI-assisted extraction fallback** — for jobs where the regex returns null, optionally send a targeted "extract experience requirement" prompt to the AI as a post-processing step (run in batch, not in the hot scoring path).

## Expected Benefits

- Filter becomes practically useful for more than the minority of postings with explicit "X years" text.
- Backfill immediately improves filter quality for the existing corpus without waiting for re-scrapes.
- Coverage indicator builds user trust by making the filter's limitations explicit.

## Implementation Complexity

**Medium** — regex expansion and backfill are low-risk pure-function work. AI-assisted extraction is optional and higher complexity.

## Dependencies

- `features/jobs/application/parseMinYears.ts` (regex expansion)
- `SupabaseJobRepository.ts` (backfill script or new `backfillMinYears` method)
- `/settings` UI and `/dashboard` FilterBar (coverage indicator, optional)

## Risks

- Over-expanding the regex could introduce false positives (e.g., "5 years warranty" in a remote-first startup description). Regex changes require comprehensive unit tests.
- Backfill runs an update on the entire `jobs` table — should be batched and run during a low-traffic window.
- AI extraction adds OpenRouter cost and latency to a batch process; must be budgeted separately from scoring.

## Future Scope

- Seniority level as a first-class filter (`entry | mid | senior | lead`) derived from parsed experience or title, not just raw years.
- Company-level seniority norms — some companies use "Senior" at 3 years, others at 8. Learning this from data over time would improve accuracy.

## Success Metrics

- `min_years IS NOT NULL` rate increases from current baseline to >60% of active jobs.
- User-reported false positives ("showed a job I should have filtered") decrease.
- Dashboard filter slider usage increases (proxy for user trust in filter accuracy).

## Priority

**P1**

## Notes

The current filter is explicitly "soft" by design (AD from `docs/plans/phase-p2-experience.md`): null always passes, no jobs are ever dropped at scrape time. This policy should be preserved even as parse coverage improves. The goal is better signal, not tighter gatekeeping.

---

# 3. Token Cost Tracking

## Problem

The platform makes OpenRouter AI calls on every scoring cron run but has no per-run or cumulative cost tracking. Operators cannot answer "how much did this week's scoring cost?" or "which cron run was unexpectedly expensive?" without manually querying OpenRouter's billing dashboard.

## Current State

- `OpenRouterAiScoreProvider.getStats()` returns `{ successful, failed, failuresByReason }` per run — this is logged by `scripts/score.ts` but only to stdout.
- `job_scores` table stores `model` (the model name used for each score) — this enables retroactive cost analysis but nothing computes it.
- `OPENROUTER_MAX_TOKENS = 300` is the per-call output ceiling. Input tokens (resume + job description) vary per call.
- No `cost_usd` or `tokens_used` field exists anywhere in the schema.
- Token usage is logged at the OpenRouter API response level but not extracted or stored by the current client (`src/shared/infrastructure/openrouterClient.ts`).

## Recommendation

1. **Extract token usage from API response** — OpenRouter responses include `usage.prompt_tokens`, `usage.completion_tokens`, and sometimes `usage.total_tokens`. Parse these in `callOpenRouterJson` and return them alongside the result.
2. **Log cost estimate per `score.ts` run** — multiply `(prompt_tokens + completion_tokens)` by the model's per-token rate (read from a new env var `OPENROUTER_COST_PER_1K_TOKENS`) and log the estimated USD cost at the end of each scoring run.
3. **Add `tokens_input` and `tokens_output` to `job_scores`** — store per-score token counts for historical cost analysis. This enables per-model cost comparison when the model changes.

## Expected Benefits

- Operators gain immediate visibility into scoring cost without checking OpenRouter's dashboard.
- Per-score token storage enables cost trend analysis as job volume grows.
- Anomaly detection: a run that consumed 10× the normal tokens is immediately visible.

## Implementation Complexity

**Low** — the OpenRouter API already returns token usage in the response body. This is a parsing and logging addition with an optional schema extension.

## Dependencies

- `src/shared/infrastructure/openrouterClient.ts` (parse `usage` from response)
- `src/features/scoring/infrastructure/OpenRouterAiScoreProvider.ts` (propagate token counts through `score()` return value)
- `scripts/score.ts` (log cost estimate)
- `supabase/migrations/` (optional: add `tokens_input`, `tokens_output` to `job_scores`)

## Risks

- OpenRouter's `usage` field format may differ across model providers (some return `null` for `completion_tokens` when using streaming). Handle gracefully with null coalescing.
- Cost-per-token rates change over time; the `OPENROUTER_COST_PER_1K_TOKENS` env var needs to be kept in sync manually.

## Future Scope

- Budget alerts: if a single run exceeds a configurable USD threshold, send a Telegram alert.
- Monthly cost dashboard on the `/analytics` page alongside job volume charts.

## Success Metrics

- `scripts/score.ts` logs `Estimated run cost: $X.XX (N input tokens, M output tokens)` on every scoring run.
- `job_scores.tokens_input` is non-null for >95% of new scores after deploy.

## Priority

**P0**

## Notes

This initiative pairs naturally with Initiative 4 (OpenRouter Cost Tracking) and should be implemented together. The only distinction is Initiative 3 focuses on per-run logging (operational), while Initiative 4 focuses on per-model and per-period aggregation (strategic).

---

# 4. OpenRouter Cost Tracking

## Problem

As the scoring pipeline matures and job volume grows, the cost of AI scoring becomes a recurring operational concern. Currently there is no way to compare costs across models, track spend over time, or forecast monthly bills. Model choices are made by feel rather than data.

## Current State

- `OPENROUTER_MODEL` is a single env var that applies to all AI scoring calls.
- `job_scores.model` stores the model name per score row (added post-stabilization).
- No cost aggregation exists in the application, dashboard, or analytics page.
- The OpenRouter dashboard provides billing history but it is not integrated with the platform's own analytics.

## Recommendation

1. **Per-model cost configuration** — support a `OPENROUTER_MODEL_COSTS` JSON env var mapping model IDs to per-1k-token rates: `{"anthropic/claude-haiku-4-5": 0.001, "openai/gpt-4o-mini": 0.0015}`. Fall back to a single `OPENROUTER_COST_PER_1K_TOKENS` default.
2. **`/analytics` cost panel** — add a cost-over-time chart to the existing analytics page, powered by joining `job_scores.model + tokens_input + tokens_output` (once Initiative 3 adds token columns).
3. **Model comparison view** — show average `ai_score` and estimated cost per call, grouped by `model`, so the operator can evaluate whether a cheaper model degrades recommendation quality.

## Expected Benefits

- Data-driven model selection: switch to a cheaper model with confidence, or justify a premium model with quality evidence.
- Budget predictability: forecast next month's cost from current job volume trends.
- Early detection of cost anomalies (e.g., a model provider changed their pricing silently).

## Implementation Complexity

**Low** — primarily a reporting/analytics feature that reads existing `job_scores` data. Depends on Initiative 3 for token columns.

## Dependencies

- Initiative 3 (Token Cost Tracking) — must be implemented first to populate `tokens_input`/`tokens_output`.
- `features/insights/application/` (new pure aggregation functions for cost-over-time, cost-per-model).
- `SupabaseMatchedJobsRepository` (new `getCostBreakdown()` method).
- `/analytics` page UI (new chart panel).

## Risks

- If Initiative 3 is not deployed, cost analytics will have no data to show. The UI panel should degrade gracefully with a "No cost data available — enable token tracking" message.
- Multi-model environments (if the operator switches models mid-month) need to ensure the model cost map is accurate for all historical model names in `job_scores`.

## Future Scope

- Automated model A/B testing: route a configurable percentage of scoring calls to a secondary model and compare score distributions and costs.
- Budget cap enforcement: pause AI scoring for the remainder of the month when a monthly USD limit is reached.

## Success Metrics

- `/analytics` shows a cost-over-time line chart with accurate USD estimates.
- Operator can identify the cheapest model achieving ≥ current average `ai_score` quality within 30 minutes of analysis.

## Priority

**P1**

## Notes

This initiative is strategically important as job volume grows. At current volume (13 healthy sources, 2-hour cron) the cost is manageable. But each new source or lower keyword threshold increases AI call frequency. Building cost visibility now avoids surprises later.

---

# 5. Bangalore Job Source Expansion

## Problem

25 of 38 currently configured job sources (companies) are unhealthy — their ATS board tokens are stale, companies have migrated to unsupported ATS platforms, or they have simply delisted their boards. The pipeline is effectively running on ~13 healthy sources, heavily weighted toward a subset of Greenhouse companies. India (especially Bangalore), Singapore, and UAE coverage is thinner than it should be.

## Current State

- **Healthy sources:** ~13 companies (estimated; varies by cron run).
- **Unhealthy sources:** ~25 companies silently failing — errors swallowed by the adapter isolation loop (`scrapers.md` §4), with no visible signal in the dashboard beyond the validate-sources report.
- **Zero-yield sources:** RemoteOK (0% keep rate due to location mismatch), Wellfound (0 jobs found — feed URL not configured or broken).
- **Location filter:** Bangalore/India is the primary target region, but the 60–80% Greenhouse drop rate for US-headquartered companies limits effective yield even from the healthy sources.
- **Source expansion plan:** `docs/source-expansion-plan.md` documents 10 companies to remove, 15 to repair, and 30 replacement candidates — including 10 high-confidence additions (Binance, Samsara, Confluent, Okta, Glean, Adyen, Grafana Labs, Veeva Systems, Moloco, Careem).

## Recommendation

**Phase A — Repair and remove (DB changes only, no code change):**
1. Fix board tokens for Razorpay (`razorpaysoftwareprivatelimited`) and Gojek (`GoToGroup`).
2. Migrate CRED (ashby→lever), Kitopi (greenhouse→lever), Nium (greenhouse→lever), CleverTap (greenhouse→lever).
3. Remove 10 dead sources: Loom, Swiggy, Chargebee, Carousell, Hasura, MoEngage, StashAway, PropertyGuru, Syfe, G42.
4. Re-probe the 9 transient-failure companies (Meesho, Xendit, Aspire, Innovaccer, PhonePe, Retool, Brex, Mercury, Postman).

**Phase B — Add top 10 high-confidence sources (one migration):**
- Greenhouse: Samsara, Glean, Okta, Adyen, Grafana Labs, Moloco, Careem.
- Lever: Binance, Veeva Systems.
- Ashby: Confluent.

**Phase C — Add full top-30 validated candidates** (after Phase B live data validates approach).

## Expected Benefits

- Phase A alone increases healthy sources from ~13 to ~18 (+38%).
- Phase B brings healthy sources to ~28 (+56% over Phase A), with targeted India/Singapore/UAE coverage.
- Phase C could reach 45–50 healthy sources (+250% over baseline).
- Bangalore-specific additions (Samsara, Glean, Moloco, Hevo Data, CommerceIQ) directly address the stated "Bangalore expansion" goal.
- Removing dead sources eliminates silent error noise in `scrape_runs` logs.

## Implementation Complexity

**Medium** — Phase A is DB-only (no code). Phase B requires a migration adding rows to the `companies` table and running `validate-sources` to confirm. Phase C requires validated live-probe results before committing.

## Dependencies

- `companies` table (DB insert/update/delete)
- `scripts/validate-sources.ts` (pre-flight validation after each phase)
- `docs/source-expansion-plan.md` (authoritative candidate list)
- GitHub Actions `validate-sources.yml` (for live HTTP validation in CI)

## Risks

- New companies may have rate-limiting or IP-blocking that causes their boards to fail in production even after successful manual validation.
- Adding many sources at once increases scrape run duration. Monitor `scrape_runs.duration_ms` after Phase B.
- Binance has 500+ open roles; without role-aware filtering (AD-15, already implemented), this could generate a disproportionate number of irrelevant ingests. Confirm role filter is active before enabling.

## Future Scope

- Automated source discovery: periodically search for new companies on Greenhouse/Lever/Ashby using industry/region filters.
- Wellfound integration: configure a valid `WELLFOUND_FEED_URL` for relevant India/Singapore roles once the feed URL is known.
- MyCareersFuture role expansion: the Singapore board has low volume but high relevance; explore additional role keywords.

## Success Metrics

- `validate-sources` reports ≥ 25 healthy companies after Phase B.
- `scrape_runs.inserted_count` increases by ≥ 30% week-over-week after Phase B deploy.
- Bangalore-tagged jobs in the dashboard increase by ≥ 50% within two weeks of Phase B.

## Priority

**P0**

## Notes

Phase A (repair/remove) is the highest-ROI task on this roadmap — it recovers value from already-configured sources with zero code changes. It should be the first thing executed after reading `docs/source-expansion-plan.md`. The full candidate list is in that document with confidence ratings and ATS tokens.

---

# 6. Dead/Broken Source Detection

## Problem

When an ATS board token becomes stale or a company migrates to an unsupported platform, the scraper silently returns zero jobs for that company and records `scrape_runs.status = 'success'` — because the HTTP call completes without throwing. There is no operator alert, no dashboard warning, and no automatic disabling until the company accumulates 7 consecutive failures (the `SOURCE_DISABLE_THRESHOLD`). During this window, data loss is invisible.

## Current State

- `validate-sources.ts` probes all ATS board tokens and exits with code 1 on new failures. It is run manually or triggered via GitHub Actions on demand.
- Source health tracking (`companies.health_status`, `consecutive_failures`, `last_failure_at`) is implemented and functioning.
- Auto-disable fires after `consecutive_failures >= SOURCE_DISABLE_THRESHOLD` (default 7).
- **No scheduled automatic validation** — `validate-sources.yml` must be manually triggered.
- **No Telegram alert** when a new source goes broken — the operator must check GitHub Actions CI output.
- **No pre-scrape gate** — dead companies are still attempted on every scrape run, wasting HTTP requests.
- `scrape_runs.found_count` records the post-role-filter count but not the pre-filter raw count, making it impossible to distinguish "no matching roles" from "board returned zero results" from "board unreachable".

## Recommendation

1. **Schedule `validate-sources.yml` weekly** — add a `schedule` trigger (e.g. Sunday 06:00 UTC) to catch newly broken boards automatically.
2. **Telegram alert on new failures** — extend `validate-sources.ts` to call the Telegram Bot API when `status = 'new_failure'` (the `active → broken` transition already detected, see `ProbeOutcome.previousHealthStatus`). Use the existing `TelegramBotSender` infrastructure.
3. **Pre-scrape gate** — run source validation at the start of `scrape.yml` and skip companies with `health_status = 'disabled'` (already done) and additionally skip companies with `health_status = 'unhealthy'` that have failed more than N consecutive probes, rather than waiting for the 7-failure auto-disable.
4. **Add `raw_count` to `scrape_runs`** — a count of jobs returned by the ATS before role filtering, enabling distinction between "no matching roles" and "board empty/broken".

## Expected Benefits

- Operators learn about broken sources within a week instead of waiting for manual inspection.
- Telegram alert on new failures gives real-time awareness without requiring CI access.
- Pre-scrape gate reduces wasted HTTP requests to known-broken boards.
- `raw_count` adds observability to the invisible role-filter drop-off (noted in `docs/source-expansion-plan.md` §1.3).

## Implementation Complexity

**Low** — scheduling is a GitHub Actions config change. Telegram alert extends existing infrastructure. Pre-scrape gate is a filter on `listActiveHealthy()`. `raw_count` is a forward-only migration + one field.

## Dependencies

- `scripts/validate-sources.ts` (alert logic)
- `features/notifications/infrastructure/TelegramBotSender.ts` (alert sending)
- `.github/workflows/validate-sources.yml` (schedule trigger)
- `scripts/scrape.ts` (pre-scrape gate)
- `supabase/migrations/` (`raw_count` column on `scrape_runs`)
- `src/features/sources/domain/sourceHealthConfig.ts` (optional: tighten pre-gate threshold)

## Risks

- Weekly validation adds a small number of HTTP requests to ATS endpoints — negligible but worth noting for rate-limit-sensitive boards.
- Tightening the pre-gate threshold (skipping companies sooner) could cause legitimate transient failures to silence a board temporarily. Keep the gate threshold at `consecutive_failures >= SOURCE_DISABLE_THRESHOLD` for now and tune after observing failure patterns.

## Future Scope

- Feed-based source validation: extend probing to RemoteOK, Wellfound, and MyCareersFuture endpoints (currently excluded, per `docs/operations/source-validation.md` §Architecture).
- Automatic board token repair: when a `redirected` probe is detected, extract the new slug from the redirect URL and propose a token update.
- Dead source dashboard panel on `/settings` — surface `health_status` per company visually.

## Success Metrics

- Operators receive a Telegram alert within 1 week of any board going broken.
- `validate-sources` runs automatically at least weekly without manual triggering.
- `raw_count` is populated in `scrape_runs` for ≥ 95% of scrape run rows within 2 weeks of deploy.

## Priority

**P0**

## Notes

The `MIN_HEALTHY_SOURCE_COUNT` enforcement (exits code 1 if healthy count drops below threshold) already exists but does not emit a Telegram alert — it only fails CI. For a personal tool without a NOC watching CI, this is insufficient for real-time awareness.

---

# 7. Worth Reviewing Investigation

## Problem

The Telegram digest includes a "Worth Reviewing" section listing jobs that scored above `NOTIFY_THRESHOLD` but below `STRONG_MATCH_THRESHOLD`. When the user taps the Worth Reviewing button, they receive the full list via the `/api/telegram/worth-reviewing` callback route. However, the route is stateless — it has no Supabase access — so the same list is resent on every tap, and there is no way to track which worth-reviewing jobs the user has already seen or acted on.

## Current State

- `bandMatches.ts` splits results into `strongMatches` (≥ 0.80) and `worthReviewing` (≥ 0.75, < 0.80).
- The digest message shows Top 5 strong matches with Apply buttons; worth-reviewing count is shown as a number only.
- `/api/telegram/worth-reviewing` is a stateless GET endpoint: validates `token`, decodes a base64url-encoded message, and POSTs to Telegram. No Supabase access.
- Jobs in `worthReviewing` are marked as notified via `markNotified()` immediately after the digest send — they are never redelivered in a future digest even if the user never reviewed them.
- There is no record of whether the user clicked the Worth Reviewing button or acted on any specific job in the list.

## Recommendation

1. **Add Supabase access to the worth-reviewing route** — inject a service-role Supabase client so the route can write to a new `telegram_interactions` table (or extend `notifications_log`) when the Worth Reviewing button is tapped.
2. **Track per-job worth-reviewing acknowledgment** — when the user taps Worth Reviewing, mark each individual job in the returned list as "worth-reviewing-seen" in the DB. This enables re-surfacing on the dashboard and prevents re-delivery.
3. **Surface "Worth Reviewing" as a dashboard status** — add a `Worth Reviewing` job status alongside the existing seeded statuses (New, Interested, Applied, Rejected, Archived). Jobs that were categorized as worth-reviewing by the digest can be pre-tagged.
4. **Click-through rate metric** — log whether the Worth Reviewing button was tapped (at the route level) to the analytics schema, enabling measurement of digest engagement.

## Expected Benefits

- Users can track which worth-reviewing jobs they've seen without visiting the dashboard.
- "Worth Reviewing" becomes an actionable status rather than an ephemeral notification.
- Click-through rate data enables informed iteration on the digest format and score thresholds.
- Prevents the awkward UX of seeing the same worth-reviewing list repeatedly on every button tap.

## Implementation Complexity

**Medium** — requires adding Supabase access to an existing route (currently stateless by design), a new `telegram_interactions` table or schema extension, and a dashboard status seeding change.

## Dependencies

- `src/app/api/telegram/worth-reviewing/route.ts` (add Supabase client)
- `supabase/migrations/` (new `telegram_interactions` table or extend `notifications_log`)
- `features/notifications/` domain and application layers (new interaction tracking use-case)
- Job status seeding (`supabase/seed.sql`) — add "Worth Reviewing" status

## Risks

- The worth-reviewing route currently runs on Vercel's edge/serverless environment. Adding a Supabase client works but requires the `SUPABASE_URL` and `SUPABASE_ANON_KEY` to be available as Vercel env vars (they should already be set).
- The route is called via a Telegram button tap, which means Telegram may retry the request on network failure. The Supabase write must be idempotent (upsert on `(job_id, event_type)` rather than insert).

## Future Scope

- "Smart re-ranking" — jobs the user has repeatedly ignored in worth-reviewing could be downranked in future digests.
- Push "Worth Reviewing" jobs to a curated view in the Next.js dashboard rather than only via Telegram.
- Per-job Apply links in the worth-reviewing message (currently only strong matches get Apply buttons in the digest keyboard).

## Success Metrics

- Worth Reviewing button click-through rate is measurable within 2 weeks of deploy.
- No duplicate delivery of the same worth-reviewing list within a 24-hour window.
- "Worth Reviewing" status appears on the dashboard for pre-tagged jobs within 1 day of digest delivery.

## Priority

**P1**

## Notes

The current worth-reviewing implementation is marked as "acceptable for MVP" in `docs/reviews/project-completion-audit.md` (§Technical Debt, item 3). This initiative formalizes the upgrade path from MVP to production-quality.

---

# 8. HR Email Detection and Prioritization

## Problem

Job postings on ATS platforms are posted by a mix of hiring managers, engineering team leads, and external HR/recruiting agencies. Postings from direct engineering teams tend to be more specific, better calibrated to the role, and more likely to result in meaningful interviews. Postings from HR generalists or recruiting agencies often have generic descriptions, inflated requirements, and lower conversion rates. Currently the platform treats all postings equally with no signal about the poster type.

## Current State

- Jobs are ingested with `company_name`, `title`, `description`, `location_raw`, `url` — no poster type, poster name, or contact email.
- The ATS scraper adapters (Greenhouse, Lever, Ashby) may expose recruiter contact info or department metadata in their API responses, but this is not extracted by the current `RawJob` normalization shape.
- No detection logic or dictionary for HR/recruiter signal phrases exists.
- The scoring pipeline (keyword + AI) does not incorporate poster type into the score.

## Recommendation

1. **Audit ATS API responses** for recruiter/department metadata — check whether Greenhouse, Lever, and Ashby boards expose fields like `hiring_manager`, `department`, `recruiter_email`, or `content_type`. Extract this in the adapter's `normalizeJob()` function into `RawJob`.
2. **Build a poster-type classifier** — a pure function `detectPosterType(description: string): 'direct_team' | 'hr_agency' | 'unknown'` based on a vocabulary dictionary of signals:
   - HR agency signals: "we are hiring on behalf of", "our client", "exciting opportunity", "competitive salary", "great culture fit", generic role descriptions.
   - Direct team signals: specific technology stack requirements, system design context, team-size mentions, technical challenge descriptions.
3. **Add `poster_type` nullable field to `jobs`** — populated at ingest time, indexed for filtering.
4. **Dashboard filter** — allow users to filter to "direct team" postings only or deprioritize "hr_agency" postings.
5. **Scoring weight** — optionally factor `poster_type` into the keyword score (e.g., multiply by 0.9 for `hr_agency` to penalize generic postings slightly).

## Expected Benefits

- Users spend less time on low-conversion HR agency postings.
- Direct team postings, which tend to have higher conversion rates, are surfaced preferentially.
- Poster type becomes a new dimension for analytics (which sources/companies post the most direct-team roles).

## Implementation Complexity

**Medium** — the classifier is a pure function (low risk), but ATS API auditing and `RawJob` schema extension touch the scraper adapters. Scoring weight changes need careful regression testing.

## Dependencies

- `src/features/sources/infrastructure/` (all three ATS adapter `normalizeJob()` functions)
- `src/features/sources/domain/types.ts` (`RawJob` extension)
- `supabase/migrations/` (`jobs.poster_type` column)
- `features/jobs/application/ingestJobs.ts` (populate at ingest)
- `features/scoring/application/scoreJob.ts` (optional: weight adjustment)
- Dashboard `FilterBar` (new filter)

## Risks

- ATS API fields for recruiter metadata may not be consistently available across all boards. The classifier must default to `unknown` gracefully.
- The vocabulary dictionary approach is heuristic and will have false positives/negatives. Early versions should be used for soft deprioritization, not hard filtering.
- Adding a new field to `RawJob` is a domain-level change that touches all adapters and their tests.

## Future Scope

- Email extraction from job descriptions to identify direct recruiter contacts for networking.
- Company-level poster-type tendencies: if 80% of a company's postings are `direct_team`, flag that company as a high-signal source.
- Integration with LinkedIn to verify whether a posting is from a direct employee vs third-party agency.

## Success Metrics

- `poster_type` is non-null for ≥ 70% of new jobs ingested within 30 days of deploy.
- User-reported "wasted time on irrelevant HR postings" decreases (qualitative feedback).
- `direct_team` postings have statistically higher `ai_score` on average than `hr_agency` postings (validates classifier quality).

## Priority

**P2**

## Notes

HR email detection is the most novel and exploratory initiative on this roadmap — it introduces a new data dimension that has no prior art in the codebase. Start with the ATS API audit and a small vocabulary dictionary before committing to the full implementation. The `poster_type` column can be added as a nullable field early (low-risk migration) while the detection logic is developed separately.

---

## Appendix: Initiative Dependency Graph

```
[2] Experience Matching
    └─ depends on: parseMinYears (existing)

[3] Token Cost Tracking
    └─ enables: [4] OpenRouter Cost Tracking

[4] OpenRouter Cost Tracking
    └─ depends on: [3] Token Cost Tracking (tokens_input/tokens_output columns)

[5] Worth Reviewing Investigation
    └─ depends on: existing Telegram digest MVP (complete)

[6] Dead/Broken Source Detection
    └─ enables: [5] Bangalore Source Expansion (better source health visibility)

[7] HR Email Detection
    └─ partially depends on: ATS adapter audit (overlaps with [5] source work)

[8] Scoring Logic Improvements
    └─ benefits from: [5] Bangalore Source Expansion (more data to score)
    └─ benefits from: [2] Experience Matching (better candidate set)
```

---

## Appendix: Document Update Checklist

Per `CLAUDE.md` document maintenance rules, implementing any initiative requires updating the corresponding design documents:

| Initiative | Documents to update |
|---|---|
| 1. Scoring Logic Improvements | `design/tech-stack.md` (new env var), `docs/scoring.md` (prompt changes), `design/erd.md` (if job_scores changes) |
| 2. Experience Matching Improvements | `docs/scoring.md`, `design/erd.md` (if backfill adds data), `docs/tasks/expired-job-detection.md` |
| 3. Token Cost Tracking | `design/tech-stack.md` (new env var), `docs/scoring.md` §5, `design/erd.md` (job_scores columns) |
| 4. OpenRouter Cost Tracking | `design/api-reference.md`, `design/tech-stack.md`, `docs/scoring.md` |
| 5. Bangalore Source Expansion | `design/scope.md`, `docs/source-expansion-plan.md`, `docs/source-quality-analysis.md` |
| 6. Dead/Broken Source Detection | `docs/operations/source-validation.md`, `design/tech-stack.md` (schedule config), `design/erd.md` (raw_count) |
| 7. Worth Reviewing Investigation | `docs/features/telegram-digest.md`, `design/erd.md` (new table), `design/api-reference.md` (route change) |
| 8. HR Email Detection | `design/erd.md` (poster_type column), `docs/scrapers.md` (RawJob extension), `design/use-cases.md`, `design/scope.md` |
