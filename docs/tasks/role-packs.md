# Role Packs — Phase 1

## Problem

The platform only allowed selecting a single primary role at a time. Users who search under multiple related titles (e.g. "Full Stack Developer", "Software Engineer", "React Developer") had to rely on the AI expansion step to cover related terms. This expansion is non-deterministic and requires an OpenRouter API call on every cache miss.

Users often need a quick, deterministic way to activate a cluster of related titles without going through an AI expansion workflow.

---

## Existing Role Flow (before)

```
User types primary role
  → expandRoleAction(primaryRole)
      → role_expansion_map cache hit? return cached relatedRoles
      → cache miss? OpenRouter call → cache result
  → user confirms selection
      → confirmRoleSelectionAction(primaryRole, expandedRoles)
          → set_active_role_selection RPC (atomic)
              → role_selections row created (is_active=true)

Scrape cron:
  role_selections.expanded_roles → passed to all scrapers as role filter

Score cron:
  role_selections.id → scopes job_scores rows
  role_selections.expanded_roles → filters unscored jobs
```

---

## New Role Flow (with Role Packs)

```
User clicks a Role Pack card
  → activateRolePackAction(packId)
      → role_pack_roles queried (ordered by sort_order)
      → setActiveRoleSelection(pack.name, pack.roles)
          → set_active_role_selection RPC (atomic, identical to before)
              → role_selections row created (is_active=true)

Scrape/Score/Notify: UNCHANGED — read from role_selections as before
```

The manual role + AI expand flow is preserved exactly. Role packs are an alternative entry point that bypasses the AI step entirely by using stored mappings.

---

## Design Decisions

### 1. Packs expand into the existing `role_selections` table

Packs write into `role_selections` identically to the manual flow. The pack name becomes `primary_role` and the pack's roles become `expanded_roles`. No schema changes downstream.

**Alternative considered:** Add a `source_pack_id` FK on `role_selections`. Rejected — adds coupling to a field the pipelines don't need, increases migration surface.

### 2. No runtime AI generation for packs

Packs use stored mappings only (`role_pack_roles` table, seeded by migration). This is deterministic, free, and zero-latency.

**Alternative considered:** AI-generated pack contents on first use. Rejected — adds non-determinism and cost; packs should be stable and predictable.

### 3. `role_pack_roles` as a separate table (not an array column)

Individual roles are stored as rows in `role_pack_roles` with a `sort_order` column. This makes the ordering explicit and queryable.

**Alternative considered:** `text[]` column on `role_packs`. Rejected — harder to query, no natural ordering, less extensible.

### 4. Insertion point: between user click and `setActiveRoleSelection`

The safest minimal-diff insertion point. All downstream code (scrape, score, notify) is completely untouched. Only the role selection entry path changes.

---

## Alternatives Considered

| Alternative | Reason rejected |
|---|---|
| Modify scraper to expand packs at runtime | Too invasive; would require touching scraping and scoring flows |
| AI-generated pack contents | Non-deterministic, costs money, not needed |
| Single `text[]` column for roles | Less queryable, no natural ordering |
| Pack selection as a separate page | Unnecessary — `/roles` is the right home for all role selection |

---

## Files Changed

### New Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260618000002_role_packs.sql` | Creates `role_packs` and `role_pack_roles` tables + RLS + seed data |
| `src/features/roles/domain/RolePackRepository.ts` | Repository interface |
| `src/features/roles/application/getRolePacks.ts` | Use-case: list all packs |
| `src/features/roles/application/activateRolePack.ts` | Use-case: load pack + activate selection |
| `src/features/roles/infrastructure/SupabaseRolePackRepository.ts` | Supabase implementation |
| `src/components/roles/RolePackSelector.tsx` | Client component: pack cards UI |
| `src/features/roles/application/getRolePacks.test.ts` | Unit tests |
| `src/features/roles/application/activateRolePack.test.ts` | Unit tests |
| `docs/tasks/role-packs.md` | This document |

