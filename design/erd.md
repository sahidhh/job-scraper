# Entity Relationship Diagram

## 1. ERD (Text Notation)

```
┌──────────────────────────────────────────────────────────────┐
│ companies                                                     │
│──────────────────────────────────────────────────────────────│
│ id          uuid PK                                          │
│ name        text NOT NULL                                    │
│ source      job_source NOT NULL  (greenhouse|lever|ashby)    │
│ board_token text                                             │
│ active      boolean DEFAULT true                             │
│ created_at  timestamptz DEFAULT now()                        │
└──────────────────────────┬───────────────────────────────────┘
                           │ companies.id = jobs.company_id
                           │ (nullable — wellfound/remoteok have no company row)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ jobs                                                         │
│──────────────────────────────────────────────────────────────│
│ id             uuid PK DEFAULT gen_random_uuid()             │
│ source         job_source NOT NULL                           │
│ source_job_id  text NOT NULL                                 │
│ company_id     uuid FK → companies.id (nullable)             │
│ company_name   text NOT NULL                                 │
│ title          text NOT NULL                                 │
│ location_raw   text NOT NULL                                 │
│ location_tags  location_tag[] NOT NULL DEFAULT '{}'          │
│ description    text NOT NULL DEFAULT ''                      │
│ url            text NOT NULL                                 │
│ posted_at      timestamptz                                   │
│ first_seen_at  timestamptz NOT NULL DEFAULT now()            │
│ updated_at     timestamptz NOT NULL DEFAULT now()            │
│ min_years      integer                                       │
│──────────────────────────────────────────────────────────────│
│ UNIQUE (source, source_job_id)                               │
│ INDEX (location_tags) GIN                                    │
└───────────┬─────────────────────┬────────────────────────────┘
            │                     │
            │ jobs.id = job_scores.job_id
            │                     │ jobs.id = job_state.job_id
            ▼                     ▼
┌──────────────────────┐  ┌────────────────────────────────────┐
│ job_scores           │  │ job_state                          │
│──────────────────────│  │────────────────────────────────────│
│ id               uuid│  │ job_id    uuid FK → jobs.id UNIQUE │
│ job_id           uuid│  │ status_id uuid FK → job_statuses.id│
│  FK → jobs.id        │  │────────────────────────────────────│
│ role_selection_id uuid│  │ (one row per job)                 │
│  FK → role_sel..id   │  └────────────────────┬───────────────┘
│ keyword_score    real│                        │
│ ai_score         real│        ┌───────────────▼────────────────┐
│ ai_reasoning     text│        │ job_statuses                   │
│ scored_at  timestamptz        │────────────────────────────────│
│──────────────────────│        │ id         uuid PK             │
│ UNIQUE(job_id,       │        │ label      text NOT NULL       │
│   role_selection_id) │        │ color      text NOT NULL       │
│ INDEX (ai_score DESC │        │ sort_order integer NOT NULL    │
│   NULLS LAST)        │        └────────────────────────────────┘
└──────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ role_selections                                              │
│──────────────────────────────────────────────────────────────│
│ id              uuid PK DEFAULT gen_random_uuid()            │
│ primary_role    text NOT NULL                                │
│ expanded_roles  text[] NOT NULL DEFAULT '{}'                 │
│ created_at      timestamptz NOT NULL DEFAULT now()           │
│ is_active       boolean NOT NULL DEFAULT false               │
│──────────────────────────────────────────────────────────────│
│ UNIQUE (is_active) WHERE is_active = true                    │
└──────────────────────────┬───────────────────────────────────┘
                           │ role_selections.id = job_scores.role_selection_id

┌──────────────────────────────────────────────────────────────┐
│ resumes                                                      │
│──────────────────────────────────────────────────────────────│
│ id           uuid PK DEFAULT gen_random_uuid()               │
│ file_path    text NOT NULL  (Supabase Storage path)          │
│ parsed_text  text NOT NULL                                   │
│ skills       text[] NOT NULL DEFAULT '{}'                    │
│ uploaded_at  timestamptz NOT NULL DEFAULT now()              │
│ is_active    boolean NOT NULL DEFAULT false                  │
│──────────────────────────────────────────────────────────────│
│ UNIQUE (is_active) WHERE is_active = true                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ role_expansion_map                                           │
│──────────────────────────────────────────────────────────────│
│ role           text PK                                       │
│ related_roles  text[] NOT NULL DEFAULT '{}'                  │
│ source         role_map_source NOT NULL  (seed|ai)           │
│ created_at     timestamptz NOT NULL DEFAULT now()            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ notifications_log                                            │
│──────────────────────────────────────────────────────────────│
│ id      uuid PK DEFAULT gen_random_uuid()                    │
│ job_id  uuid UNIQUE FK → jobs.id                             │
│ sent_at timestamptz NOT NULL DEFAULT now()                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ scrape_runs                                                  │
│──────────────────────────────────────────────────────────────│
│ id          uuid PK DEFAULT gen_random_uuid()                │
│ source      text NOT NULL                                    │
│ status      scrape_run_status NOT NULL (success|partial|failed)│
│ jobs_found  integer NOT NULL DEFAULT 0                       │
│ error       text                                             │
│ created_at  timestamptz NOT NULL DEFAULT now()               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ app_settings                                                 │
│──────────────────────────────────────────────────────────────│
│ key         text PK                                          │
│ value       jsonb NOT NULL                                   │
│ updated_at  timestamptz NOT NULL DEFAULT now()               │
└──────────────────────────────────────────────────────────────┘
```

