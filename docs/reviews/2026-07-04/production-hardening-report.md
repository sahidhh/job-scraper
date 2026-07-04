# Production Hardening Review — Job Scraper Pipeline

**Review date:** 2026-07-04
**Branch:** `claude/job-scraper-stabilization-s8mzi5` (9 commits ahead of the 2026-07-03 mission completion)
**Scope:** Audit of all Phase 1-4 work from the 2026-07-03 mission (`docs/reviews/2026-07-03/`), treating the repository as feature-complete. No new product features added; every change below is a correctness, security, performance, or cleanup fix.

**Verification after every fix:** `npx tsc --noEmit`, `npm run test` (590 tests, all passing), `npm run build`, `npm run check:service-role-boundary` — all green as of the last commit (`7a95d87`).

---

## 1. Critical Issues

All fixed.

1. **`digest_sessions` had no Row Level Security at all.** Created in `20260621000001_digest_sessions.sql` without `enable row level security`, unlike every other application table. Any holder of the public anon key could read or write session rows (job IDs, Telegram message IDs) directly via PostgREST, with no login required. **Fixed:** `20260704000002_digest_sessions_rls.sql` adds the standard `authenticated_full_access` policy.

2. **The Telegram webhook was unreachable in production.** `middleware.ts`'s auth-redirect matcher covered `/api/*`. Telegram's callback POST carries no Supabase session cookie, so it was redirected to `/login` before the route's own `TELEGRAM_CALLBACK_SECRET` check ever ran — the "Worth Reviewing" inline-keyboard pagination feature could not have worked at all. **Fixed:** excluded `/api` from the middleware matcher.

3. **Cross-source duplicate detection never reactivated an expired canonical job.** `findCanonicalByFingerprint` matched fingerprints regardless of `is_active`, but the touch-update on a match only refreshed `last_seen_at`. A job that expired under its original source but was still listed under another source stayed permanently hidden (`is_active=false`) from the dashboard and scoring pipeline. **Fixed:** the touch-update now also sets `is_active: true, inactive_reason: null`.

## 2. High-Priority Improvements

All fixed.

4. **HTML injection in the Telegram webhook's "Apply" link.** The scraped, untrusted job URL was interpolated raw into `<a href="...">` with no escaping — a `"` in the URL could break out of the attribute and inject arbitrary Telegram-supported HTML. **Fixed:** reused the shared `escapeHtml()` (extended to also escape quotes, which Telegram's HTML parse mode explicitly supports via `&quot;`) instead of a duplicate, quote-unsafe local copy.
5. **Career-page discovery could crash the discovery script.** Two companies sharing a canonical name (e.g. the same company on two ATS boards) produced two `NewCareerPage` rows targeting the same upsert conflict key — Postgres rejects a multi-row upsert that hits one conflict key twice. **Fixed:** de-duplicate by `canonicalCompanyName` before returning.
6. **AI token/cost accounting silently undercounted real spend.** Tokens billed by OpenRouter were discarded whenever the call "succeeded but was unusable" — a shape-mismatched payload, missing content, or invalid JSON. A JSON-parse failure also misclassified as `unknown` instead of `malformed_response`. **Fixed:** usage is now attached to `OpenRouterError` and counted in both failure paths; JSON-parse failures get their own catch block.
7. **A network/AI-call timeout's "retry" was guaranteed to fail instantly.** `callOpenRouterJson` created one `AbortController` and passed the same signal to both the initial attempt and its retry inside `fetchWithRetry`; once aborted, the retry rejected immediately instead of getting a real second attempt, wasting the retry delay. **Fixed:** added a `timeoutMs` option to `fetchWithRetry` that gives every attempt its own fresh controller/timeout.
8. **`extractContactEmail` miscategorized names and vendor addresses.** The bare `"hr"` keyword matched anywhere in the local part (`chris@`, `shreya@` both contain "hr" as a substring) and `"sourcing"` matched inside the unrelated word `"outsourcing"`. **Fixed:** keywords of length ≤ 2 now require an exact token match; `"sourcing"` was removed as redundant with `"talent"`. Also fixed: a plus-addressed automated mailbox (`noreply+jobs@ats.com`) slipped past the exclusion filter.

