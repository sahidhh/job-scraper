# Production Verification Framework

v1.4 mission: a reusable, deterministic health-check framework that validates the project before
deployment and reports operational status on demand. It does not add product features — it
integrates with the operational tooling that already existed (`doctor.ts`, `validate-sources.ts`,
`report-sources.ts`, `source-analytics.ts`, `getSourceHealthReport`, `getScoringQueueReport`) rather
than replacing any of it. See `docs/decisions.md` AD-27 for the design rationale.

---

## 1. Architecture

```
src/features/verification/
  domain/types.ts              Check, CheckResult, CheckOutcome, CheckStatus, CheckSeverity, CheckCategory
  application/
    runChecks.ts                Generic runner: executes Check[] sequentially, times each, never aborts on a throw
    computeHealthScore.ts       Pure aggregation: CheckResult[] -> { score, verdict, recommendations }
    formatConsoleReport.ts      \
    formatMarkdownReport.ts      > Pure formatters, no I/O
    formatJsonReport.ts         /
  infrastructure/checks/
    infrastructure/             6 checks — env vars, Supabase connectivity, migrations, RLS, storage, workflow config
    application/                7 checks — source health, stale sources, scoring queue, duplicate pipeline,
                                 notification pipeline, dashboard reachability, extraction services, active singletons
    external/                   3 checks — OpenRouter, Telegram, source fallback config
    dataQuality/                8 checks — duplicate fingerprints, missing fields, invalid salary/emails,
                                 broken career URLs, inconsistent scores, stale jobs, queue integrity

scripts/verify-production.ts   Composition root: builds the Supabase client, wires repositories into
                                checks, runs them, prints/writes the report, sets the exit code
```

The domain/application layers know nothing project-specific — every check is defined in
`infrastructure/checks/` and wired up only by the composition-root script, mirroring the existing
`JobSourceScraper`/`SourceValidator` pattern (design/architecture.md §1). A future check plugs in by
implementing `Check` and adding it to `buildChecks()` in `scripts/verify-production.ts` — nothing in
`domain`/`application` needs to change.

Each check returns `{ status: "pass" | "warning" | "fail", summary, details?, recommendation? }`.
`computeHealthScore` aggregates results into a 0–100 informational score and a rule-based verdict:

| Verdict | Meaning |
|---|---|
| `ready` | Every check passed |
| `needs_attention` | At least one warning or non-critical failure |
| `not_ready` | At least one **critical**-severity failure (blocks regardless of the numeric score) |

---

## 2. Running it

```bash
npm run verify:production   # full run: console output + verification-reports/latest.{md,json}
npm run diagnostics          # console-only, no files written — quick ad-hoc check
```

Both run the same 24 checks; `--format=console` (used by `diagnostics`) just skips the file-write
step. `verification-reports/` is gitignored — it's transient output, not a committed report.

Exit code is `1` only when the verdict is `not_ready` (a critical failure) — a `needs_attention`
result exits `0` so CI isn't blocked by, e.g., an optional env var or a stale-source warning.

Also callable from GitHub Actions: `.github/workflows/verify-production.yml` (`workflow_dispatch`
only, no schedule — Phase 9 asked for CI-readiness, not new deployment automation). It uploads
`verification-reports/` as a build artifact.

`npm run verify` (the pre-existing `typecheck && test && build` quality gate) is unchanged — this is
an additive command, not a repurposing of an existing one. `npm run doctor` also still exists
unchanged; it now shares its env/connectivity primitives with this framework
(`src/shared/infrastructure/envCheck.ts`, `connectivityCheck.ts`) instead of duplicating them.

---

## 3. Check catalog

### Infrastructure (6)

| Check | What it verifies | Severity |
|---|---|---|
| Environment variables | All required cron+web env vars set; optional vars flagged if relying on defaults | critical |
| Supabase connectivity | One lightweight query against `app_settings` succeeds | critical |
| Database migrations | Representative columns from the 4 most recent migrations are selectable | high |
| RLS enforcement | An unauthenticated (anon-key, no session) client cannot read `jobs` | critical |
| Storage bucket | `resumes` bucket exists and is private | medium |
| Scheduler / CI workflow config | `scrape.yml` references its required secrets; reports whether the cron schedule is active | medium |

### Application (7)

| Check | What it verifies | Severity |
|---|---|---|
| Source scrape health | Wraps `getSourceHealthReport()` — fails if any source is at/above the auto-disable threshold | high |
| Stale sources | Wraps the same report — warns if any source hasn't run within the staleness window | medium |
| Pending scoring queue | Wraps `getScoringQueueReport()` — warns on stuck (age-based) AI-retry jobs | medium |
| Duplicate detection pipeline | Active jobs missing a `fingerprint` (pre-dedup / not yet backfilled) | low |
| Notification pipeline | `notifications_log` reachable; reports 24h/7d send counts (no stuck-job inference — preferences can legitimately suppress a match) | low |
| Dashboard & analytics reachability | `jobs`/`job_scores`/`scrape_runs`/`role_selections`/`resumes` all queryable | high |
| Deterministic extraction services | `extractSalary`/`extractContactEmail`/`extractJobAttributes` produce the expected output for a fixed sample (pure, no I/O — a regression smoke-test) | medium |
| Active resume/role invariants | Exactly one (or zero) active resume and role_selection — more than one would violate the unique partial index | high |

