# Roadmap

Consolidated from `design/scope.md`'s phase table, `docs/roadmap/job-platform-improvement-roadmap.md` (2026-06-22 draft — largely superseded, see banner added to that file this session), `design/limitations.md` §8's technical debt table, and every session's own "remaining work" section (`docs/reviews/*/`). Where an item overlaps across sources, it appears once here with the most current status.

## Completed

Phases P0 through P1.11 (`design/scope.md` §5) — resume/role/scraping/scoring/notifications/dashboard/status workflow, source health (probe + scrape-run-derived), skill-gap insights, experience soft filter, analytics charts, cross-source dedup, company/title normalization, career-page discovery (ATS-board only), contact-email extraction, salary extraction, AI prompt truncation, job-attribute extraction (employment type/seniority/work arrangement/visa/relocation/clearance/urgency), notification exclude filters + settings UI (now also enforced on the dashboard job list, not just Telegram — see below), Telegram highlight badges (including in the Worth Reviewing pagination, not just individual/primary-digest messages), composite dashboard ranking score (P1.9), the v1.4 production verification framework (P1.10 — `npm run verify:production`/`diagnostics`, 26 checks, health score, Ready/Needs Attention/Not Ready verdict; see `docs/operations/production-verification.md`), dev-experience scripts (`doctor`/`verify`/`health`/`diagnose`/`analytics`).

