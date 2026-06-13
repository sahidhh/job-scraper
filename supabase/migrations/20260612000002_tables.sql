-- Core tables. Primary keys, foreign keys, basic uniques, and check
-- constraints only. Performance/partial-unique indexes live in
-- 20260612000003_indexes.sql.

-- ============================================================
-- companies: board-token config for ATS sources (greenhouse/lever/ashby).
-- wellfound/remoteok use generic feeds and don't need rows here.
-- ============================================================
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  source      job_source not null,
  board_token text,                 -- null for sources that don't use one
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- jobs: normalized postings, deduped by (source, source_job_id)
-- ============================================================
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  source        job_source not null,
  source_job_id text not null,
  company_id    uuid references companies(id) on delete set null,
  company_name  text not null,
  title         text not null,
  location_raw  text not null default '',
  location_tags location_tag[] not null default '{}',
  description   text not null default '',
  url           text not null,
  posted_at     timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint jobs_source_source_job_id_uq unique (source, source_job_id)
);

-- ============================================================
-- resumes: uploaded resume + extracted skills. One active at a time
-- (enforced via partial unique index in 20260612000003_indexes.sql).
-- ============================================================
create table resumes (
  id          uuid primary key default gen_random_uuid(),
  file_path   text not null,        -- Supabase Storage path
  parsed_text text not null default '',
  skills      text[] not null default '{}',
  uploaded_at timestamptz not null default now(),
  is_active   boolean not null default false
);

-- ============================================================
-- role_selections: history of role choices; one active at a time
-- (enforced via partial unique index in 20260612000003_indexes.sql).
-- ============================================================
create table role_selections (
  id             uuid primary key default gen_random_uuid(),
  primary_role   text not null,
  expanded_roles text[] not null,
  created_at     timestamptz not null default now(),
  is_active      boolean not null default false
);

-- ============================================================
-- role_expansion_map: cache of role -> related roles (seed or AI-generated)
-- ============================================================
create table role_expansion_map (
  role          text primary key,   -- normalized lowercase, e.g. "full stack developer"
  related_roles text[] not null,
  source        role_map_source not null,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- job_scores: per-(job, role_selection) score. Rows are never updated
-- after creation except to set ai_score/ai_reasoning once (stage 2).
-- ============================================================
create table job_scores (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references jobs(id) on delete cascade,
  role_selection_id uuid not null references role_selections(id) on delete cascade,
  keyword_score     numeric(5,4) not null check (keyword_score >= 0 and keyword_score <= 1),
  ai_score          numeric(5,4) check (ai_score >= 0 and ai_score <= 1),
  ai_reasoning      text,
  scored_at         timestamptz not null default now(),

  constraint job_scores_job_role_uq unique (job_id, role_selection_id)
);

-- ============================================================
-- notifications_log: one row per job ever notified (idempotency guard)
-- ============================================================
create table notifications_log (
  id      uuid primary key default gen_random_uuid(),
  job_id  uuid not null references jobs(id) on delete cascade,
  sent_at timestamptz not null default now(),

  constraint notifications_log_job_id_uq unique (job_id)
);

-- ============================================================
-- scrape_runs: observability log for cron runs, surfaced in /settings
-- ============================================================
create table scrape_runs (
  id         uuid primary key default gen_random_uuid(),
  source     job_source not null,
  status     scrape_run_status not null,
  jobs_found integer not null default 0,
  error      text,
  run_at     timestamptz not null default now()
);