## 3. Medium-Priority Improvements

Fixed:

9. **`extractSalary` silently dropped the max value and period on a repeated-currency-symbol range** (e.g. `"$50,000 - $70,000 per year"` used to parse as a single figure with no period). Fixed for the symbol case (Pattern A); the equivalent repeated-currency-*code* case (Pattern B, e.g. `"INR 800000 - INR 1200000 per annum"`) was found to be structurally unfixable without disproportionate added complexity and is documented as a known limitation (`design/limitations.md` §1.10) rather than patched with a no-op.
10. **No CI enforcement of tests or type-checking.** `ci.yml` only ran the service-role-boundary check on push/PR; 570+ vitest tests and `tsc` had no automated gate. **Fixed:** added a `test` job running `npm run typecheck` + `npm run test`.
11. **`scrape.yml` had no concurrency guard.** A manual dispatch overlapping a scheduled run (or two scheduled runs, if one overran its slot) could each independently pass the fingerprint-dedup check-then-write for the same logical job before either committed. **Fixed:** added a `concurrency: { group: scrape-pipeline, cancel-in-progress: false }` block.
12. **Non-constant-time webhook secret comparison.** `header !== secret` is a timing side-channel, low-risk for a single-user bot but cheap to close. **Fixed:** swapped for `crypto.timingSafeEqual`.

Not fixed (documented, not bugs):

