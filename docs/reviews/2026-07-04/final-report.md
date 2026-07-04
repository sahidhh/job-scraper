# Continuous Improvement Session — Final Report

**Date:** 2026-07-04
**Branch:** `claude/job-scraper-improvements-025ps0`
**Mission:** Search all five focus areas (Job Quality & Ranking, Notifications, Job Metadata, Search &
Personal Filtering, Source Quality & Operations) for the highest-value, lowest-complexity improvements and
implement only those that produce measurable value. Treat v1.0–v1.2 + Production Hardening as complete;
this is about making the project *better*, not *bigger*.

Per-theme detail: `theme-1-ranking-quality.md`, `theme-2-notifications.md`, `theme-3-job-metadata.md`,
`theme-4-search-filtering.md`, `theme-5-source-operations.md` (this directory).

---

## 1. What Was Implemented

| Theme | Change | Value delivered |
|---|---|---|
| 1 — Ranking | Deterministic composite `overall_score` (aiScore + preferred-company/remote/salary-disclosed bonuses), configurable via `/settings` → Ranking, explanation shown next to each job's score, drives dashboard default sort | User experience, data quality |
| 2 — Notifications | Settings UI for the previously-backend-only `NotificationPreferences`; company mute + keyword mute (shared with dashboard filtering) | User experience, reduces maintenance (feature already existed, was unusable) |
| 4 — Search & Filtering | Dashboard text search (title/company); company mute enforced on the dashboard job list | User experience |
| 5 — Source Operations | Stale-source detection (`isStale`/`hoursSinceLastRun`), distinct from "actively failing," surfaced on `/analytics` | Operational visibility, reliability |
| 3 — Job Metadata | **No code changes** — investigated and documented why every candidate field was skipped this pass | N/A (see theme-3 report) |

Every implemented change satisfies at least one success criterion from the mission brief (user
experience, reliability, data quality, operational visibility, or reduced maintenance); none touch AI cost
or developer experience directly this pass.

## 2. User Experience Improvements

- Notification preferences are now actually configurable from the UI (were previously dead code from a
  user's perspective — the backend existed, nothing called it).
- Dashboard search lets the user find a specific job/company without scrolling a paginated table.
- Muting a company (once) hides it from both Telegram alerts and the dashboard — one action, two effects.
- Ranking now visibly explains itself ("+ preferred company, remote") instead of a bare percentage.

## 3. Reliability Improvements

- Stale-source detection closes a real blind spot: a source silently dropped from the scrape run
  previously looked identical to "healthy, hasn't needed to run" — now it's flagged distinctly and with
  priority in the `/analytics` health table.
- The `overall_score` migration backfills every pre-existing row (`= ai_score`) so the new sort key never
  silently demotes jobs scored before this feature shipped.

## 4. Performance Improvements

None targeted this pass — no performance bottleneck was identified in scope for these five themes that
met the value/complexity bar (the existing in-memory analytics aggregation and unbounded queries remain
documented, accepted tradeoffs at current data volumes per `design/limitations.md` §7.1, unchanged by this
session).

## 5. AI Efficiency Improvements

None this pass. Theme 1's ranking score is entirely deterministic and computed from data already
available at scoring time — it adds zero AI calls, zero tokens, and zero latency to the existing
pipeline. No AI-cost-related gap was found in the five themes investigated (Phase 3's AI cost work is
already complete per `docs/research/ai-cost-optimization-phase3.md`; the remaining designed-but-undone
items there — batching, adaptive model routing — are new-architecture changes requiring explicit approval,
consistent with why they weren't picked up as a "lowest complexity" item here).

## 6. Operations Improvements

- Stale-source detection (Theme 5), covered above.
- Notification and ranking preferences both follow the exact same `app_settings` JSON-blob storage
  pattern already established for `notification_preferences`/`desired_experience_years` — no new
  infrastructure, no new migration pattern to maintain.

## 7. Documentation Updates

Updated in this session: `design/architecture.md` (scoring/notification pipeline diagrams and prose),
`design/erd.md` (`job_scores` columns, indexes, `upsert_job_score` signature), `design/scope.md` (P1.5/P1.9
feature entries + Theme 3 skip note), `design/use-cases.md` (UC-02, UC-06b new, UC-12, UC-13), `design/
api-reference.md` (new/extended server actions), `design/user-guide.md` (Dashboard, Ranking Preferences,
Notification Preferences, Analytics sections), `design/limitations.md` (§3.8 new), `design/tech-stack.md`
(`SOURCE_STALE_HOURS`), `docs/decisions.md` (AD-26). Five theme reports + this final report added under
`docs/reviews/2026-07-04/`.

## 8. Updated Backlog

Every remaining idea surfaced during investigation, ranked:

### Must Build
*(none — nothing investigated this session rose to "clearly must happen next," which is itself a signal the codebase is in good shape after the prior stabilization/hardening passes)*

### Should Build
- **Benefits/equity/bonus keyword tags paired with a consuming ranking bonus or filter** (Theme 3) — the
  one metadata field worth building, but only alongside the feature that reads it, not speculatively ahead
  of it.
- **Multi-select location/source filters + a sort-order picker** (Theme 4) — natural next step if
  single-select proves limiting in real usage; deferred for lack of a concrete reported pain point this
  session.

### Nice to Have
- **Per-source salary/contact-email coverage %** (Theme 5) — real observability value, but no decision or
  alert currently hangs off it; worth adding once/if data quality becomes a stated concern.
- **Notification delivery statistics beyond the existing recent-sends log** (Theme 2) — low volume for a
  personal tool makes this low-urgency.
- **Certifications/travel/shift/languages extraction** (Theme 3) — only once a specific filtering/
  notification need names one of them.

### Not Worth Building
- **Saved filters** (Theme 4) — the dashboard's URL-param-driven filters already serve this via browser
  bookmarks; a dedicated feature would duplicate free functionality.
- **Favourites/bookmarks** (Theme 4) — duplicates the existing "Interested" status.
- **Company whitelist** (Theme 4) — the `companies` table configuration already is the whitelist for
  board-token sources.
- **"Hide viewed" jobs** (Theme 4) — no "viewed" concept exists or is needed; the status workflow already
  covers "I've handled this."
- **Unified source "quality score"** (Theme 5) — would face the same signal-reconciliation problem already
  deliberately left unmerged (`docs/decisions.md` AD-24); a guessed weighting formula is worse than two
  clearly-labeled signals.
- **Snooze/reminder support** (Theme 2) — duplicates the status workflow; would need new scheduling
  architecture for marginal benefit over "set status to Interested and revisit."
- **Company size / industry / startup / public-private detection** (Theme 3) — not reliably derivable from
  job-posting text alone; would require an external company-data source out of this project's stated scope.
- **ML/embeddings-based re-ranking** (Theme 1) — explicitly excluded by this session's constraints.

## Quality Gates (this session, cumulative)

`npx tsc --noEmit` clean · `npx vitest run` — 626+ tests passing across all touched suites (all new tests
listed in the per-theme reports) · `npm run build` succeeds · `npm run check:service-role-boundary` passes.
No live Supabase project was available in this sandboxed environment, so the one new migration
(`20260704000004_ranking_overall_score.sql`) was reviewed carefully (mirroring the exact
`CREATE OR REPLACE FUNCTION`-with-appended-defaulted-parameters pattern that's safe in Postgres) but not
replayed against a real database — flagged as the one remaining manual-verification step, consistent with
how prior hardening passes have handled the same environment constraint.
