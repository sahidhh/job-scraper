# Final Report — Job Scraper Pipeline Stabilization & Optimization

**Session date:** 2026-07-03
**Branch:** `claude/job-scraper-stabilization-s8mzi5` (12 commits ahead of `main`)
**Scope:** All 4 phases of the mission brief (13 tasks) completed.

---

## 1. Overall Implementation Report

| Phase | Tasks | Status |
|---|---|---|
| 1 — Pipeline Reliability | 1-7: cross-source dedup, title/company normalization, notification verification, source health, pending-scoring monitoring, failed-source monitoring | ✅ Complete |
| 2 — Enrichment | 8-10: career page discovery, contact email extraction, salary extraction | ✅ Complete |
| 3 — AI Cost Optimization | 11-12: prompt simplification (implemented), structured outputs/retry optimization (already correct), caching (covered by Phase 1 dedup), batching/adaptive routing (investigated, designed, deferred pending approval) | ✅ Complete |
| 4 — Analytics | 13: pipeline/source/AI/job metrics wired into `/analytics` | ✅ Complete |

Every phase followed the same discipline: deterministic (no AI) unless explicitly required, reused
existing utilities where possible, added tests before considering a task done, updated `design/`
and `docs/` in the same commit as the code change (per this repo's CLAUDE.md rule), and deferred
anything that would require a genuine architecture change to an explicit, documented, ready-to-approve
design rather than building it unilaterally.

Full per-phase detail: `docs/reviews/2026-07-03/phase-{1,2,3,4}-report.md`. Full decision log:
`docs/decisions.md` AD-16 through AD-24 (9 new architecture decision records this session).

## 2. Architecture Summary

No new architectural layers were introduced — every addition fits the existing
domain/application/infrastructure/actions structure per feature module. Two intentional non-changes,
both documented as deferred rather than built:

- **AI scoring batching / adaptive (cheap-then-premium) model routing** (Phase 3) — would change
  `AiScoreProvider`'s per-job contract or add a third scoring tier. Designed in
  `docs/research/ai-cost-optimization-phase3.md`, not implemented — this is new architecture and
  CLAUDE.md requires approval before building it.
- **Domain-guessed career pages for aggregator-sourced companies, and raw-HTML-preserving scraper
  interface change for mailto:/structured-data extraction** (Phase 2) — both would require changing
  `JobSourceScraper.fetchJobs`'s per-adapter contract, the same category of deferred change AD-13
  already flagged before this session started.

One small, deliberate refactor: `normalizeCompanyName` moved from `features/jobs/application` to
`features/companies/domain` (its natural home) when Phase 2's career-page discovery needed to reuse
it — avoiding CLAUDE.md's "no duplicated logic" rule.

## 3. Files Changed

**100 files changed, +4077/-190 lines, across 12 commits.** Highlights by phase:

- **New pure domain/application functions (all with co-located tests):** `computeFingerprint`,
  `normalizeTitle`, `normalizeCompanyName` (moved), `classifyScrapeFailure`,
  `computeSourceHealthSummary`, `getSourceHealthReport`, `computeScoringQueueSummary`,
  `getScoringQueueReport`, `deriveAtsCareerPageUrl`, `discoverAtsCareerPages`,
  `extractContactEmail`, `extractSalary`, `truncateText`, `computeJobsByCompany`,
  `computeSalaryStats`, `computeRemoteStats`, `computePipelineStats`.
- **New/modified repositories:** `SupabaseJobRepository` (dedup + enrichment columns),
  `SupabaseNotificationRepository` (`markManyNotified`), `SupabaseScoreRepository` (RPC-based
  `insertScore`, `findAwaitingAi`), `SupabaseScrapeRunRepository` (`listRecentBySource`,
  `failure_category`), `SupabaseCareerPageRepository` (new), `SupabaseMatchedJobsRepository`
  (3 new analytics queries).
- **New scripts:** `scripts/backfill-fingerprints.ts`, `scripts/discover-career-pages.ts`.
- **UI:** `analytics/page.tsx` restructured with 3 new sections; `AnalyticsCharts.tsx` gained 6 new
  components; new `ScrapeRunHealthTable.tsx`.
- **Docs:** every `design/*.md` file touched at least once; `docs/decisions.md` +9 ADRs;
  `docs/repositories.md`, `docs/scoring.md` updated; 2 new `docs/research/*.md` and
  `docs/reviews/2026-07-03/*.md` documents.

## 4. Database Changes

No destructive changes. All migrations are additive (new columns/tables, all nullable or
defaulted), reversible by dropping the column/table, and none altered existing column
semantics.

## 5. Migration Summary

| # | File | Change |
|---|---|---|
| 1 | `20260703000001_job_fingerprint_dedup.sql` | `jobs.fingerprint`, `jobs.canonical_company_name`; new `job_duplicates` table; `scrape_runs.duplicate_count` |
| 2 | `20260703000002_scrape_run_failure_category.sql` | `scrape_runs.failure_category` |
| 3 | `20260703000003_job_scores_retry_tracking.sql` | `job_scores.retry_count`; new `upsert_job_score` RPC |
| 4 | `20260703000004_company_career_pages.sql` | New `company_career_pages` table |
| 5 | `20260703000005_job_contact_email.sql` | `jobs.contact_email`, `contact_email_category`, `contact_email_confidence` |
| 6 | `20260703000006_job_salary.sql` | `jobs.salary_currency`, `salary_min`, `salary_max`, `salary_period`, `salary_confidence` |

**Required post-deploy step:** run `npm run backfill:fingerprints` once after migration 1 deploys,
to populate `fingerprint`/`canonical_company_name` for jobs ingested before it (they default to
`''`, which is safe — never falsely matched, just not yet deduped against until backfilled).
Contact-email/salary columns need no backfill — they're computed only going forward at ingest.

**None of these migrations have been run against a live database this session** — there is no
Supabase instance configured in this sandbox. They are unit-tested via mocked repository clients
only. Run them (`supabase db push` or equivalent) and the backfill script as the first step of the
next real deploy, then spot-check a `scrape.ts`/`score.ts` run.

## 6. Performance Improvements

- **Notification batching:** digest sends went from N `notifications_log` writes to 1 per digest
  (Phase 1 Task 4) — fewer round trips, and closes a partial-failure window.
- **Scoring retry tracking:** `upsert_job_score` RPC keeps the same round-trip count as before
  (was already a single upsert call) while adding atomic retry-count tracking — no added latency.
- **Analytics page:** more DB round trips per load (see Phase 4 report), all unbounded/no-`.limit()`
  and consistent with the existing in-memory-aggregation approach — not a new performance class of
  concern, but something to watch as the dataset grows (`design/limitations.md` §7.1, pre-existing).
- **Dedup check:** one indexed `IN` query per scrape batch, negligible at this project's scale.

## 7. AI Cost Improvements

- **Prompt truncation (Phase 3, implemented):** resume text and job descriptions capped at
  4000/2000 characters respectively before being sent to the paid OpenRouter call
  (`OPENROUTER_MAX_RESUME_PROMPT_CHARS`/`OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS`, both
  env-overridable). Direct, unconditional token reduction on every stage-2 AI call for any
  resume/posting exceeding the caps — exact percentage not measurable without a live account and
  real usage data.
- **Structured outputs and retry optimization were already correctly implemented** before this
  session (verified, not changed): JSON-schema-constrained responses, and only genuinely transient
  failures (timeout/5xx/429) get an immediate retry.
- **Caching is effectively covered by Phase 1's fingerprint dedup:** a job rediscovered under a
  different source never gets its own `job_scores` row or AI call at all, which is the primary
  "duplicate prompt" elimination Task 12 asked about.
- **Batching and adaptive (cheap-then-premium) model routing are designed but not implemented** —
  see `docs/research/ai-cost-optimization-phase3.md` for concrete, ready-to-build designs pending
  approval (both are new-architecture changes per CLAUDE.md).

## 8. Production Readiness Assessment

| Area | Status |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ Clean after every commit |
| Unit tests | ✅ 567/567 passing (up from 483 at session start) |
| Production build (`next build`) | ✅ Succeeds after every commit |
| Service-role boundary gate | ✅ Passes |
| Live DB / migration execution | ⚠️ **Not verified this session** — no Supabase instance available in this sandbox |
| Live browser verification (`/analytics` UI) | ⚠️ **Not verified this session** — no Supabase credentials configured, so the dev server can't authenticate a session |
| Backward compatibility | ✅ All changes additive; existing call sites updated in the same commit as any interface change |
| Documentation | ✅ `design/*.md`, `docs/decisions.md`, `docs/repositories.md`, `docs/scoring.md` all updated in step with the code |

**Overall: code-ready, not deploy-verified.** Everything that can be checked without a live
Supabase project and a live OpenRouter account has been checked and is green. The two starred items
above are the concrete, honest gap — recommend as the first action on the next session with real
credentials: (1) run the 6 migrations + `npm run backfill:fingerprints` against a real (ideally
staging) database, (2) run `scrape.ts`/`score.ts`/`notify.ts` once each and confirm no runtime
errors, (3) load `/analytics` in a browser and confirm every new section renders (including the
"no active role/resume" empty state for the scoring-queue section).

## 9. Remaining Backlog

From `design/limitations.md`'s "Known Technical Debt" table (new items added this session) and the
phase reports:

- Domain-guessed career pages for aggregator-sourced companies (wellfound/remoteok/mycareersfuture) — deferred, AD-20.
- mailto:/structured-HTML extraction for contact emails — deferred, AD-21 (needs a scraper interface change).
- AI-scoring batching and adaptive model routing — designed, deferred pending approval, AD-23.
- Two independent, unreconciled source-health signals (`companies.health_status` vs.
  `scrape_runs`-derived) — both now visible on `/analytics`, not merged, AD-18/AD-24.
- Pre-existing debt untouched this session: June DB migrations for source repairs not yet applied
  (P0, oldest item in the backlog), 7 broken sources without a repair/disable plan, in-memory
  analytics aggregation performance at scale, manual Wellfound feed URL setup.

## 10. Recommended Future Roadmap

1. **Immediate (next session):** live-verify everything flagged "not verified this session" above —
   this is table stakes before considering this work actually shipped, not just code-complete.
2. **Short-term:** apply the pending June source-repair migrations (pre-existing P0 debt, unrelated
   to this session but the oldest open item) and confirm the resulting `companies.health_status`
   improvement shows up correctly in the new `/analytics` source-health sections.
3. **Medium-term:** if AI cost remains a concern after Phase 3's prompt-truncation change, revisit
   the batching/adaptive-routing designs in `docs/research/ai-cost-optimization-phase3.md` with real
   token-usage data from production to validate the threshold/batch-size choices before building.
4. **Medium-term:** decide on the aggregator-company career-page-discovery approach (domain-guessing
   with live validation, vs. a paid search API, vs. leaving it as manual-only) — a product decision,
   not a technical one, best made with real usage data on how often users click through career pages.
5. **Long-term:** if `/analytics`'s in-memory aggregation becomes measurably slow (design/limitations.md
   §7.1), consider materialized views or scheduled aggregation jobs rather than computing every chart
   on every page load — but only once real data volume justifies it (avoid premature optimization).

