---
id: T004
title: Title-only role matching and pre-DB minYears > 3 hard-drop in ingestJobs
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T002]
requirements: [REQ-F009, REQ-F010]
---
# Objective
Update `jobMatchesRoles` (`roleMatch.ts`) and `buildRoleFilter` (`roleFilter.ts`) to match against `job.title` ONLY (never `description`) using a configurable Title Allowlist and Title Denylist, and update `ingestJobs.ts` to hard-drop title mismatches and `minYears > 3` before DB upsert.

# Context
- Currently `roleMatch.ts` checks `${job.title}\n${job.description}` and `roleFilter.ts` generates `title.ilike.%...%,description.ilike.%...%`.
- `ingestJobs.ts` currently computes `minYears: parseMinYears(text)` and `classifyEligibility(job)` and persists all non-unsponsored jobs.
- Spec §4 requires:
  - Title Allowlist (e.g. `software engineer`, `sde`, `full stack`, `.net`, `c#`, `backend`, `developer`)
  - Title Denylist (e.g. `senior`, `sr.`, `staff`, `principal`, `lead`, `manager`, `architect`, `intern`, `qa`, `tester`, `sales`, `support`, `devops`, `java`)
  - Hard-drop `minYears > 3` and title mismatches inside `ingestJobs` *before* `jobRepository.upsertMany`.

# Inputs
- `src/features/sources/domain/roleMatch.ts`
- `src/shared/infrastructure/roleFilter.ts`
- `src/features/jobs/application/ingestJobs.ts`
- `src/shared/config/candidate-constraints.ts`

# Scope
Included: Title allowlist/denylist config, `roleMatch.ts`, `roleFilter.ts`, `ingestJobs.ts`, and their unit tests (`roleMatch.test.ts`, `ingestJobs.test.ts`, plus `roleFilter.test.ts`).
Excluded: Modifying `classifyEligibility.ts` geo/sponsorship rules.

# Implementation guidance
1. Define `TITLE_ALLOWLIST` and `TITLE_DENYLIST` in `src/shared/config/candidate-constraints.ts` (or a dedicated shared config imported by both `roleMatch.ts` and `ingestJobs.ts`).
2. Update `jobMatchesRoles` in `roleMatch.ts` to check `job.title` ONLY: must not match any denylist term (use word/token-safe matching so e.g. `java` doesn't accidentally block `javascript` if needed, and `sr.` / `senior` / `lead` / `staff` / `sales` / `qa` match cleanly), and must match either `roles` terms or `TITLE_ALLOWLIST` when `roles` is active.
3. Update `buildRoleFilter` in `roleFilter.ts` to emit `title.ilike.%${role}%` only (remove `description.ilike.%${role}%`).
4. In `ingestJobs.ts`, after `parseMinYears(text)` (or before enrichment/upsert), drop jobs where `minYears !== null && minYears > 3` OR `!jobMatchesRoles(job, ...)` (using a shared title-filter helper so `ingestJobs` drops off-stack/senior titles even if a scraper didn't filter). Track dropped counts in `IngestResult` or log cleanly without breaking existing `IngestResult` callers.

# Expected outputs
- Updated `src/shared/config/candidate-constraints.ts` (allowlist/denylist constants)
- Updated `src/features/sources/domain/roleMatch.ts` & `roleMatch.test.ts`
- Updated `src/shared/infrastructure/roleFilter.ts`
- Updated `src/features/jobs/application/ingestJobs.ts` & `ingestJobs.test.ts`

# Acceptance criteria
Blocking:
- [ ] AC-004-1: `jobMatchesRoles` rejects `Senior`, `Staff`, `Lead`, `Sales`, `QA`, `Java` titles even when `description` contains `Software Engineer`.
- [ ] AC-004-2: `buildRoleFilter` outputs `title.ilike` clauses only and never `description.ilike`.
- [ ] AC-004-3: `ingestJobs` drops jobs with `minYears > 3` or denylisted/non-matching titles *before* calling `jobRepository.upsertMany`.
Quality:
- [ ] Word-boundary handling prevents `java` denylist from false-blocking `javascript` (if applicable) and `qa` from blocking `aqua`/etc.
Compatibility:
- [ ] Existing `IngestResult` consumers (`scripts/scrape.ts`, tests) continue to compile and pass.

# Verification
- `npx vitest run src/features/sources/domain/roleMatch.test.ts src/features/jobs/application/ingestJobs.test.ts`
- `npm run typecheck`

# Constraints
- Do not import `features/sources/infrastructure` into `features/jobs/application` (keep shared config in `src/shared/config/` or `src/shared/domain/`).

# Handoff
Return: status, summary, changed files, test output.

# Failure handling
- If existing `ingestJobs.test.ts` fixtures have `Senior` or `minYears > 3` expecting persistence, update fixtures or pass explicit test titles and document why.
