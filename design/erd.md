# Entity Relationship Diagram

## Full ERD

```mermaid
erDiagram
    COMPANIES {
        uuid id PK
        text name
        text source "greenhouse | lever | ashby"
        text board_token
        boolean active
        timestamptz created_at
    }

    JOBS {
        uuid id PK
        text source "greenhouse | lever | ashby | wellfound | remoteok | mycareersfuture"
        text source_job_id
        uuid company_id FK "nullable"
        text company_name
        text title
        text location_raw
        text[] location_tags "india | singapore | uae | remote"
        text description
        text url
        timestamptz posted_at "nullable"
        timestamptz first_seen_at
        timestamptz last_seen_at "updated on every upsert"
        timestamptz updated_at
        integer min_years "nullable"
        boolean is_active "false when not seen for JOB_EXPIRATION_DAYS"
        text inactive_reason "nullable; 'expired' when set by sweep"
    }

    JOB_SCORES {
        uuid id PK
        uuid job_id FK
        uuid role_selection_id FK
        real keyword_score "0.0 – 1.0, always set"
        real ai_score "0.0 – 1.0, null if below threshold or pending"
        text ai_reasoning "nullable"
        timestamptz scored_at
    }

    JOB_STATUSES {
        uuid id PK
        text label
        text color "CSS color string"
        integer sort_order
    }

    JOB_STATE {
        uuid job_id PK "FK → JOBS"
        uuid status_id FK "FK → JOB_STATUSES"
    }

    ROLE_SELECTIONS {
        uuid id PK
        text primary_role
        text[] expanded_roles
        timestamptz created_at
        boolean is_active "UNIQUE partial index where true"
    }

    RESUMES {
        uuid id PK
        text file_path "Supabase Storage path"
        text parsed_text
        text[] skills
        timestamptz uploaded_at
        boolean is_active "UNIQUE partial index where true"
    }

    ROLE_EXPANSION_MAP {
        text role PK
        text[] related_roles
        text source "seed | ai"
        timestamptz created_at
    }

    NOTIFICATIONS_LOG {
        uuid id PK
        uuid job_id UK "UNIQUE — one send per job"
        timestamptz sent_at
    }

    SCRAPE_RUNS {
        uuid id PK
        text source
        text status "success | partial | failed"
        integer jobs_found
        text error "nullable"
        timestamptz created_at
    }

    APP_SETTINGS {
        text key PK
        jsonb value
        timestamptz updated_at
    }

    COMPANIES ||--o{ JOBS : "has (nullable)"
    JOBS ||--o{ JOB_SCORES : "scored by"
    ROLE_SELECTIONS ||--o{ JOB_SCORES : "scopes"
    JOBS ||--o| JOB_STATE : "has status"
    JOB_STATUSES ||--o{ JOB_STATE : "assigned to"
    JOBS ||--o| NOTIFICATIONS_LOG : "notified once"
```

---

## Key Constraints

| Table | Constraint | Purpose |
|---|---|---|
| `jobs` | `UNIQUE (source, source_job_id)` | Dedup on every ingest run |
| `jobs` | `GIN INDEX (location_tags)` | Fast array containment queries |
| `job_scores` | `UNIQUE (job_id, role_selection_id)` | One score per job+role pair |
| `job_scores` | `INDEX (ai_score DESC NULLS LAST)` | Dashboard sorted by relevance |
| `resumes` | `UNIQUE (is_active) WHERE is_active = true` | Enforce single active resume |
| `role_selections` | `UNIQUE (is_active) WHERE is_active = true` | Enforce single active role |
| `notifications_log` | `UNIQUE (job_id)` | Guarantee at-most-one Telegram send |
| `companies` | `UNIQUE (source, board_token) WHERE board_token IS NOT NULL` | No duplicate board configs |

---

## Database Functions (RPC)

### `set_active_resume(file_path, parsed_text, skills[])`

```
1. UPDATE resumes SET is_active = false   -- deactivate previous
2. INSERT INTO resumes (…, is_active = true)  -- activate new
3. RETURN new row
```

### `set_active_role_selection(primary_role, expanded_roles[])`

```
1. UPDATE role_selections SET is_active = false   -- deactivate previous
2. INSERT INTO role_selections (…, is_active = true)  -- activate new
3. RETURN new row
```

Both functions run in a single transaction, ensuring exactly one active record at all times.

---

## Enum Values

```
job_source        → greenhouse, lever, ashby, wellfound, remoteok, mycareersfuture
location_tag      → india, singapore, uae, remote
role_map_source   → seed, ai
scrape_run_status → success, partial, failed
```

---

## Storage

| Bucket | Access | Content |
|---|---|---|
| `resumes` | Private — `authenticated` role only | Uploaded PDF files; path stored in `resumes.file_path` |
