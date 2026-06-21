-- Stores worth-reviewing job IDs per digest run for Telegram pagination.
-- pagination_message_id is set on first "Worth Reviewing" page tap.
create table digest_sessions (
  id                       uuid        primary key default gen_random_uuid(),
  role_selection_id        uuid        not null,
  worth_reviewing_job_ids  text[]      not null default '{}',
  pagination_message_id    bigint,
  created_at               timestamptz not null default now()
);

create index digest_sessions_created_at_idx on digest_sessions (created_at desc);