13. **`sendDigest` re-sends the whole batch on partial failure**, including chunks already delivered, rather than resuming from the failed chunk. This is an explicit, already-documented tradeoff (comment in the source, now also in `design/limitations.md` §4.1) — fixing it would require per-chunk delivery tracking, a real architecture change out of scope for a hardening pass.
14. **`sendNotification`'s per-job at-least-once window** (send succeeds, the following `markNotified` write fails, job re-sent next run) was already documented in `design/limitations.md` §4.1 before this review; confirmed accurate, no code change needed.
15. **Stale digest session on webhook button click** (`route.ts`'s `sessionRepo.getLatest()` always fetches the newest session regardless of which digest message the button belongs to) — a minor UX edge case if a new digest is sent between an old digest being paginated, not a security issue. Left as a report-only observation; fixing it would need session-to-message binding, an architecture-touching change.

## 4. Low-Priority Cleanup

All done:

- Removed dead `CareerPageRepository.list()` (interface, Supabase implementation, and its test) — never called from any application code.
- Consolidated `maxResumePromptChars()`/`maxDescriptionPromptChars()` in `OpenRouterAiScoreProvider` into one `maxPromptChars(envVar, default)` helper (previously identical apart from the env var name and default).
- Reverted an ineffective Pattern-B "fix" attempt in `extractSalary` that added complexity with no behavioral benefit, and corrected the comment that incorrectly implied it worked.
- Corrected stale "backend-only, no dashboard UI yet" claims in `design/architecture.md` (source health, scoring queue) and `design/scope.md` — Phase 4 wired both into `/analytics`.
- Added the `backfill:fingerprints`, `discover:career-pages`, and `setup:webhook` npm scripts (existed in `package.json`, missing from `design/tech-stack.md`'s table), plus the new `typecheck` script.
- Documented three newly-surfaced limitations in `design/limitations.md` (extractSalary Pattern B, extractContactEmail ASCII-only regex, sendDigest whole-batch resend).

## 5. Performance Observations

- Added three indexes not covered by the original `20260612000003_indexes.sql` (`supabase/migrations/20260704000001_hardening_indexes.sql`):
  - `jobs (is_active) WHERE is_active = true` — filtered first by `findUnscored`, `countMatchingExpandedRoles`, `countJobStats`, and `markExpiredJobs`.
  - `job_scores (role_selection_id, resume_version, scored_at) WHERE ai_score IS NULL` — `findAwaitingAi`'s exact filter+sort shape.
  - `scrape_runs (source, run_at DESC)` — `listRecentBySource`, called once per source per `/analytics` load.
- `SupabaseJobRepository.upsertMany` previously computed each job's fingerprint 2-3 times per batch (candidate filter, duplicate lookup, upsert row); now computed once and threaded through.
- Analytics aggregation remains in-memory (documented limitation §7.1, unchanged) — fine at current data volumes, worth revisiting only if job counts grow an order of magnitude.

## 6. Security Observations

- **Fixed this pass:** `digest_sessions` RLS gap (Critical #1), unreachable/misrouted Telegram webhook (Critical #2), HTML-attribute injection via unescaped job URL (High #4), non-constant-time secret comparison (Medium #12).
- **Verified clean, no changes needed:** all seven server actions (`jobs`, `companies`, `resume`, `auth`, `notifications`, `settings`, `roles`) go through the cookie-based, RLS-enforced server client with domain-layer input validation; no raw SQL string interpolation anywhere; `SUPABASE_SERVICE_ROLE_KEY` usage is confined to `scripts/` (enforced by CI); no hardcoded secrets found; `OPENROUTER_API_KEY`/resume/job-description text is never logged, only model/status/reason/job-id in warnings.
- **`design/security.md` drift corrected:** added the `digest_sessions`/`company_career_pages` RLS rows to the policy table, and replaced the false "no webhooks received from external services" claim with an accurate description of the Telegram webhook's own secret-based auth.
- **Residual, accepted risk (not actionable without new architecture):** prompt injection via untrusted job descriptions into the AI scoring prompt is theoretically possible but bounded — the AI's output (a score float + short reasoning string) is stored as data and HTML-escaped everywhere it's later rendered (Telegram messages, presumably the dashboard); worst case is a single job inflating its own match score, not a system-wide compromise.

## 7. Maintainability Observations

- The Telegram webhook route's pure helpers (`isValidSecret`, `formatPage`, `buildButtons`) were extracted into a new `helpers.ts` module (Next.js `route.ts` files reject arbitrary named exports) and given their first test coverage — previously the entire webhook route had zero tests.
- Three computed-but-never-rendered fields (`ScoringQueueSummary.oldestPendingScoredAt`/`avgRetryCount`, `SourceHealthSummary.recoveryDetected`) are cheap, correctly tested, and documented as intentional Phase-1 deliverables — flagged here as a UI completeness gap, not dead code; left as-is rather than either deleting the fields or wiring them into a UI component neither of which was asked for.
- A previously-considered refactor (extracting a shared "group-and-count" helper for `computeJobsByCompany`/`getScoredJobsBySource`/`computeSalaryStats`) was evaluated and rejected — the three functions' grouping keys and aggregated values differ enough that a shared helper would add a parameter-heavy abstraction for three ~15-line functions, the kind of premature abstraction the project's Caveman principles explicitly discourage.

## 8. Production Readiness Checklist

| Item | Status |
|---|---|
| All tests passing | ✅ 590/590 |
| Typecheck clean | ✅ |
| Production build succeeds | ✅ |
| Service-role boundary CI gate | ✅ (now also test/typecheck gate) |
| RLS enabled on every application table | ✅ (digest_sessions gap closed) |
| Inbound webhook reachable and authenticated | ✅ (middleware fix + timing-safe secret check) |
| No known HTML/SQL injection vectors | ✅ (webhook URL escaping fixed; no raw SQL anywhere) |
| Cron overlap protection | ✅ (concurrency guard added) |
| Indexes match actual query shapes | ✅ (3 gaps closed) |
| AI cost tracking accuracy | ✅ (undercounting fixed) |
| Known limitations documented | ✅ (`design/limitations.md` current) |
| Docs (`design/`) in sync with code | ✅ (architecture.md, scope.md, security.md, tech-stack.md, erd.md, limitations.md all updated this pass) |
| Outstanding non-critical items | `sendDigest` whole-batch resend on partial failure, stale-session-on-button-click edge case — both documented, neither is a data-loss or security risk |

## 9. Final Recommendation

**Ready for production.**

Every Critical and High-priority issue found during this review has been fixed, tested, and verified against the full suite, typecheck, and production build. The remaining open items (#13-15 in section 3) are deliberate, documented tradeoffs or minor UX edge cases with no security or data-integrity impact — appropriate to track as known limitations rather than block a release on.