### Modified Files

| File | Change |
|---|---|
| `src/features/roles/domain/types.ts` | Added `RolePack` interface |
| `src/features/roles/actions.ts` | Added `getRolePacksAction`, `activateRolePackAction` |
| `src/app/(protected)/roles/page.tsx` | Loads packs; renders `RolePackSelector` above custom input |
| `supabase/database.types.ts` | Added `role_packs` and `role_pack_roles` table types |
| `design/erd.md` | Added `ROLE_PACKS` and `ROLE_PACK_ROLES` entities |
| `design/use-cases.md` | Added UC-06a |
| `design/scope.md` | Added Role Packs to P0 feature table and roadmap |
| `design/api-reference.md` | Documented new server actions |

---

## DB Changes

### New Tables

**`role_packs`**
```sql
id          uuid primary key default gen_random_uuid()
name        text not null
description text not null default ''
created_at  timestamptz not null default now()
```

**`role_pack_roles`**
```sql
id         uuid primary key default gen_random_uuid()
pack_id    uuid not null references role_packs(id) on delete cascade
role       text not null
sort_order integer not null default 0
```

### Seeded Packs

| Pack | Roles |
|---|---|
| Full Stack Pack | Full Stack Engineer, Full Stack Developer, Software Engineer, Frontend Developer, Backend Developer, React Developer, Node.js Developer, Web Developer |
| Frontend Pack | Frontend Engineer, Frontend Developer, React Developer, UI Engineer, JavaScript Developer, TypeScript Developer, Next.js Developer |
| Backend Pack | Backend Engineer, Backend Developer, Software Engineer, Node.js Developer, Python Developer, API Developer, Platform Engineer |
| Data Engineering Pack | Data Engineer, Analytics Engineer, Data Pipeline Engineer, ETL Developer, Data Developer |
| DevOps Pack | DevOps Engineer, Platform Engineer, Site Reliability Engineer, Cloud Engineer, Infrastructure Engineer, SRE |

### RLS Policies

Both tables enable RLS. `authenticated` users have SELECT; all writes are service-role only (seed via migration).

---

## Testing

### Unit Tests

- `getRolePacks.test.ts` — verifies delegation to repository, handles empty list
- `activateRolePack.test.ts` — verifies pack load + setActiveSelection delegation, validates empty packId, handles missing pack

### Manual Validation Checklist

1. Existing role selection (custom text + AI expand + confirm) still works unchanged
2. Role packs appear on `/roles` above the custom input divider
3. Clicking "Use pack" activates the selection (button shows "Active"; revalidated pages reflect new selection)
4. Scraping filters jobs by the pack's expanded roles
5. Scoring scopes job_scores to the new role_selection_id
6. Notifications reference the new role_selection_id correctly

---

## Risks

| Risk | Mitigation |
|---|---|
| Pack roles don't match user's actual target | Packs are a convenience shortcut; user can always fall back to custom role + AI expansion |
| `role_expansion_map` cache may conflict with pack name | Packs bypass the expansion cache entirely; they write directly to `role_selections` |
| Future pack edits not reflected in existing `role_selections` | Expected — a role_selection is a historical snapshot; re-activating the pack creates a new row |

---

## Future Enhancements

- User-defined custom packs (CRUD on `role_packs` + `role_pack_roles`)
- Pack import via JSON
- Pack versioning (track which pack version created a role_selection)
- Pack sharing across users (multi-tenant future)

---

## Rollback Plan

1. Remove pack-related UI from `/roles/page.tsx` (revert to original one-liner page)
2. Remove `RolePackSelector` component
3. Remove server actions `getRolePacksAction` and `activateRolePackAction`
4. Remove application use-cases and infrastructure files
5. The `role_packs` and `role_pack_roles` tables can remain (no foreign keys point to them from core tables); or drop via a revert migration

Existing `role_selections` rows created via packs remain valid — they are indistinguishable from manually created rows and the pipelines will continue to use them correctly.