From the 2026-06-22 improvement roadmap, now also done (verified against the actual schema/code this session, not just the doc's claims):
- **Token Cost Tracking** — `job_scores.tokens_input/tokens_output/estimated_cost_usd`, surfaced via `TokenStatsCards` on `/analytics`.
- **Bangalore Job Source Expansion, Phases A+B** — `20260620000001-3` (repairs/removals/additions) and `20260622000001` (Bangalore Phase 1B) migrations.
- **Dead/Broken Source Detection, partially** — `validate-sources.yml` now runs on a weekly schedule (was manual-only); new-failure detection logic (`previousHealthStatus`) exists. **Not done:** Telegram alert on new failures, `raw_count` column (see Backlog).
- **HR Email Detection, via a different approach than originally specced** — shipped as contact-email categorization (`extractContactEmail`: recruiter/hr/hiring_manager/company_contact), not the originally-proposed `poster_type` classifier. Addresses the same underlying problem (surface who's likely behind a posting) with a more conservative, deterministic method.
- **Worth Reviewing, via a different approach than originally specced** — shipped as `digest_sessions` (stateful, DB-backed pagination) + Telegram webhook callback handling, not the originally-proposed stateless-route-plus-`telegram_interactions`-table design. Functionally addresses the "same list resent on every tap" problem the original doc flagged.
- **`preferredCompanies` positive-match ranking, via a different approach than originally specced** — shipped in P1.9 (`design/scope.md` §"P1.9 — Ranking & Search") as a dashboard composite ranking score: `RankingPreferences.preferredCompanies` (`/settings` → Ranking) adds a configurable bonus to `overall_score` for a case-insensitive company-name substring match (`computeOverallScore.ts`), driving the dashboard's default sort. This is a ranking signal, not a notification highlight — see the Deferred row below for the distinct, still-unbuilt Telegram-badge use case. `preferredTechnologies` was not part of this pass and remains unbuilt.

## Deferred

Explicitly designed/considered and deliberately not implemented, with the original rationale preserved:

| Item | Why deferred | Source |
|---|---|---|
| `scrape_runs.status = 'partial'` (currently only success/failed) | Requires a `JobSourceScraper.fetchJobs` interface change across all adapters to report per-company success/failure — an architect-level change, out of scope for incremental passes | AD-13 |
| Career-page domain-guessing for aggregator-sourced companies (wellfound/remoteok/mycareersfuture) | No reliable way to guess+verify a company's domain from name alone without a search API or live network validation; a wrong guess stored as fact would be worse than no data | AD-20 |
| AI scoring batching (multiple jobs per OpenRouter call) | Loses per-job failure isolation; needs a validated batch-size choice this project has no usage data for yet | AD-23 |
| Adaptive/tiered AI model routing (cheap model first, premium fallback) | Needs a validated quality/cost threshold that can't be chosen responsibly without live data | AD-23 |
| `preferredCompanies`/`preferredTechnologies` "matches your stack" Telegram digest highlight badge | The dashboard *ranking* use of `preferredCompanies` shipped in P1.9 (see Completed, above) — this row is only the distinct, still-unbuilt notification-side highlight: a badge on the digest message itself, analogous to the existing remote/urgent/salary highlight badges, needing its own preference plumbing into `formatDigestMvp.ts` | v1.2 report; `design/limitations.md` §4.4 |
| Dashboard badges for job attributes (employment type/seniority/etc.) | v1.2 stored the data and used it for notifications only; surfacing on `/dashboard` needs `JobWithScore`/`FilterBar` changes not yet scoped | v1.2 report |

## Backlog

Real, scoped, not yet done — ordered roughly by effort:

1. **Telegram alert when a source newly fails validation** (`validate-sources.ts` already detects the `active→broken` transition via `previousHealthStatus`; wiring `TelegramBotSender` to it is the remaining gap). Low effort.
2. **`checkServiceRoleBoundary.ts` and a few other one-off scripts' minor consistency polish** — see `TECHNICAL_DEBT.md`.
3. **`scrape_runs.raw_count`** (pre-role-filter job count) to distinguish "no matching roles" from "board empty/broken" — forward-only migration + one field in `scrape.ts`.
4. **Experience regex coverage expansion** (`parseMinYears`) — current coverage is a known gap (`design/limitations.md` §8); a backfill script now exists (`backfill:min-years`, wired in v1.2) so improving the regex and re-running the backfill is low-risk.
5. **Skills dictionary alias expansion** — informed by `/insights`' skill-demand view; addresses real keyword-gate miss cases (e.g. "Golang" vs "Go").
6. **Per-model AI cost comparison** on `/analytics` (aggregate cost/token stats already ship; grouping by `job_scores.model` does not yet).
7. **AI prompt enrichment** — include the active role selection and desired-experience preference as structured prompt fields, not just resume text (may improve score accuracy; needs regression validation against a held-out sample before deploying, per the original roadmap doc's own risk note).

## Future Ideas

Interesting, not scoped, no immediate plan:

- Score confidence bands beyond the existing strong/worth-reviewing split (e.g. a third "weak match" band) surfaced explicitly on the dashboard.
- A "recently posted" freshness badge in Telegram highlights (deliberately skipped in v1.2 — most notified jobs are already recent given the ~6h scrape cadence, so the signal is low-value; see `docs/decisions.md` AD-25's sibling reasoning).
- Company-level poster-type/seniority-norm learning (e.g. "this company calls 3-years-experience roles 'Senior'") — would need historical data, not a day-one heuristic.
- Automated source discovery (periodically search Greenhouse/Lever/Ashby for new boards matching industry/region filters) instead of manual `companies` table curation.

## v2 Candidates

Larger, structural changes — high-value but deliberately not undertaken without a dedicated planning pass, since each is a genuine architecture decision, not an incremental extension:

1. **Materialized/aggregated analytics** — replace in-memory computation over raw query results (`design/limitations.md` §7.1) with materialized views or scheduled aggregation, once job volume is large enough that page-load computation becomes slow. Do not build this speculatively; there is no evidence of a performance problem yet.
2. **Embedding-based semantic scoring as a *replacement* for keyword-dictionary overlap, or as an ML-driven ranking re-ranker** — still not scoped; AD-07's stage-1-gate rejection and AD-26's "not ML re-ranker" ranking promise both still stand for those specific shapes. A narrower shape — a local, zero-cost, informational `embedding_score` computed at stage 2 alongside `ai_score`, not touching the keyword gate or `overall_score`'s ranking blend — was implemented in merge-workspace Phase 2 (`decisions.md` AD-31); this backlog item is about the two larger, still-deferred moves this doesn't cover: replacing stage 1, or letting embeddings drive ranking.
3. **Multi-role support** — searching multiple target roles simultaneously instead of one active `role_selection`. Explicitly out of scope for v1 (`design/scope.md` §4) since it touches the single-active-selection invariant (AD-09) at its core.
4. **Seniority-aware experience filtering** as a first-class dimension (not just raw years) — natural next step now that `jobs.seniority` exists (v1.2) but is not yet wired into the dashboard's experience filter.

## Pending product decisions (spec'd this session, not built)

Three items were investigated and specced but deliberately not implemented — each needs a human product/data/schema decision first, and B3/B4 need a migration (out of scope for a presentation/logic-only session). Written here as spec + finding (file:line) + the required decision + recommended approach.

### PD-1 — Freshness / seen / expire lifecycle (needs a migration)

**Requirements:** dashboard shows only jobs posted < N days ago; a per-job seen/opened toggle; auto-archive a job if unopened for > 1 week; an explicit lifecycle status (`new` / `seen` / `archived` / `expired`); every threshold (N days, unopened window) configurable in Settings.

**Current state (finding):** jobs already carry `posted_at`, `first_seen_at`, `last_seen_at`, `is_active`, `inactive_reason` (`SupabaseJobRepository.ts:47` select list), and there is already a **user-defined status** system — `job_state.status_id` → `job_statuses(label,color)` joined in the same select (`:47`) and surfaced via `JobStatusSelect`/`listStatuses`. That existing status system is user-authored triage labels, NOT an automatic lifecycle — nothing auto-archives or expires today, and freshness is only a *sort* tiebreaker (`posted_at desc`, `:520`), never a filter that hides stale jobs.

**Schema sketch (needs a forward-only migration — out of scope here):**
- Add a machine-owned lifecycle enum distinct from the user's `job_statuses` (don't overload the user's triage labels): e.g. `jobs.lifecycle` `text`/enum in {`new`,`seen`,`archived`,`expired`} (default `new`), plus `seen_at timestamptz null` and `expires_at timestamptz null`.
- `seen_at` set on first dashboard open (per-job toggle can also clear it back to `new`).
- `expires_at` computed from `posted_at` + configurable N days; a cron/RPC flips `new`/`seen`→`expired` past it and `new`→`archived` when `now - first_seen_at > unopened_window` and `seen_at IS NULL`.
- Thresholds (N days, unopened window) → a settings row, same pattern as `RankingPreferences`/notification preferences.

**REQUIRED decision (blocking):** many sources leave `posted_at` null or vague (aggregators especially). Define the rule for null-`posted_at` jobs: are they **shown** (treat null as "always fresh", risks stale clutter) or **hidden** (treat null as "too old to trust", risks dropping real new jobs from feeds that just don't publish a date)? **Recommendation:** show null-date jobs but rank them below dated ones and drive their `expires_at` off `first_seen_at` instead of `posted_at`, so they still age out on our own clock rather than being hidden outright or living forever. Confirm before building.

### PD-2 — Blend `embedding_score` into ranking + build an eval set (relates to AD-31, v2 Candidate #2)

**Finding (confirmed from code):** `embedding_score` is computed at stage 2 (`scoreJob.ts:65`) and **persisted** via the insert RPC (`SupabaseScoreRepository.ts:28`, `p_embedding_score`), but it is **not blended into `overall_score`** — `computeOverallScore.ts:34-57` only ever reads `aiScore` plus the company/remote/salary bonuses and never references `embeddingScore`; the dashboard's default sort is on `overall_score` (`SupabaseJobRepository.ts:519`). So the signal is collected and shown informationally but does not influence ranking, exactly as AD-31 scoped it.

**Plan (do NOT change the formula without measuring first):**
1. Add a tunable weight `w` and blend, e.g. `overall = clamp(aiScore*(1-w) + embeddingScore*w) + bonuses`, `w` defaulting to 0 (behavior-preserving) and configurable in Settings.
2. Tighten the AI scoring prompt in parallel (separate lever from the blend).
3. Before/after **measurement**: hand-label a ~30-job eval set (job × active-resume → "good match?" ground truth) and compare ranking quality (e.g. precision@k / ordering vs. labels) for the current formula vs. candidate weights. Only ship a non-zero `w` if it measurably beats aiScore-only.

**REQUIRED decision (blocking):** does blending embeddings into ranking violate AD-26's "not an ML re-ranker" promise, or is a small bounded weight acceptable? And who produces the 30-job labels? **Recommendation:** treat a small bounded `w` as a tunable heuristic (not a full ML re-ranker) so it stays within AD-26's spirit, but get explicit sign-off since v2 Candidate #2 currently lists embedding-driven ranking as deferred. Build the eval set first — the weight is meaningless without it.

### PD-3 — Application CTA is wrong for ATS jobs (mailto-only, no apply-URL primary action)

**Finding:** the draft dialog's only send affordance is `mailto:` (`ApplicationDraftDialog.tsx:224-227` "Open in mail client", href from `buildMailtoLink`). For the majority of jobs there is no contact email (ATS postings), so `buildMailtoLink(null, …)` correctly emits `mailto:?subject=…` (fixed this session) — but that opens a blank-recipient mail client, which is the wrong action for an apply-URL job. Jobs already carry an apply `url` (`SupabaseJobRepository.ts:47`).

**Spec:** make the primary CTA context-aware —
- Primary **"Open application"** → the job's apply `url` when present (the common ATS case).
- **"Copy draft"** (clipboard) so the reviewed draft can be pasted into the ATS form.
- Show **mailto** ("Open in mail client") **only** when a contact email actually exists; hide it otherwise instead of emitting a blank-recipient link.

**REQUIRED decision (blocking):** when a job has BOTH an apply URL and a contact email, which is primary — the ATS apply flow or the email draft? **Recommendation:** apply URL primary (ATS is the canonical channel), email as a secondary action, mailto hidden entirely when no email exists. Scope only — no build this session; note this supersedes the "leave To-address empty" stopgap from the A1 mailto fix.

## Never Build

Explicitly out of scope, would add complexity without value for this project's stated single-user, personal-tool nature (`design/scope.md` §4, CLAUDE.md):

- Multi-user/multi-tenancy (no `user_id` columns anywhere by design, AD-01).
- Automated job applications (scope is discovery/triage, not application).
- An ORM (Prisma/Drizzle), a client-state library (Zustand/Redux), or a data-fetching library (React Query) — all explicitly banned in CLAUDE.md and never needed at this project's scale.
- A generic "misc extractors" module for job-signal parsing — every prior addition (salary, contact email, job attributes) has been its own small, testable pure function; a shared grab-bag file would be a regression in the pattern that's worked well four times running.
