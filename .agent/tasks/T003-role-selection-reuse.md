---
id: T003
title: Deterministic role pack selection reuse in SupabaseRoleRepository
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T001]
requirements: [REQ-F008]
---
# Objective
Ensure `SupabaseRoleRepository.setActiveSelection` and `activateRolePack` reuse the existing `role_selections` row (and its UUID) when switching between role packs and switching back, so existing `job_scores` are never orphaned.

# Context
- `src/features/roles/application/activateRolePack.ts` calls `setActiveRoleSelection(pack.name, pack.roles, { roleRepository })`.
- `SupabaseRoleRepository.setActiveSelection` calls `this.client.rpc("set_active_role_selection", ...)`.
- T001 updated the Postgres `set_active_role_selection` RPC to look up and reactivate an existing matching row.

# Inputs
- `src/features/roles/infrastructure/SupabaseRoleRepository.ts`
- `src/features/roles/application/activateRolePack.ts`
- `src/features/roles/application/setActiveRoleSelection.ts`

# Scope
Included: `SupabaseRoleRepository.ts` (if client-side normalization or signature passing is needed) and unit/integration tests for `activateRolePack` / `SupabaseRoleRepository.setActiveSelection`.
Excluded: Changing `role_packs` seed data.

# Implementation guidance
1. Normalize `primaryRole` (trim) and `expandedRoles` (preserve/canonicalize consistently) before calling `set_active_role_selection` RPC so minor casing/whitespace differences don't defeat reuse.
2. Add/update Vitest tests verifying that switching from Pack A → Pack B → Pack A returns the exact same `roleSelection.id` for Pack A and does not require re-scoring.

# Expected outputs
- Updated `src/features/roles/infrastructure/SupabaseRoleRepository.ts` (if needed)
- Unit/integration test file covering pack switching & ID reuse

# Acceptance criteria
Blocking:
- [ ] AC-003-1: Switching Pack A → Pack B → Pack A reuses Pack A's `role_selection_id` in tests.
- [ ] AC-003-2: `npm run typecheck` and `npm run test` pass for `src/features/roles/`.
Quality:
- [ ] Existing `RoleRepository` interface contract remains clean and backward-compatible.
Compatibility:
- [ ] `confirmRoleSelectionAction` and `activateRolePackAction` continue to work without UI changes.

# Verification
- `npx vitest run src/features/roles`
- `npm run typecheck`

# Constraints
- Do not break `getActiveSelection()` or `role_expansion_map` caching.

# Handoff
Return: status, summary, changed files, test output.

# Failure handling
- If RPC signature in T001 differs from TS call, align TS call or flag T001 defect.
