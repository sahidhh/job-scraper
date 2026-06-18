# Technical Design — Job Intelligence Platform

## 1. Overview

The Job Intelligence Platform is a single-user, self-hosted web application that automates job discovery, filtering, scoring, and notification. It scrapes postings from six ATS/job-board sources, enriches them with AI-powered relevance scoring, and delivers high-match alerts over Telegram — all driven by the user's uploaded resume and chosen target role.

## 2. Goals

| Goal | Description |
|---|---|
| Automated discovery | Continuously ingest fresh postings from Greenhouse, Lever, Ashby, Wellfound, RemoteOK, and MyCareersFuture |
| Relevance filtering | Surface only postings relevant to the user's role and geography |
| Two-stage scoring | Cheap keyword pass first; expensive AI call only for strong keyword matches |
| Proactive notification | Telegram alerts for postings that pass the AI threshold |
| Self-service configuration | Web UI for resume, role, company board-tokens, and status workflow |
| Observability | Scrape-run logs, status breakdowns, and insight charts |

## 3. Non-Goals

- Multi-user / multi-tenant support
- Applying to jobs on the user's behalf
- Resume generation or editing beyond skill tagging
- Job aggregation across geographies outside India, Singapore, UAE, Remote

## 4. Design Principles

1. **Clean Architecture** — domain → application → infrastructure; no circular dependencies.
2. **Single Source of Truth** — Supabase Postgres is the only database; no secondary caches outside the database.
3. **Fail-safe scoring** — AI failures leave `ai_score` null; the scoring script retries on the next cron run.
4. **At-most-once notifications** — `notifications_log` with a unique job_id index prevents duplicate Telegram messages.
5. **Service-role isolation** — `SUPABASE_SERVICE_ROLE_KEY` is used exclusively in cron scripts, never in app/ code.
6. **Explicit over implicit** — all server actions return typed `ActionResult<T>`; errors are never silently swallowed.

## 5. System Components

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Actions (Cron)                                           │
│  ┌──────────────────┐   ┌──────────────────┐  ┌──────────────┐  │
│  │  scripts/scrape  │ → │  scripts/score   │→ │scripts/notify│  │
│  └──────────────────┘   └──────────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
          │ upsert jobs             │ upsert scores       │ mark notified
          ▼                         ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres 14.5 + Auth + Storage)                       │
│  jobs │ companies │ job_scores │ resumes │ role_selections │ ...  │
└──────────────────────────────────────────────────────────────────┘
          ▲                         ▲
          │ server actions          │ server actions
┌─────────────────────┐   ┌────────────────────────┐
│  Next.js App (Vercel)│   │  External APIs          │
│  /dashboard         │   │  OpenRouter (AI scoring) │
│  /roles             │   │  Telegram Bot API        │
│  /resume            │   │  ATS board APIs          │
│  /settings          │   └────────────────────────┘
│  /analytics         │
│  /insights          │
└─────────────────────┘
```

## 6. Data Flow

### 6.1 Scrape Pipeline (Cron, every 2 hours)

```
For each active company (greenhouse/lever/ashby):
  → Fetch postings from ATS board API
  → Normalize to RawJob[]
  → Filter by expanded role keywords (client-side)
  → tagLocations() → attach location_tags
  → Drop jobs with empty location_tags
  → Upsert into jobs table (dedup on source + source_job_id)
  → Log scrape_run row (success/partial/failed)

Also fetch from:
  Wellfound feed (if WELLFOUND_FEED_URL set)
  RemoteOK public RSS
  MyCareersFuture public API
```

### 6.2 Scoring Pipeline (Cron, after scrape)

```
Load active resume + active role_selection
For each unscored job (matching expanded roles):
  → computeKeywordScore(resume.skills, job.description+title)
  → If keywordScore >= KEYWORD_THRESHOLD (default 0.25):
      → AI call via OpenRouter (15s timeout, 1 retry)
      → Store ai_score + ai_reasoning
  → Upsert job_scores row
```

### 6.3 Notification Pipeline (Cron, after scoring)

```
Find: ai_score >= NOTIFY_THRESHOLD (default 0.75) AND no notifications_log row
For each match (isolated):
  → Format Telegram HTML message
  → POST to Bot API (handle 429 retry_after)
  → Upsert notifications_log row (mark sent)
```

### 6.4 User Interaction (Web)

```
User → Next.js Server Action → Supabase (anon key via SSR session)
                             ↳ revalidatePath() → fresh dashboard data
```

## 7. Key Modules

| Module | Path | Responsibility |
|---|---|---|
| sources | src/features/sources | Six ATS/board scrapers, RawJob normalization |
| jobs | src/features/jobs | Persistence, dedup, dashboard queries, status CRUD |
| filtering | src/features/filtering | Location tag inference from raw location strings |
| resume | src/features/resume | PDF upload, text extraction, skill tagging |
| roles | src/features/roles | Role selection, AI expansion, role_expansion_map cache |
| scoring | src/features/scoring | Two-stage keyword+AI scoring pipeline |
| notifications | src/features/notifications | Telegram message formatting and delivery |
| insights | src/features/insights | Analytics computations (skill gaps, charts) |
| companies | src/features/companies | Board-token CRUD for Greenhouse/Lever/Ashby |
| settings | src/features/settings | User preferences (desired experience years) |
| shared | src/shared | HTTP utilities, Supabase clients, domain primitives |

## 8. Error Handling Strategy

| Scenario | Behavior |
|---|---|
| Scraper returns empty results | Log scrape_run as `partial`; continue with other sources |
| AI call times out | Leave ai_score null; retried on next scoring run |
| Telegram rate-limited | Honor `retry_after` header (capped 30s); retry once |
| Server action fails | Return `{ ok: false, error: string }` — never throw to client |
| Service-role in app/ | Blocked by CI check (`npm run check:service-role-boundary`) |

## 9. Configuration

All runtime behavior is controlled via environment variables. See [tech-stack.md](tech-stack.md) for the full list and defaults.

## 10. Testing Approach

- **Unit tests** with vitest covering all application-layer use-cases and infrastructure adapters.
- **Mocked dependencies** — no live network or database calls in tests.
- **CI gate** — type-check, unit tests, and service-role boundary check must pass before merge.
- No end-to-end or integration tests (single-user app; manual verification against dev Supabase).
