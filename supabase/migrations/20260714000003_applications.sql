-- merge-workspace Phase 4: application drafting (draft -> review -> send,
-- mailto only for now -- decisions.md AD-34). One row per (job_id, kind);
-- redrafting overwrites an existing 'draft'/'dismissed' row in place but a
-- 'sent' row is immutable (enforced in application/draftApplication.ts, not
-- here -- same "constraints live in the domain layer" precedent as
-- resume_suggestions' resumeId-mismatch check).

create table applications (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id) on delete cascade,
  resume_id        uuid not null references resumes(id) on delete cascade,
  kind             text not null default 'email' check (kind in ('email', 'coverletter')),
  subject          text not null default '',
  body             text not null default '',
  recipient_email  text,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'dismissed')),
  model            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz,
  unique (job_id, kind)
);

-- Feeds notifyPendingDrafts' reminder query (status = 'draft').
create index applications_status_idx on applications (status);

alter table applications enable row level security;

-- Same single-user "authenticated_full_access" shape as every other table
-- (20260612000005_rls.sql) -- this app has one authenticated owner, not
-- per-row multi-tenant ownership.
create policy "authenticated_full_access" on applications
  for all to authenticated using (true) with check (true);
