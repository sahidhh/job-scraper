# Production Verification Framework

v1.4 mission: a reusable, deterministic health-check framework that validates the project before
deployment and reports operational status on demand. Refined in a v1.x operational-excellence pass
(severity consistency, structured diagnostics, one new coverage gap closed). It does not add product
features — it integrates with the operational tooling that already existed (`doctor.ts`,
`validate-sources.ts`, `report-sources.ts`, `source-analytics.ts`, `getSourceHealthReport`,
`getScoringQueueReport`) rather than replacing any of it. See `docs/decisions.md` AD-27 and AD-28 for
the design rationale of both passes.

**Not to be confused with `npm run diagnose`** (`report-sources.ts` + `filter-analysis.ts`, source-quality
funnel reporting) — that's an older, unrelated tool. `npm run diagnostics` is this framework's
console-only mode. The names are similar; the tools are not.

---

## 1. Architecture

```
src/features/verification/
  domain/types.ts              Check, CheckResult, CheckOutcome, CheckStatus, CheckSeverity, CheckCategory
  application/
    runChecks.ts                Generic runner: executes Check[] sequentially, times each, never aborts on a throw;
                                 resolves each outcome's effective severity (severityOverride ?? check.severity)
    computeHealthScore.ts       Pure aggregation: CheckResult[] -> { score, verdict, recommendations (deduped) }
    formatConsoleReport.ts      \
    formatMarkdownReport.ts      > Pure formatters, no I/O
    formatJsonReport.ts         /
  infrastructure/
    checks/
      skipOutcomes.ts           Shared "can't run, root cause reported elsewhere" outcomes (see §1.2)
      infrastructure/           6 checks — env vars, Supabase connectivity, migrations, RLS, storage, workflow config
      application/              8 checks — source health, stale sources, scoring queue, duplicate pipeline,
                                 notification pipeline, dashboard reachability, extraction services, active singletons
      external/                 4 checks — OpenRouter, Telegram, Telegram webhook registration, source fallback config
      dataQuality/               8 checks — duplicate fingerprints, missing fields, invalid salary/emails,
                                 broken career URLs, inconsistent scores, stale jobs, queue integrity

scripts/verify-production.ts   Composition root: builds the Supabase client, wires repositories into
                                checks, runs them, prints/writes the report, sets the exit code
```

26 checks total (was 25 at v1.4 launch; `external.telegram-webhook` was added in the operational-
excellence pass, §4 below).

The domain/application layers know nothing project-specific — every check is defined in
`infrastructure/checks/` and wired up only by the composition-root script, mirroring the existing
`JobSourceScraper`/`SourceValidator` pattern (design/architecture.md §1).

### 1.1 Extension point — adding a new check

