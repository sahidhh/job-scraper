# Database Agent Report

**Date:** 2026-06-13
**Scope:** `supabase/migrations/**`, `supabase/database.types.ts`, `docs/database.md`, `docs/repositories.md`
**Source:** `reports/database-audit.md`

---

## Summary

All three findings from `database-audit.md` are resolved. No UI changes, no new tables/columns/enums, no changes to `src/**`.

---

## Finding #1 (High): `set_active_resume` / `set_active_role_selection` RPC return-type mismatch — Resolved

**Verification of runtime shape:** Read `SupabaseResumeRepository.create()` and `SupabaseRoleRepository.setActiveSelection()`. Both already call `.rpc(...)` and read `data?.[0]`, and both Vitest suites mock the RPC response as `data: [row]` (an array). This means the *repository code and tests* already assume the array shape that `database.types.ts` declares (`Returns: ResumeRow[]` / `RoleSelectionRow[]`).

The actual bug was on the **SQL side**: both functions were declared `returns resumes` / `returns role_selections` (a single composite row), which PostgREST would expose as a single JSON object — `data?.[0]` would have been `undefined` at runtime despite type-checking cleanly.

**Fix applied (option b from the audit):** New forward-only migration `supabase/migrations/20260612000006_fix_rpc_return_types.sql`:

- Drops and recreates `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[])` as `returns setof resumes`.
- Drops and recreates `set_active_role_selection(p_primary_role text, p_expanded_roles text[])` as `returns setof role_selections`.
- `create or replace function` cannot change a return type, hence the drop+create. Deactivate-then-insert swap logic (AD-09) is unchanged — only the return clause changed from `returning * into result; return result;` to `return query select * from <table> where id = result.id;`.

**Result:** SQL signature ↔ generated types ↔ repository code now agree (all three: array of one row). No changes needed to `database.types.ts`'s `Functions` section — its `Returns: ...Row[]` shape was already correct for `setof`; only its header comment was updated to reflect the new migration (`20260612000006`). No changes needed to `SupabaseResumeRepository`/`SupabaseRoleRepository` or their tests — already correct against the corrected shape.

---

## Finding #2 (Low): `docs/database.md` §2 nullable-column drift — Resolved

Updated `docs/database.md` §2 schema snippet so `jobs.location_raw`, `jobs.description`, and `resumes.parsed_text` read `text not null default ''`, matching `supabase/migrations/20260612000002_tables.sql:28,30,46` (and `database.types.ts`'s non-nullable `string` typing, and the repositories' lack of null-checks on these fields).

---

## Finding #3 (Low): `docs/repositories.md` §3 `set_active_resume` signature drift — Resolved

Updated `docs/repositories.md`:

- §3 (`ResumeRepository`): `set_active_resume(new_resume jsonb)` → `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[]) returns setof resumes`, matching the real 3-scalar-parameter function and Finding #1's fix.
- §4 (`RoleRepository`): also corrected `set_active_role_selection(primary_role text, expanded_roles text[])` → `set_active_role_selection(p_primary_role text, p_expanded_roles text[]) returns setof role_selections` for the same parameter-naming/return-type accuracy (same drift category, same doc, not a separate finding).

---

## Migration Validation

- `20260612000006_fix_rpc_return_types.sql` is additive/forward-only (AD-11): it redefines two functions only, no table/column/enum/index/RLS changes, no data loss. Sequenced correctly after `20260612000005_rls.sql`.
- Re-checked all 5 prior migrations against `database.md`/`database.types.ts`: enums, indexes, RLS policies, FKs, and the "single active" partial-unique pattern (`resumes_single_active_uq`, `role_selections_single_active_uq`) all remain consistent — no new issues found beyond the three above.

## Generated Types Validation

- `database.types.ts` `Tables` section verified column-by-column against `20260612000002_tables.sql` — all types/nullability match (including the `not null default ''` columns now also fixed in docs).
- `Functions` section (`set_active_resume`, `set_active_role_selection`) verified against the new migration — `Returns: ...Row[]` is now correct for `returns setof ...`. Header comment bumped to note migration `20260612000006`.
- `Enums` section verified against `20260612000001_enums.sql` — exact match, no drift.

---

## Definition of Done

- [x] Finding #1 resolved with a single consistent source of truth (SQL ↔ types ↔ repository code).
- [x] Existing Vitest suites for `SupabaseResumeRepository` / `SupabaseRoleRepository` require no changes — they already model the corrected shape.
- [x] `docs/database.md` and `docs/repositories.md` match `supabase/migrations/**`.
- [x] No new ADR required — the fix corrects an existing RPC's return clause to match its already-documented behavior (AD-09); it does not change the swap semantics, schema, or API surface, so AD-09's text remains accurate as written.
- [x] Report written.

## Notes for Other Agents

- Pipeline Agent / any future caller of `set_active_resume` / `set_active_role_selection`: continue using `data?.[0]` — unchanged.
- No action needed from Architecture Review Agent for this change (no new tables/columns/enums/views/dependencies — a return-type bugfix on existing RPCs already specified by AD-09 and the generated types).
