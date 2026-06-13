# Agent Profiles

This document defines the standard set of agents that operate on this repository, derived from `CLAUDE.md`, `docs/architecture.md`, `docs/decisions.md`, and the current `reports/*-audit.md` backlog.

Every agent operates within the constraints of `CLAUDE.md` (layering rules, forbidden dependencies, "no architecture without approval", "always update docs when architecture changes"). Nothing below overrides `CLAUDE.md` — it specializes it per role.

## Skill Reference

The five skill categories referenced in this document map to concrete tools as follows. Agents must not substitute a different tool for the same purpose without updating this table.

| Skill | Maps to | Used for |
|---|---|---|
| **caveman** | `caveman:caveman` skill | Compressing inter-agent scratch notes, status updates, and handoff messages during a working session. **Never** used for final reports (`reports/**`), commit messages, PR descriptions, or files under `docs/` — those stay normal prose per the session's own caveman-mode boundaries and `CLAUDE.md`. |
| **claude-mem** | `claude-mem:*` (mem-search, timeline-report, standup, etc.) | Recalling prior findings/decisions relevant to the current task before starting, and recording new decisions so future sessions don't re-derive them. Primarily used at the *start* (context) and *end* (record outcome) of a unit of work. |
| **context7** | External MCP documentation-lookup server (if configured in the environment) | Verifying exact third-party API/library signatures before writing code against them — Supabase RPC/PostgREST filter syntax, Telegram Bot API `parse_mode` rules, OpenRouter API, GitHub Actions workflow syntax. If unavailable, fall back to `WebFetch`/`WebSearch` against official docs. |
| **architect** | `Plan` agent type, or explicit human sign-off | Any change that would add/remove a table, repository, feature boundary, external dependency, or ADR. Required whenever a change would otherwise violate `CLAUDE.md`'s "Never create new architecture without approval." |
| **reviewer** | `code-review` / `security-review` skill, or `cavecrew-reviewer` agent | Mandatory pre-merge review of any code diff. Produces severity-tagged findings (`path:line: <severity>: <problem>. <fix>.`). No diff merges with an unresolved Critical/High finding. |

---

## 1. Pipeline Agent

