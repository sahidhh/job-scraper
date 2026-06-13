# Migration Review: 20260612000007_storage_resumes.sql

## Checklist

- **Creates `resumes` bucket** — Yes. `insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false) on conflict do nothing`. Private bucket, idempotent insert. Matches `RESUME_BUCKET = "resumes"` in `src/features/resume/actions.ts:14`.

- **Creates storage policy** — Yes. `authenticated_full_access_resumes` on `storage.objects`, `for all to authenticated`, `using`/`with check` scoped to `bucket_id = 'resumes'`.

- **Follows existing RLS pattern** — Yes. Matches AD-12 single-policy-per-table shape from `20260612000005_rls.sql` (`for all to authenticated using (true) with check (true)`), adapted with a `bucket_id` scope since `storage.objects` is shared across buckets. Policy name suffixed `_resumes` to avoid collision with future bucket policies on same table — correct, since base pattern's unsuffixed name would clash.

- **No security concerns** — Bucket is private (`public: false`). Policy correctly scopes both `using` and `with check` to `bucket_id = 'resumes'`, preventing cross-bucket access via this policy. `storage.objects` has RLS enabled by default in Supabase (cannot be altered by migration owner), so no explicit `enable row level security` statement needed — comment correctly notes this. Service-role key (used by cron/scripts) bypasses storage policies same as table RLS, consistent with [[Row-Level-Security-RLS-Configuration-for-Single-User-Application]].

- **No architecture concerns** — Pure data/policy migration, no new abstractions, follows existing single-user full-access convention. Resolves deployment-readiness Finding #1/#2 (missing bucket causing "bucket not found" on fresh project).

## Notes

- `for all` grants insert/select/update/delete on `resumes`-bucket objects to the single authenticated user — appropriate for single-user app, consistent with table-level policies.
- `on conflict (id) do nothing` makes bucket creation safe to re-run.

## Decision

**APPROVED**