## 11. Compact Project Context for Future Sessions

See `docs/reviews/2026-07-03/phase-{1,2,3}-context.md` for the accumulated compact context (new
utilities, schema changes, interface changes, architecture notes, assumptions) carried forward from
each phase. Phase 4 added no new interfaces beyond what's in its own report (§4.2-4.3 above are
sufficient context for that phase). Key standing facts for any future session on this codebase:

- **No live Supabase/OpenRouter credentials in this sandbox** — all verification this session was
  static (typecheck/build) or mocked-client unit tests. Say so explicitly; don't claim live
  verification that didn't happen.
- **Companies table = ATS board-token registry only** (greenhouse/lever/ashby), not a general
  company directory — don't confuse with `jobs.company_name`/`canonical_company_name`.
- **`JobSourceScraper.fetchJobs` swallows per-company errors internally** (`console.warn` + continue)
  for greenhouse/lever/ashby — this is why source-health-from-scrape_runs mostly sees signal from
  the feed-based sources' whole-adapter throws, plus the `empty_feed` case for all sources. Changing
  this swallow-and-continue behavior is an architect-level interface change (AD-13/18), not a small fix.
- **Every new DB column with a fixed value set uses plain `text`, not a Postgres enum** — established
  convention this session (`failure_category`, `contact_email_category`, `salary_period`, etc.) so
  future value additions don't need an enum-alter migration; the fixed set lives in TypeScript.
- **Testing convention:** co-located `*.test.ts`, `makeX(overrides)` factory, one `describe` per
  unit, `queuedSupabaseClient`/`mockSupabaseClient` for repository tests. No ESLint in this repo —
  quality gates are `tsc --noEmit`, `vitest run`, `next build`, `check:service-role-boundary`.

---

**Session totals:** 12 commits, 100 files changed, 6 migrations, 9 new architecture decision
records, 84 new tests (483 → 567), all 13 mission tasks across 4 phases complete.