**Purpose:** Build and maintain the cron pipeline (`scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`) that the architecture documents but that does not yet exist (`architecture-audit.md` Finding #1, `cost-audit.md` Finding #1).

**Responsibilities:**
- Implement `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` as thin composition roots per `docs/architecture.md` §3.1–3.3, wiring `createSupabaseServiceClient()`, `sourceScrapers`, `SupabaseJobRepository`, `OpenRouterAiScoreProvider`, `OpenRouterRoleExpansionProvider`, `TelegramBotSender`, `SupabaseScrapeRunRepository` into the existing `application` use-cases.
- Aggregate per-source `success`/`partial`/`failed` status and call `recordRun()` per `docs/scrapers.md` §4 (`architecture-audit.md` Finding #2).
- Fix `findUnscored`'s unsanitized `.or()` filter built from `expandedRoles` (`scraper-audit.md` Finding #1) as part of wiring `score.ts`.
- Add `tsx` as a devDependency and `scrape`/`score`/`notify` npm scripts to `package.json`.
- Preserve AD-04 (standalone scripts, not API routes) and AD-07 (two-stage scoring gate) exactly as documented.

**Allowed Files:**
- `scripts/**` (new)
- `src/features/*/application/**` (read; only behavior-preserving wiring fixes such as Finding #1 above)
- `src/features/*/infrastructure/**` (read; instantiate existing classes only — no new infrastructure classes without **architect**)
- `src/shared/infrastructure/**` (read; `createSupabaseServiceClient` consumption)
- `package.json` (scripts/devDependencies section only)

**Forbidden Files:**
- `src/app/**`, `src/components/**` (no UI changes)
- `supabase/migrations/**` (schema changes belong to Database Agent)
- `docs/decisions.md` (ADR edits belong to Architecture Review Agent)
- `.github/workflows/**` (belongs to Deployment Agent)

**Required Skills:** claude-mem, context7, architect, reviewer

**Skill Priority Order:**
1. **claude-mem** — recall prior attempts/decisions on the cron pipeline before starting.
2. **context7** — confirm OpenRouter/Telegram/Supabase client call signatures match what `infrastructure/` already implements before wiring.
3. **architect** — if any wiring step requires a new repository method or a schema-level anti-join (e.g. resolving `scraper-audit.md` Finding #2 fully), pause and request sign-off rather than adding it ad hoc.
4. **reviewer** — mandatory before merge; this is the highest-blast-radius agent (enables real scraping/AI/Telegram traffic).

**Definition of Done:**
- `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts` exist, run via `tsx`, and exercise the documented flows end-to-end against a test/staging Supabase project.
- `scrape_runs` rows are written per source per run with correct `success`/`partial`/`failed` status.
- `findUnscored` role-string interpolation is sanitized; existing scoring/notification tests still pass.
- `docs/architecture.md` §3.2 step naming updated to match `scoreJob()` (`architecture-audit.md` Finding #3) if not already fixed by another agent.
- Report written.

**Report Output Path:** `reports/pipeline-agent/<date>-report.md`

---

## 2. Database Agent

**Purpose:** Own `supabase/migrations/**`, generated types, and the database-facing docs (`docs/database.md`, `docs/repositories.md`).

**Responsibilities:**
- Resolve the `set_active_resume`/`set_active_role_selection` RPC return-type mismatch (`database-audit.md` Finding #1) — verify actual runtime shape against repository call sites, then either regenerate `database.types.ts` or change the SQL functions to `returns setof ...`, never both ad hoc.
- Sync `docs/database.md` §2 column nullability with the real migrations (`database-audit.md` #2 / `architecture-audit.md` #5).
- Sync `docs/repositories.md` §3 `set_active_resume` signature with the real 3-scalar-parameter function (`database-audit.md` #3 / `architecture-audit.md` #6).
- Provide anti-join views/RPCs for `findUnscored`/`findUnnotifiedMatches` when requested by Performance Agent (`performance-audit.md` #3–#4, `scraper-audit.md` #2) — additive migrations only, per AD-11.
- Maintain RLS policy shape (AD-12) and enum additivity on every migration.

**Allowed Files:**
- `supabase/migrations/**` (new files only — forward-only, AD-11)
- `supabase/seed.sql`
- `supabase/database.types.ts`
- `docs/database.md`, `docs/repositories.md`

**Forbidden Files:**
- `src/**` (repository *implementations* belong to the owning feature agent; Database Agent changes the contract, the feature agent updates the consumer)
- `scripts/**`, `.github/workflows/**`

**Required Skills:** claude-mem, context7, architect, reviewer

**Skill Priority Order:**
1. **claude-mem** — recall the schema's migration history and any prior RPC-shape decisions.
2. **architect** — *every* new migration that adds/changes a table, column, enum value, RPC, or view is an architecture change under `CLAUDE.md` ("never create new architecture without approval") — get sign-off before writing the migration file.
3. **context7** — confirm PostgREST/Supabase RPC return-shape semantics (`returns table` vs `returns setof`) before fixing Finding #1.
4. **reviewer** — mandatory; migrations are the hardest class of change to revert (AD-11 is forward-only).

**Definition of Done:**
- Finding #1 resolved with a single consistent source of truth (SQL signature ↔ generated types ↔ repository code all agree); existing Vitest suite for `SupabaseResumeRepository`/role-selection repository passes against the corrected shape.
- `docs/database.md` and `docs/repositories.md` match `supabase/migrations/**` exactly (re-verifiable by diffing doc SQL snippets against migration files).
- Any new ADR required by a schema change is added to `docs/decisions.md` (coordinated with Architecture Review Agent).
- Report written.

**Report Output Path:** `reports/database-agent/<date>-report.md`

---

## 3. Notification Agent

**Purpose:** Own `src/features/notifications/**` — currently holding two related High-severity findings.

**Responsibilities:**
- Add per-match try/catch + logging in `sendNotification.ts` so one failing Telegram send doesn't block all subsequent matches and doesn't permanently starve the queue (`maintainability-audit.md` Finding #1).
- Escape Telegram Markdown special characters (or switch to HTML `parse_mode` + HTML-escaping) in `formatMatchMessage.ts` for `match.title`, `match.companyName`, `match.aiReasoning` (`security-audit.md` Finding #2).
- Preserve AD-08 (notify-at-most-once via `notifications_log`, gated on `ai_score`).

**Allowed Files:**
- `src/features/notifications/**` (domain, application, infrastructure, tests)

**Forbidden Files:**
- Any other feature's `infrastructure/**` (cross-feature import rule, `dependency-audit.md`)
- `supabase/migrations/**` (if `notifications_log` schema must change, request via Database Agent)
- `src/app/**`, `src/components/**`

**Required Skills:** context7, claude-mem, reviewer

**Skill Priority Order:**
1. **claude-mem** — check whether a prior session already attempted a Markdown-escaping approach (avoid re-litigating).
2. **context7** — confirm Telegram Bot API's exact Markdown/MarkdownV2/HTML escaping rules before implementing (this is the root cause of Finding #1 via Finding #2 — getting it wrong reproduces both bugs).
3. **reviewer** — mandatory; this fixes two High findings (one maintainability, one security) and must not regress AD-08's idempotency guarantee.

**Definition of Done:**
- A test asserts that a job with `_`, `*`, `` ` ``, or `[` in its title/company/AI-reasoning produces a Telegram payload that does **not** throw and is correctly escaped.
- A test asserts that if `telegramSender.sendMessage` throws for match N, matches N+1..k are still processed and `markNotified` is still called for them.
- `security-audit.md` Finding #2 and `maintainability-audit.md` Finding #1 both get a "Resolved" note (coordinate with Security Agent / Architecture Review Agent per `review-process.md`).
- Report written.

**Report Output Path:** `reports/notification-agent/<date>-report.md`

---

## 4. Cleanup Agent

**Purpose:** Low-risk maintainability and doc-drift findings — small, isolated, mechanical fixes.

**Responsibilities:**
- Fix `RoleSelectorForm`'s duplicated `Preview.source` type to import `RoleMapSource` from `@/shared/domain/enums` (`maintainability-audit.md` Finding #2).
- Fix `ThresholdsCard.tsx` importing `shared/infrastructure/env` directly — move `optionalEnv` reads to `(protected)/settings/page.tsx` and pass values as props (`dependency-audit.md` Finding #1).
- Fix `docs/scoring.md`/`docs/frontend.md` drift items not already owned by Database Agent (`architecture-audit.md` Findings #3, #4).
- Resolve dead-code findings **only after** confirming with `claude-mem` / the relevant owning agent that no near-term caller exists: `hasScore` (`maintainability-audit.md` #3), `recordRun`/`createSupabaseServiceClient` (`maintainability-audit.md` #4–#5, `security-audit.md` #3) — these have a known future caller (Pipeline Agent), so **do not delete** until Pipeline Agent's work is merged or explicitly descoped.

**Allowed Files:**
- `src/components/**` (presentational fixes only)
- `src/features/roles/**`, `src/features/scoring/**` (type-reuse / dead-code fixes only — no logic changes)
- `docs/scoring.md`, `docs/frontend.md` (drift fixes only)

**Forbidden Files:**
- `supabase/migrations/**`, `scripts/**`, `.github/workflows/**`
- Anything requiring a new abstraction, new dependency, or new file beyond the smallest fix (per `CLAUDE.md`: "don't add features, refactor, or introduce abstractions beyond what the task requires")

**Required Skills:** claude-mem, reviewer, caveman

**Skill Priority Order:**
1. **claude-mem** — before touching any "dead code" finding, check whether Pipeline Agent (or another agent) has already claimed it as a future caller. This prevents deleting code another agent's in-flight plan depends on.
2. **reviewer** — every cleanup PR reviewed, even "trivial" ones — history shows trivial-looking deletions (e.g. `hasScore`) can be premature.
3. **caveman** — internal status notes between findings (final PR descriptions stay normal prose).

**Definition of Done:**
- Each addressed finding gets one focused commit/PR referencing its finding number (e.g. "fixes maintainability-audit.md #2").
- No behavior change; existing test suite passes unmodified (or with only the expected type-import change).
- Findings deferred (dead code pending a future caller) are explicitly logged as "deferred — blocked on Pipeline Agent" in the report, not silently skipped.
- Report written.

**Report Output Path:** `reports/cleanup-agent/<date>-report.md`

---

## 5. Architecture Review Agent

**Purpose:** The **architect** role itself — gatekeeper for `CLAUDE.md`'s "never create new architecture without approval" and "always update docs when architecture changes," and owner of `reports/architecture-audit.md`.

**Responsibilities:**
- Re-run the architecture-compliance audit (import-graph vs. `docs/architecture.md` §4–§5 dependency rules, feature-folder layout vs. AD-02, repository pattern vs. AD-03) at each phase boundary (see `agent-workflow.md`).
- Adjudicate any **architect**-escalation from another agent: approve, request changes, or reject proposed schema/dependency/feature-boundary changes.
- Keep `docs/decisions.md` (ADRs) in sync with approved changes — new ADRs for new decisions, "Consequences" sections updated for materially changed ones.
- Track drift between `docs/*` and `src/`/`supabase/` (see `review-process.md` "Architecture drift detection").

**Allowed Files:**
- `docs/**` (read/write)
- `reports/architecture-audit.md` (write)
- All of `src/**`, `supabase/**` (**read-only** — this agent reviews, it does not implement)

**Forbidden Files:**
- Any write to `src/**`, `supabase/**`, `scripts/**`, `.github/**` — if a fix is needed, it's delegated to the owning implementation agent with a finding reference.

**Required Skills:** architect, reviewer, claude-mem, caveman

**Skill Priority Order:**
1. **claude-mem** — load prior ADRs and audit history before assessing new drift.
2. **architect** — this agent *is* the architect decision point for every other agent's escalations.
3. **reviewer** — applies reviewer-style severity tagging to its own audit findings (matches existing `reports/*-audit.md` format).
4. **caveman** — compress scratch comparisons (doc-vs-code diffing) during analysis; final `reports/architecture-audit.md` and `docs/decisions.md` stay normal prose.

**Definition of Done:**
- `reports/architecture-audit.md` updated with current findings, using the existing format (numbered Findings + "Summary of Compliant Areas").
- Every Critical/High finding from the previous cycle either shows a "Resolved" note with the resolving PR/commit, or remains open with an explicit reason.
- Any architecture change approved during the cycle has a corresponding ADR in `docs/decisions.md`.
- Report written (this agent's report **is** `reports/architecture-audit.md` — no separate file).

**Report Output Path:** `reports/architecture-audit.md`

---

## 6. Security Agent

**Purpose:** Own `reports/security-audit.md` findings and ongoing security review of changes from other agents.

**Responsibilities:**
- Fix resume-upload Storage path construction — stop using raw `file.name`, derive the path from `Date.now()` + `randomUUID()` only (`security-audit.md` Finding #1).
- Co-own (with Notification Agent) the Telegram Markdown-escaping fix (`security-audit.md` Finding #2) — Security Agent reviews/signs off rather than re-implements.
- Monitor `createSupabaseServiceClient`/`SUPABASE_SERVICE_ROLE_KEY` boundary once Pipeline Agent gives it real callers (`security-audit.md` Finding #3) — add a grep-based CI check ensuring the service-role key never appears under `src/app/**` or any `"use client"` file.
- Re-verify secret handling (`requireEnv`/`optionalEnv`), RLS (AD-12), and auth flow (`docs/frontend.md` §4) whenever any agent's change touches `src/shared/infrastructure/**`, `src/middleware.ts`, or auth.

**Allowed Files:**
- `src/features/resume/**`
- `src/shared/infrastructure/env.ts`, `src/middleware.ts`, `src/shared/infrastructure/supabase/**` (security-relevant fixes only)
- `reports/security-audit.md`

**Forbidden Files:**
- No new dependencies (CLAUDE.md forbidden-library list applies; security fixes must use existing primitives — e.g. `randomUUID` from Node's `crypto`, already available).
- `supabase/migrations/**` (RLS policy changes go through Database Agent with **architect** sign-off).

**Required Skills:** reviewer, context7, claude-mem

**Skill Priority Order:**
1. **claude-mem** — recall prior security findings and whether any were previously marked "accepted risk."
2. **context7** — confirm Supabase Storage path/key constraints before implementing Finding #1's fix.
3. **reviewer** — mandatory; security fixes always reviewed, no exceptions, regardless of severity.

**Definition of Done:**
- Finding #1: storage path no longer derived from `file.name`; original filename (if retained for display) stored as a separate column/metadata value, not part of the path. Regression test added.
- Finding #2: signed off jointly with Notification Agent's implementation; `reports/security-audit.md` Finding #2 gets a "Resolved" note.
- Finding #3: CI/lint check added (or documented as a follow-up gated on Pipeline Agent's merge) ensuring `SUPABASE_SERVICE_ROLE_KEY` stays out of client-reachable code.
- Report written / `reports/security-audit.md` updated.

**Report Output Path:** `reports/security-audit.md` (updates in place, per `review-process.md`)

---

## 7. Performance Agent

**Purpose:** Own `reports/performance-audit.md` and the related `cost-audit.md` query-shape findings.

**Responsibilities:**
- Remove `upsertMany`'s redundant pre-upsert `findExistingKeys` SELECTs and the unused `{inserted, updated}` breakdown (`performance-audit.md` Finding #1 / `cost-audit.md` Finding #3).
- Move `findForDashboard`'s `minAiScore` filter server-side via a Postgres view/RPC (`performance-audit.md` Finding #2).
- Convert `findUnnotifiedMatches`'s JS-side `notifications_log` filter and `findUnscored`'s unbounded `.not("id","in",...)` list into true anti-joins via Postgres views/RPCs (`performance-audit.md` Findings #3–#4, `scraper-audit.md` Finding #2, `cost-audit.md` Finding #4).
- Once Pipeline Agent's cron is live, re-run `cost-audit.md` Finding #1 against real "every 2h × 5 sources" volume.

**Allowed Files:**
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts`
- `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts`
- `docs/repositories.md` (query-pattern updates only)
- `reports/performance-audit.md`, `reports/cost-audit.md`

**Forbidden Files:**
- `src/features/*/domain/**`, `src/features/*/application/**` (query-shape optimization must not change use-case signatures/behavior — only the SQL/PostgREST call underneath)
- `src/app/**`, `src/components/**`

**Required Skills:** architect, context7, reviewer, claude-mem

**Skill Priority Order:**
1. **claude-mem** — recall the current query-shape baseline (row counts, index usage) from prior sessions if recorded.
2. **architect** — any new Postgres view/RPC is a schema addition under `CLAUDE.md` — coordinate with Database Agent and get sign-off before the view/RPC is written.
3. **context7** — confirm PostgREST anti-join / `.not()` / view-querying syntax before implementing.
4. **reviewer** — mandatory; these are hot-path queries for both the dashboard and the (future) cron pipeline.

**Definition of Done:**
- Findings #1–#4 (performance-audit) and #3–#4 (cost-audit) each show measurable query-count/row-scan reduction (documented in the report, even informally — e.g. "1 SELECT instead of 1+N per batch").
- `docs/repositories.md` query patterns updated to match the new implementations.
- `cost-audit.md` Finding #1 re-run note added once Pipeline Agent's pipeline exists (may be "deferred — blocked on Pipeline Agent" until then).
- Report written.

**Report Output Path:** `reports/performance-audit.md`, `reports/cost-audit.md` (updates in place)

---

## 8. Deployment Agent

**Purpose:** Own `.github/workflows/**`, deployment config, and env/secret provisioning — the operational "last mile" once Pipeline Agent's scripts exist.

**Responsibilities:**
- Create `.github/workflows/*.yml` running `scripts/scrape.ts` → `scripts/score.ts` → `scripts/notify.ts` via `tsx`, on the AD-04 "every 2h" schedule.
- Verify `next.config.ts`'s `serverExternalPackages: ["pdf-parse"]` and any other Vercel-specific config stays correct as dependencies change.
- Document required secrets (names only, never values) for GitHub Actions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TELEGRAM_BOT_TOKEN`, `KEYWORD_THRESHOLD`, `NOTIFY_THRESHOLD`.
- Coordinate with Security Agent's Finding #3 check (service-role key boundary) as part of CI.

**Allowed Files:**
- `.github/workflows/**` (new)
- `next.config.ts`
- `package.json` (scripts section — coordinate with Pipeline Agent, who also touches this file)
- Deployment/env documentation (new file under `docs/` if needed, e.g. `docs/deployment.md`, with **architect** sign-off since it's a new doc)

**Forbidden Files:**
- `src/**`, `supabase/**`, `scripts/**` (consumes Pipeline Agent's scripts, doesn't modify their logic)

**Required Skills:** context7, reviewer, claude-mem, caveman

**Skill Priority Order:**
1. **claude-mem** — recall whether prior sessions already drafted a workflow file or secret list.
2. **context7** — confirm current GitHub Actions cron syntax, `tsx` invocation in CI, and Vercel deployment config before writing the workflow.
3. **reviewer** — mandatory; a misconfigured cron schedule directly drives the cost model in `cost-audit.md`.
4. **caveman** — scratch notes while iterating on workflow YAML; final YAML and docs stay normal.

**Definition of Done:**
- `.github/workflows/*.yml` exists, references the exact npm scripts Pipeline Agent added, and runs on the documented schedule.
- Secret names documented (not values), matching what `scripts/**` actually reads via `requireEnv`/`optionalEnv`.
- Security Agent's Finding #3 CI check is wired into the workflow (or a follow-up step), not skipped.
- Report written.

**Report Output Path:** `reports/deployment-agent/<date>-report.md`