### External services (3)

| Check | What it verifies | Severity |
|---|---|---|
| OpenRouter connectivity | `GET /api/v1/models` (no completion tokens spent), 8s timeout | high |
| Telegram connectivity | `getMe` call, 5s timeout (shared with `doctor.ts`) | high |
| Source fallback configuration | Local-only: `WELLFOUND_FEED_URL`/`WELLFOUND_DISABLED`/`REMOTEOK_DISABLED` aren't contradictory | low |

ATS board probing (`validate-sources.ts`) and live career-page-URL fetches are deliberately **not**
included in the default run — both are unbounded numbers of outbound requests, which conflicts with
Phase 4's "lightweight, no unnecessary requests" constraint. Run `npm run validate-sources` separately
for board-level probing.

### Data quality (8)

| Check | What it verifies | Severity |
|---|---|---|
| Duplicate fingerprints | Active jobs sharing a fingerprint that should have routed to `job_duplicates` | medium |
| Missing required fields | Active jobs with an empty `title`/`url`/`company_name`/`source_job_id` | high |
| Invalid salary data | `salary_min > salary_max` or negative values | low |
| Invalid contact emails | Stored `contact_email` not matching a basic email shape | low |
| Broken career page URLs | `company_career_pages.career_page_url` not a well-formed `http(s)://` URL (format only, not reachability) | low |
| Inconsistent AI/overall scores | `ai_score` outside `[0,1]`, or `overall_score` null while `ai_score` is set (violates the erd.md invariant) | medium |
| Stale jobs not yet expired | Active jobs last seen well past `JOB_EXPIRATION_DAYS` — the expiration sweep may be stuck | low |
| Scoring queue integrity | `job_scores` rows with `retry_count >= 20` and still no `ai_score` — permanently failing, not just slow | low |

---

## 4. Final operational assessment

Verified in this session (no live Supabase/OpenRouter/Telegram credentials in this sandbox, consistent
with every prior hardening pass on this project):

- `npx tsc --noEmit` — clean
- `npx vitest run` — 688/688 tests passing, including 13 new tests for the framework's pure logic
  (`runChecks`, `computeHealthScore`, the extraction-services smoke-test)
- `npm run build` — succeeds
- `npm run check:service-role-boundary` — passes
- `npx tsx scripts/verify-production.ts` (both `--format=console` and `--format=all`) — runs end-to-end
  without credentials, every DB/network-dependent check degrades to a `warning` ("Skipped — ...")
  instead of throwing, exit code `1` on the resulting `NOT READY` verdict, and `verification-reports/
  latest.{md,json}` are written correctly

**Not verified** (requires a live Supabase project + real OpenRouter/Telegram credentials, which this
sandboxed session does not have access to):

- Whether `Supabase connectivity`, `Database migrations`, `RLS enforcement`, `Storage bucket`, and every
  data-quality check produce a correct **pass** against a real, populated database (only their
  no-credentials/"skipped" path was exercised here)
- Whether the RLS check's anon-client probe behaves as expected against the actual deployed RLS
  policies (design/security.md §2) rather than the local emulation of "no client"
- Live OpenRouter/Telegram reachability (the code paths were reviewed but not exercised against real
  endpoints with valid keys)
- The GitHub Actions workflow (`verify-production.yml`) has not been run in Actions — only its YAML
  structure was reviewed

## 5. Deployment checklist

| Check | Fully automated | Still needs |
|---|---|---|
| Environment variables | ✅ | — |
| Supabase connectivity | ✅ (once credentials exist) | Live Supabase project |
| Database migrations | ✅ (once credentials exist) | Live Supabase project with migrations applied |
| RLS enforcement | ✅ (once anon key exists) | Live Supabase project; a human should still spot-check `design/security.md` §2's policy table matches reality |
| Storage bucket | ✅ (once credentials exist) | Live Supabase project with the `resumes` bucket created |
| Scheduler / CI workflow config | ✅ (local file check) | A human decision on whether to enable the cron schedule (docs/agent-workflow.md go-live gate) |
| Source scrape health / stale sources | ✅ (once credentials exist) | Live Supabase project with `scrape_runs` history |
| Pending scoring queue | ✅ (once credentials exist + active resume/role) | Live Supabase project, an active resume, an active role selection |
| Duplicate detection pipeline | ✅ | Live Supabase project |
| Notification pipeline | ✅ | Live Supabase project |
| Dashboard & analytics reachability | ✅ | Live Supabase project |
| Deterministic extraction services | ✅ (pure, no dependencies) | — |
| Active resume/role invariants | ✅ | Live Supabase project |
| OpenRouter connectivity | ✅ | Valid `OPENROUTER_API_KEY` |
| Telegram connectivity | ✅ | Valid `TELEGRAM_BOT_TOKEN` |
| Source fallback configuration | ✅ (local env check) | — |
| All 8 data-quality checks | ✅ | Live Supabase project with real data to evaluate |

Every check is automation-ready; the only remaining work before a real deployment is provisioning the
live credentials themselves and, once provisioned, running `npm run verify:production` once against
them to confirm the pass path (not just the graceful-skip path exercised in this sandbox).