## 2. Enums

| Enum | Values |
|---|---|
| `job_source` | `greenhouse`, `lever`, `ashby`, `wellfound`, `remoteok`, `mycareersfuture` |
| `location_tag` | `india`, `singapore`, `uae`, `remote` |
| `role_map_source` | `seed`, `ai` |
| `scrape_run_status` | `success`, `partial`, `failed` |

## 3. Key Relationships

| Relationship | Cardinality | Notes |
|---|---|---|
| jobs → companies | N:1 (nullable) | Greenhouse/Lever/Ashby have a company row; Wellfound/RemoteOK/MCF do not |
| job_scores → jobs | N:1 | Each (job, role_selection) pair has one score |
| job_scores → role_selections | N:1 | Score is specific to one role selection |
| job_state → jobs | 1:1 | One status assignment per job (UNIQUE on job_id) |
| job_state → job_statuses | N:1 | Many jobs can share one status |
| notifications_log → jobs | 1:1 | UNIQUE on job_id prevents double-notifications |

## 4. Database Functions (RPC)

### `set_active_resume(file_path, parsed_text, skills[])`
Atomically:
1. Sets `is_active = false` on all existing resumes
2. Inserts new resume row with `is_active = true`
3. Returns the new resume row

### `set_active_role_selection(primary_role, expanded_roles[])`
Atomically:
1. Sets `is_active = false` on all existing role_selections
2. Inserts new role_selection row with `is_active = true`
3. Returns the new role_selection row

## 5. Indexes Summary

| Table | Index | Type | Purpose |
|---|---|---|---|
| jobs | `(source, source_job_id)` | UNIQUE | Dedup on ingest |
| jobs | `(location_tags)` | GIN | Array containment queries |
| job_scores | `(job_id, role_selection_id)` | UNIQUE | One score per job+role pair |
| job_scores | `(ai_score DESC NULLS LAST)` | BTREE | Sort dashboard by relevance |
| job_scores | `(role_selection_id)` | BTREE | Filter scores by active role |
| resumes | `(is_active) WHERE is_active=true` | PARTIAL UNIQUE | Enforce single active resume |
| role_selections | `(is_active) WHERE is_active=true` | PARTIAL UNIQUE | Enforce single active role |
| companies | `(source, board_token) WHERE board_token IS NOT NULL` | PARTIAL UNIQUE | Prevent duplicate board configs |

## 6. Storage

| Bucket | Access | Contents |
|---|---|---|
| `resumes` | Private, `authenticated` role | Uploaded PDF files; path is stored in `resumes.file_path` |
