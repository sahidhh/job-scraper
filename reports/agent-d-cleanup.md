# Cleanup Agent Report

Role: Cleanup Agent (`docs/agent-profiles.md` §4). Scope: low-risk, mechanical fixes only — no architecture changes, no functional changes, no new abstractions.

---

## Addressed

### 1. Duplicate type — `RoleSelectorForm.tsx` `Preview.source` (maintainability-audit.md Finding #2)

- **File:** `src/components/roles/RoleSelectorForm.tsx`
- **Change:** Replaced the locally-declared `source: "seed" | "ai"` literal union in `interface Preview` with `source: RoleMapSource`, imported from `@/shared/domain/enums` (the same import `ExpandedRolesCard.tsx` and `features/roles/domain/types.ts` already use).
- **Verification:** `npx tsc --noEmit` passes with no errors — `expandRoleAction`'s return type (`ActionResult<RoleExpansion>`, where `RoleExpansion.source: RoleMapSource`) flows into `Preview` without a cast.
- **Status:** Resolved.

---

## Deferred (per agent-profiles.md §4 instruction — known future caller)

### 2. Dead code: `hasScore`, `recordRun`, `createSupabaseServiceClient` (maintainability-audit.md #3–#5, security-audit.md #3)

- Re-checked via grep: all three still have zero non-test callers in `src/`.
- Per `docs/agent-profiles.md` §4, these are explicitly reserved for the Pipeline Agent's `scripts/scrape.ts`/`scripts/score.ts` (architecture-audit.md Finding #1, still open/Critical — `scripts/` does not exist yet).
- **Action taken:** none — deleting now would remove code another agent's in-flight plan depends on.
- **Status:** Deferred, blocked on Pipeline Agent merging `scripts/**`. Revisit once that lands or is explicitly descoped.

---

## Out of scope for this agent (not addressed)

### 3. "Redundant SELECTs" — `upsertMany`'s pre-upsert `findExistingKeys` (performance-audit.md Finding #1)

- **File:** `src/features/jobs/infrastructure/SupabaseJobRepository.ts:70-122`
- This file is owned by the **Performance Agent** (`docs/agent-profiles.md` §7's Allowed Files), not the Cleanup Agent. The Cleanup Agent's allowed files are `src/components/**`, `src/features/roles/**`, `src/features/scoring/**`, and `docs/scoring.md`/`docs/frontend.md`.
- **Action taken:** none — left for Performance Agent to resolve per its own Definition of Done.

### 4. "Filename handling" — resume upload Storage path uses raw `file.name` (security-audit.md Finding #1)

- **File:** `src/features/resume/actions.ts:36` (`uploadResumeAction`)
- This file is owned by the **Security Agent** (`docs/agent-profiles.md` §6's Allowed Files: `src/features/resume/**`), not the Cleanup Agent.
- **Action taken:** none — left for Security Agent to resolve (fix is to derive the storage path from `Date.now()` + `randomUUID()` only, storing the original filename separately if needed for display).

---

## Summary

| Finding | Category | Status |
|---|---|---|
| maintainability-audit #2 (`RoleSelectorForm` `Preview.source`) | Duplicate types | **Resolved** |
| architecture-audit #4 (`frontend.md` `actions.ts` path drift) | Doc drift | **Resolved** (see Addendum) |
| dependency-audit #1 (`ThresholdsCard` `shared/infrastructure` import) | Layering violation | **Resolved** (see Addendum) |
| maintainability-audit #3 (`hasScore`), #4 (`recordRun`), security-audit #3 (`createSupabaseServiceClient`) | Dead code | Deferred — blocked on Pipeline Agent |
| performance-audit #1 (`upsertMany` `findExistingKeys`) | Redundant SELECTs | Out of scope — owned by Performance Agent |
| security-audit #1 (resume upload `file.name` in storage path) | Filename handling | Out of scope — owned by Security Agent |

No behavior change. `npx tsc --noEmit` passes. One file touched: `src/components/roles/RoleSelectorForm.tsx`.

---

## Addendum (Merge Conditions Agent, 2026-06-13)

This report originally omitted two of this agent's three Phase-1-assigned items (`architecture-audit.md` #4 / `frontend.md` path drift, and `dependency-audit.md` #1 / `ThresholdsCard`) — flagged as `merge-plan.md` N2/U1/U2. Both are now resolved:

- **architecture-audit #4 (U1):** `docs/frontend.md:53` updated — `features/<feature>/actions.ts` (was `features/roles/application/actions.ts`), with a note that this is presentation/composition-root code per `architecture.md` §5, not `application/`.
- **dependency-audit #1 (U2):** `src/components/settings/ThresholdsCard.tsx` no longer imports `@/shared/infrastructure/env`; it now takes `keywordThreshold`/`notifyThreshold` as props. `src/app/(protected)/settings/page.tsx` (a server component) reads `optionalEnv("KEYWORD_THRESHOLD", "0.5")` / `optionalEnv("NOTIFY_THRESHOLD", "0.75")` and passes them in.

All three of this agent's Phase-1 items are now accounted for: one resolved in the original pass, two resolved in this addendum.
