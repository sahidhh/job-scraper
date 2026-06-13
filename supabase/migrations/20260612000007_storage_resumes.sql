-- deployment-readiness.md Finding #1/#2: the `resumes` Storage bucket
-- referenced by features/resume/actions.ts (RESUME_BUCKET = "resumes")
-- was created by nothing -- no migration, seed, or setup script. A fresh
-- Supabase project has no bucket, so the first resume upload fails with a
-- "bucket not found" error, and even once the bucket exists, storage.objects
-- has no policy granting the `authenticated` role access to it.
--
-- Fix: create the bucket (private) and a single storage.objects policy
-- scoped to bucket_id = 'resumes', following the same single-policy-per-
-- table shape as 20260612000005_rls.sql (AD-12). storage.objects already
-- has RLS enabled by default in Supabase; the service-role key used by
-- cron scripts bypasses storage policies the same way it bypasses table RLS.

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "authenticated_full_access_resumes" on storage.objects
  for all to authenticated
  using (bucket_id = 'resumes')
  with check (bucket_id = 'resumes');