1. Write a file under `infrastructure/checks/<category>/` implementing the `Check` interface (copy any
   existing check in that category — they're deliberately uniform in shape).
2. If it depends on a `TypedSupabaseClient`, return `SKIPPED_NO_SUPABASE_CLIENT` (from `skipOutcomes.ts`)
   when the client is null — don't write a bespoke skip message, and don't conditionally omit the check
   from `buildChecks()` (every check must always appear in the report; see §1.2).
3. Populate `probableCause`/`suggestedFix`/`affectedSubsystem`/`docReference` on every non-pass branch —
   see §1.3 for the rubric. A bare `{ status: "fail", summary: "..." }` with no diagnostics is not
   acceptable for a new check.
4. Add it to `buildChecks()` in `scripts/verify-production.ts`. Nothing in `domain`/`application` needs
   to change — that's the whole point of the generic core.
5. If it's genuinely a new, non-overlapping signal, add a row to the check catalog in §3 below.

### 1.2 Severity rubric

| Severity | Meaning |
|---|---|
| `critical` | Broken deploy or security exposure; blocks a `ready` verdict outright |
| `high` | Broken core functionality, usually self-healing/retried automatically once the cause is fixed |
| `medium` | Real degraded operation that needs attention soon |
| `low` | Minor/cosmetic data-quality nit, **or** a symptom whose root cause is already reported at higher severity by another check |

`CheckOutcome.severityOverride` lets a specific outcome (not the whole check) use a different severity
than the check's default — e.g. `infra.env-vars` is `critical` because a missing *required* var is
critical, but its "relying on an optional default" warning branch overrides to `low`, since that's an
expected, benign state, not a defect.

**The single most important consequence of this rubric:** when Supabase credentials are absent,
~15 different checks would otherwise each independently report "can't query" at their own (often
high/critical) severity — over-penalizing one root cause a dozen times. Every client-dependent check
returns the shared `SKIPPED_NO_SUPABASE_CLIENT` outcome (`low` severity) instead, so the health score
reflects "one critical problem, many downstream skips," not "sixteen critical problems." The same
pattern applies to `skippedMissingCredential()` for OpenRouter/Telegram.

### 1.3 Structured diagnostics

Every non-pass `CheckOutcome` should populate, where meaningful:

| Field | Purpose |
|---|---|
| `probableCause` | Why this likely happened (not just what happened) |
| `suggestedFix` | The concrete next action — a command to run, a var to set, a file to check |
| `affectedSubsystem` | The *product* subsystem in plain terms (e.g. "Scoring pipeline") — deliberately distinct from `category`, which is the framework's own taxonomy and doesn't say what broke |
| `docReference` | A doc/decision anchor for more context, when one canonical reference exists |

`computeHealthScore`'s aggregate `recommendations` list deduplicates identical `suggestedFix` text —
several checks legitimately share one root cause and one fix, and repeating it verbatim isn't useful.

Each check returns `{ status: "pass" | "warning" | "fail", summary, details?, probableCause?,
suggestedFix?, affectedSubsystem?, docReference?, severityOverride? }`. `computeHealthScore` aggregates
results into a 0–100 informational score and a rule-based verdict:

| Verdict | Meaning |
|---|---|
| `ready` | Every check passed |
| `needs_attention` | At least one warning or non-critical failure |
| `not_ready` | At least one **critical**-severity (resolved) failure — blocks regardless of the numeric score |

---

## 2. Running it

```bash
npm run verify:production   # full run: console output + verification-reports/latest.{md,json}
npm run diagnostics          # console-only, no files written — quick ad-hoc check
```

Both run the same 26 checks; `--format=console` (used by `diagnostics`) just skips the file-write
step. `verification-reports/` is gitignored — it's transient output, not a committed report.

Exit code is `1` only when the verdict is `not_ready` (a resolved-critical failure) — a
`needs_attention` result exits `0` so CI isn't blocked by, e.g., an optional env var or a stale-source
warning.

Also callable from GitHub Actions: `.github/workflows/verify-production.yml` (`workflow_dispatch`
only, no schedule — Phase 9 of the original mission asked for CI-readiness, not new deployment
automation). It uploads `verification-reports/` as a build artifact.

`npm run verify` (the pre-existing `typecheck && test && build` quality gate) is unchanged — this is
an additive command, not a repurposing of an existing one. `npm run doctor` also still exists
unchanged; it shares its env/connectivity primitives and status vocabulary
(`"pass" | "warning" | "fail"`, unified in the operational-excellence pass) with this framework via
`src/shared/infrastructure/envCheck.ts`/`connectivityCheck.ts`, instead of duplicating them.

---

## 3. Check catalog

### Infrastructure (6)

| Check | What it verifies | Severity |
|---|---|---|
| Environment variables | All required cron+web env vars set; optional vars flagged (low severity) if relying on defaults | critical |
| Supabase connectivity | One lightweight query against `app_settings` succeeds | critical |
| Database migrations | Representative columns from the 4 most recent migrations are selectable | high |
| RLS enforcement | An unauthenticated (anon-key, no session) client cannot read `jobs` | critical |
| Storage bucket | `resumes` bucket exists and is private | medium |
| Scheduler / CI workflow config | `scrape.yml` references its required secrets (real fail if not — high); reports whether the cron schedule is active (low-severity warning either way, since this is a product decision, not a defect — see `TECHNICAL_DEBT.md` #1) | high |

### Application (8)

| Check | What it verifies | Severity |
|---|---|---|
| Source scrape health | Wraps `getSourceHealthReport()` — fails if any source is at/above the auto-disable threshold | high |
| Stale sources | Wraps the same report — warns if any source hasn't run within the staleness window | medium |
| Pending scoring queue | Wraps `getScoringQueueReport()` — warns on stuck (age-based) AI-retry jobs | medium |
| Duplicate detection pipeline | Active jobs missing a `fingerprint` (pre-dedup / not yet backfilled) | low |
| Notification pipeline | `notifications_log` reachable; reports 24h/7d send counts (no stuck-job inference — preferences can legitimately suppress a match). The only check touching this table, so a fail here is non-redundant | medium |
| Dashboard & analytics reachability | `jobs`/`job_scores`/`scrape_runs`/`role_selections`/`resumes` all queryable | high |
| Deterministic extraction services | `extractSalary`/`extractContactEmail`/`extractJobAttributes` produce the expected output for a fixed sample (pure, no I/O — a regression smoke-test) | medium |
| Active resume/role invariants | Exactly one (or zero, `low`-severity warning) active resume and role_selection — more than one (`high`-severity fail) would violate the unique partial index | high |

### External services (4)

| Check | What it verifies | Severity |
|---|---|---|
| OpenRouter connectivity | `GET /api/v1/models` (no completion tokens spent), 8s timeout | high |
| Telegram connectivity | `getMe` call, 5s timeout (shared with `doctor.ts`) | high |
| Telegram webhook registration | Only meaningful when `NOTIFY_MODE=digest` (clean pass otherwise): confirms `TELEGRAM_CALLBACK_SECRET`/`APP_URL` are set and the registered Telegram webhook URL matches `${APP_URL}/api/telegram/webhook` — closes a coverage gap the webhook route/`setup:webhook` script previously had zero verification for | medium |
| Source fallback configuration | Local-only: `WELLFOUND_FEED_URL`/`WELLFOUND_DISABLED`/`REMOTEOK_DISABLED` aren't contradictory | low |

ATS board probing (`validate-sources.ts`) and live career-page-URL fetches are deliberately **not**
included in the default run — both are unbounded numbers of outbound requests, which conflicts with
the "lightweight, no unnecessary requests" constraint. Run `npm run validate-sources` separately for
board-level probing.

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

## 4. Considered but not implemented (Phase 4 coverage review)

Reviewed and deliberately **not** turned into checks — documented here per the mission's "otherwise
document it" instruction, rather than building low-value checks:

- **Resume upload / PDF parsing** — no dedicated check. A failure here is immediately visible to the
  one user in the `/resume` UI on the next upload attempt; a background check couldn't exercise the
  actual file-upload path anyway without a synthetic PDF and Storage write, which is more machinery
  than the failure mode justifies for a single-user tool.
- **Role expansion cache (`role_expansion_map`) reachability** — not worth a dedicated check; a failure
  here would almost always correlate with the broader `Dashboard & analytics reachability` check
  already failing (same database), so a separate check would be redundant, not additive signal.
- **`discoverAtsCareerPages` / career-page discovery process** — the one-off `discover-career-pages.ts`
  script isn't part of the live cron pipeline; `data-quality.career-urls` already validates its output
  data. Verifying the discovery *process* itself would need to actually run it, which is out of scope
  for a lightweight read-only check.
- **`digest_sessions` activity/health** — considered alongside the new Telegram webhook check, but a
  standalone digest-activity check risks false positives on a fresh install or in `individual`/
  `digest_legacy` mode where no digest sessions are expected at all. The webhook-registration check
  (§3, External services) covers the actual failure mode (pagination breaks) more directly and with a
  much lower false-positive rate.
- **Backfill scripts (`backfill:fingerprints`, `backfill:min-years`)** — one-off, manually-run,
  idempotent scripts, not continuously-relevant pipeline state. Their *effect* is already covered
  (`app.duplicate-detection-pipeline` reports unbackfilled fingerprints).

## 5. Final operational assessment

Verified in this session (no live Supabase/OpenRouter/Telegram credentials in this sandbox, consistent
with every prior hardening pass on this project):

- `npx tsc --noEmit` — clean
- `npx vitest run` — full suite passing, including new tests for `runChecks`' severity-override
  resolution and `computeHealthScore`'s recommendation deduplication
- `npm run build` — succeeds
- `npm run check:service-role-boundary` — passes
- `npx tsx scripts/verify-production.ts` (both `--format=console` and `--format=all`) — runs end-to-end
  without credentials; every DB/network-dependent check degrades to a low-severity `warning`
  ("Skipped — ...") instead of throwing or compounding severity; the health score is now representative
  (44/100 in a no-credentials run, not floored at 0 by double-counting) with a deduplicated
  recommendations list; exit code `1` on the resulting `NOT READY` verdict; `verification-reports/
  latest.{md,json}` written correctly

**Not verified** (requires a live Supabase project + real OpenRouter/Telegram credentials, which this
sandboxed session does not have access to):

- Whether `Supabase connectivity`, `Database migrations`, `RLS enforcement`, `Storage bucket`, and every
  data-quality check produce a correct **pass** against a real, populated database (only their
  no-credentials/"skipped" path was exercised here)
- Whether the RLS check's anon-client probe behaves as expected against the actual deployed RLS
  policies (design/security.md §2) rather than the local emulation of "no client"
- Live OpenRouter/Telegram reachability, and the new Telegram webhook registration check against a
  real bot + registered webhook
- The GitHub Actions workflow (`verify-production.yml`) has not been run in Actions — only its YAML
  structure was reviewed

## 6. Deployment checklist

| Check | Fully automated | Still needs |
|---|---|---|
| Environment variables | ✅ | — |
| Supabase connectivity | ✅ (once credentials exist) | Live Supabase project |
| Database migrations | ✅ (once credentials exist) | Live Supabase project with migrations applied |
| RLS enforcement | ✅ (once anon key exists) | Live Supabase project; a human should still spot-check `design/security.md` §2's policy table matches reality |
| Storage bucket | ✅ (once credentials exist) | Live Supabase project with the `resumes` bucket created |
| Scheduler / CI workflow config | ✅ (local file check) | A human decision on whether the live cron schedule is intentional (`TECHNICAL_DEBT.md` #1) |
| Source scrape health / stale sources | ✅ (once credentials exist) | Live Supabase project with `scrape_runs` history |
| Pending scoring queue | ✅ (once credentials exist + active resume/role) | Live Supabase project, an active resume, an active role selection |
| Duplicate detection pipeline | ✅ | Live Supabase project |
| Notification pipeline | ✅ | Live Supabase project |
| Dashboard & analytics reachability | ✅ | Live Supabase project |
| Deterministic extraction services | ✅ (pure, no dependencies) | — |
| Active resume/role invariants | ✅ | Live Supabase project |
| OpenRouter connectivity | ✅ | Valid `OPENROUTER_API_KEY` |
| Telegram connectivity | ✅ | Valid `TELEGRAM_BOT_TOKEN` |
| Telegram webhook registration | ✅ (auto-passes when NOTIFY_MODE≠digest) | Valid `TELEGRAM_BOT_TOKEN` + `APP_URL` + `TELEGRAM_CALLBACK_SECRET`, and `npm run setup:webhook` already run, if using digest mode |
| Source fallback configuration | ✅ (local env check) | — |
| All 8 data-quality checks | ✅ | Live Supabase project with real data to evaluate |

Every check is automation-ready; the only remaining work before a real deployment is provisioning the
live credentials themselves and, once provisioned, running `npm run verify:production` once against
them to confirm the pass path (not just the graceful-skip path exercised in this sandbox).
