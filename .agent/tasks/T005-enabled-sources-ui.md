---
id: T005
title: enabled_sources settings repository, server actions, and /settings UI card
status: pending
gate_level: 2
priority: high
agent: {role: frontend, tier: sr, fallback: agent_default}
dependencies: [T002]
requirements: [REQ-F003]
---
# Objective
Add `getEnabledSources` / `setEnabledSources` to `SettingsRepository` and `SupabaseSettingsRepository` (persisted in `app_settings` key `enabled_sources`), expose a Server Action, and add an `EnabledSourcesCard` checklist to `/settings` (`src/app/(protected)/settings/page.tsx`).

# Context
- `SupabaseSettingsRepository.ts` already manages `desired_experience_years`, `skip_unsponsored_foreign_jobs`, and `show_status_dropdown` in `app_settings`.
- `src/features/settings/actions.ts` exposes `setDesiredExperienceAction`, `setSkipUnsponsoredForeignJobsAction`, `setShowStatusDropdownAction`.
- `src/app/(protected)/settings/page.tsx` renders settings cards (`ExperienceCard`, `SponsorshipCard`, etc.).

# Inputs
- `src/features/settings/domain/SettingsRepository.ts`
- `src/features/settings/infrastructure/SupabaseSettingsRepository.ts`
- `src/features/settings/actions.ts`
- `src/app/(protected)/settings/page.tsx`
- `src/shared/domain/enums.ts` (`JOB_SOURCES`)

# Scope
Included: `SettingsRepository`, `SupabaseSettingsRepository`, `setEnabledSources` use-case + validation, server action, `EnabledSourcesCard.tsx`, `/settings` page integration, unit tests.
Excluded: Modifying `scripts/scrape.ts` (done in T007).

# Implementation guidance
1. Add `getEnabledSources(): Promise<JobSource[]>` and `setEnabledSources(sources: JobSource[]): Promise<void>` to `SettingsRepository` and `SupabaseSettingsRepository`.
2. When `app_settings` has no `enabled_sources` row or invalid data, default safely to `["naukri", "naukrigulf"]`.
3. Validate that every source in `setEnabledSources` is a valid `JOB_SOURCES` member (reject unknown/manual sources with `DomainValidationError`).
4. Build `EnabledSourcesCard.tsx` with checkboxes/toggles for each source in `JOB_SOURCES` (highlighting `naukri` and `naukrigulf`), calling `setEnabledSourcesAction`.

# Expected outputs
- Updated `SettingsRepository.ts`, `SupabaseSettingsRepository.ts`, `settings/actions.ts`
- `src/features/settings/application/setEnabledSources.ts`
- `src/components/settings/EnabledSourcesCard.tsx`
- Updated `src/app/(protected)/settings/page.tsx`
- Unit tests in `src/features/settings/`

# Acceptance criteria
Blocking:
- [ ] AC-005-1: `getEnabledSources` returns persisted `JobSource[]` from `app_settings` and defaults to `["naukri", "naukrigulf"]` when unset.
- [ ] AC-005-2: `setEnabledSources` validates against `JOB_SOURCES` and persists to `app_settings`; `/settings` renders `EnabledSourcesCard`.
Quality:
- [ ] Follows existing `SponsorshipCard.tsx` / `ExperienceCard.tsx` UI and accessibility patterns.
Compatibility:
- [ ] Existing settings tests pass (`SupabaseSettingsRepository.test.ts`).

# Verification
- `npx vitest run src/features/settings`
- `npm run typecheck`

# Constraints
- Do not build a cookie editor UI in `/settings` (Out of Scope).

# Handoff
Return: status, summary, changed files, test output.

# Failure handling
- If `SettingsRepository` is mocked in other tests, update those test doubles to include `getEnabledSources` / `setEnabledSources`.
