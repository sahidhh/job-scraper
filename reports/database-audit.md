# Database Review Audit

Scope: `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/database.types.ts` vs. `docs/database.md`, `docs/repositories.md`, and AD-09/AD-11/AD-12.

---

## Findings

### 1. `set_active_resume` / `set_active_role_selection` RPC return type mismatch between SQL and generated types

- **Severity:** High
- **File:** `supabase/migrations/20260612000004_functions.sql:11-15,28-32` vs. `supabase/database.types.ts` (Functions section)
- **Location:** `set_active_resume(p_file_path text, p_parsed_text text, p_skills text[]) returns resumes` and `set_active_role_selection(p_primary_role text, p_expanded_roles text[]) returns role_selections` — both declared `returns <table>` (singular composite), but `database.types.ts` types `Functions.set_active_resume.Returns` and `Functions.set_active_role_selection.Returns` as `Database["public"]["Tables"]["resumes"]["Row"][]` / `...role_selections["Row"][]` (arrays).
- **Description:** In Postgres/PostgREST, a PL/pgSQL function declared `returns resumes` (a single composite row, not `setof resumes`) is exposed by PostgREST as a single JSON object, not an array — `supabase-js`'s `.rpc(...)` call would receive `data: ResumeRow` (an object), not `data: ResumeRow[]`. The generated `database.types.ts`, however, types the `Returns` field as `ResumeRow[]` / `RoleSelectionRow[]`. One of these is wrong: either the SQL function should be `returns setof resumes` (making the array type correct), or the generated types are stale/incorrectly hand-edited and should be a single object type.
- **Why it matters:** This is the kind of mismatch that **type-checks cleanly but breaks at runtime**. If `SupabaseResumeRepository.create()` (and the analogous role-selection repository method) calls `.rpc("set_active_resume", {...})` and then does `data[0]` or `.map(...)` on the result (treating it as an array per the generated type), but the actual runtime payload from PostgREST is a single object (because the function is `returns resumes`, not `returns setof resumes`), `data[0]` would be `undefined` and `.map` would throw — yet TypeScript would not flag this because the generated type says it's an array. Conversely, if the repository code already correctly treats the result as a single object (contradicting the generated array type), then `database.types.ts` is simply inaccurate and any future code written "by the types" will be wrong.
- **Recommended fix:** First, **verify the actual runtime shape** by inspecting how `SupabaseResumeRepository.create()` / the role-selection equivalent currently consume the RPC result (does it index `[0]` or use it directly as an object?). Then either:
  - (a) If the repository code treats it as a single object (likely correct for `returns resumes`), regenerate `database.types.ts` from the live schema (`supabase gen types typescript`) so `Returns` becomes a single `ResumeRow`/`RoleSelectionRow` object type, not an array — eliminating the silent type/runtime mismatch; or
  - (b) If broader consistency with other `setof`-returning RPCs is desired, change the SQL functions to `returns setof resumes` / `returns setof role_selections` (so PostgREST returns an array matching the existing generated types), and have the repository take `data[0]`.
  Either way, run the repository's existing Vitest suite afterward — the mocked Supabase client in tests may currently be masking this exact mismatch by not modeling PostgREST's real RPC response shape.

---

### 2. Doc drift: `database.md` §2 shows nullable `text` columns; migration declares `text not null default ''`

- **Severity:** Low
- **File:** `docs/database.md:48,50,70` vs. `supabase/migrations/20260612000002_tables.sql:28,30,46`
- **Location:** `jobs.location_raw`, `jobs.description`, `resumes.parsed_text`
- **Description:** See architecture-audit Finding #5 — same issue, included here for database-review completeness. The implementation (`not null default ''`) is consistent with `database.types.ts` (non-nullable `string`) and with how `SupabaseJobRepository`/`SupabaseResumeRepository` consume these fields (no null-checks). The doc's SQL snippet is the stale artifact.
- **Why it matters:** A migration author trusting `database.md` as the schema reference could add a nullable column inconsistent with the rest of the schema and the generated types, causing null-handling bugs downstream.
- **Recommended fix:** Sync `database.md` §2 with the actual migration files.

---

### 3. Doc drift: `repositories.md` §3 shows `set_active_resume(new_resume jsonb)`; actual signature is 3 scalar params

- **Severity:** Low
- **File:** `docs/repositories.md:81` vs. `supabase/migrations/20260612000004_functions.sql:11-15`
- **Description:** See architecture-audit Finding #6. Implementation signature (`p_file_path text, p_parsed_text text, p_skills text[]`) is fine and matches `database.types.ts`; only the doc is stale.
- **Why it matters:** Low — descriptive drift only.
- **Recommended fix:** Update `repositories.md` §3 to the 3-parameter signature.

---

## Summary of Compliant Areas (no action needed)

- **Enums** (`job_source`, `location_tag`, `role_map_source`, `scrape_run_status`) in `20260612000001_enums.sql` match `database.md` §1 exactly (values, ordering, naming).
- **Indexes** in `20260612000003_indexes.sql` match `database.md` §6 / AD-09 exactly: `companies_source_token_uq` (unique on `source, board_token` where `board_token is not null`), `companies_active_idx`, `jobs_location_tags_idx` (GIN on `location_tags`), `jobs_posted_at_idx`, `jobs_first_seen_idx`, `resumes_single_active_uq` (partial unique on `is_active` where true), `role_selections_single_active_uq` (same pattern), `job_scores_ai_score_idx`, `job_scores_role_selection_idx`, `scrape_runs_run_at_idx`.
- **"Single active" pattern** (AD-09): partial unique indexes on `resumes` and `role_selections` correctly enforce at most one `is_active = true` row each, and the atomic-swap RPCs (`set_active_resume`, `set_active_role_selection`) deactivate-then-insert in a single transaction, avoiding a race window where two rows could be active simultaneously. (Return-type concern is Finding #1, separate from the swap logic itself, which is correct.)
- **Dedup strategy**: `jobs` table has a unique constraint on `(source, source_job_id)` matching database.md §5 and AD-08/scrapers.md normalization — `SupabaseJobRepository.upsertMany` upserts on this conflict target.
- **RLS** (`20260612000005_rls.sql`): all 8 tables (`companies`, `jobs`, `resumes`, `role_selections`, `role_expansion_map`, `job_scores`, `notifications_log`, `scrape_runs`) have RLS enabled with a single `authenticated_full_access` policy (`for all to authenticated using (true) with check (true)`), matching AD-12's "single-user app, authenticated-role full access + service-role bypass" model. No table is missing RLS.
- **Seed data** (`seed.sql`): 10 `role_expansion_map` rows with `source = 'seed'`, `on conflict (role) do nothing` — idempotent, matches AD-06 and database.md §3.
- **Forward-only migrations** (AD-11): all 5 migration files are sequentially numbered (`20260612000001`–`20260612000005`), each additive (enums → tables → indexes → functions → RLS), no `down` migrations or destructive `alter`/`drop` statements present — consistent with AD-11.
- **Foreign keys / relationships**: `jobs.company_id → companies.id`, `job_scores.job_id → jobs.id`, `job_scores.role_selection_id → role_selections.id`, `notifications_log.job_score_id → job_scores.id` all present and match the `database.md` §4 ERD.
