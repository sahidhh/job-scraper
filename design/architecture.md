# System Architecture

## 1. Clean Architecture Layers

Dependencies flow strictly inward — outer layers depend on inner, never the reverse.

```mermaid
flowchart TB
    subgraph P ["🖥️ Presentation Layer"]
        PA["app/**/page.tsx\napp/**/actions.ts\nscripts/*.ts\n(composition root)"]
    end
    subgraph I ["🔧 Infrastructure Layer"]
        IA["src/features/*/infrastructure/\nSupabase repos · scrapers · API clients"]
    end
    subgraph A ["⚙️ Application Layer"]
        AA["src/features/*/application/\nUse-cases · pure business logic · no I/O"]
    end
    subgraph D ["🏛️ Domain Layer"]
        DA["src/features/*/domain/\nInterfaces · value types · zero dependencies"]
    end

    P --> I --> A --> D

    style D fill:#1e3a5f,color:#fff
    style A fill:#1a4731,color:#fff
    style I fill:#4a2020,color:#fff
    style P fill:#3d2b00,color:#fff
```

### Layer Rules

| Rule | Enforcement |
|---|---|
| Domain has zero imports from other layers | TypeScript strict + code review |
| Application depends only on domain interfaces | Interfaces injected as function args |
| Infrastructure implements domain interfaces | Concrete classes satisfy interfaces |
| No feature imports another feature's infrastructure | Module boundary review |
| `shared/` has no feature dependencies | Import direction check |

---

## 2. Feature Module Structure

Every feature follows the same layout:

```
src/features/<feature>/
  domain/
    types.ts          ← interfaces and value types
    errors.ts         ← domain-specific errors (optional)
  application/
    <use-case>.ts     ← pure function, deps injected
    <use-case>.test.ts
  infrastructure/
    Supabase<Repo>.ts      ← implements domain interface
    Supabase<Repo>.test.ts
  actions.ts          ← Next.js server actions (presentation)
```

---

## 3. Runtime Topology

```mermaid
flowchart TB
    subgraph vercel ["💻 Vercel — Next.js 15"]
        Browser["🌐 Browser\n(RSC + Client)"]
        Actions["Server Actions\n(use server)"]
        Browser <--> Actions
    end

    subgraph supabase ["🗄️ Supabase"]
        PG["Postgres 14.5"]
        Auth["Auth"]
        Storage["Storage\n(resumes bucket)"]
    end

    subgraph gha ["⏱️ GitHub Actions"]
        Validate["scripts/validate-sources.ts"]
        Scrape["scripts/scrape.ts"]
        Score["scripts/score.ts"]
        Notify["scripts/notify.ts"]
        Scrape --> Score --> Notify
    end

    Actions <-->|"anon key\n+ session cookies"| PG
    Actions --> Auth
    Scrape -->|"service role key"| PG
    Score -->|"service role key"| PG
    Notify -->|"service role key"| PG

    Score -->|"AI scoring"| OpenRouter["🤖 OpenRouter API"]
    Notify -->|"push alerts"| Telegram["📱 Telegram Bot API"]
    Scrape -->|"board APIs"| ATS["📋 ATS APIs\n(Greenhouse/Lever/Ashby/…)"]
    Validate -->|"board probe"| ATS
    Actions --> Storage
```

---

## 4. Scrape Pipeline

```mermaid
flowchart LR
    subgraph sources ["📡 Sources"]
        GH["Greenhouse\n(per company)"]
        LV["Lever\n(per company)"]
        AS["Ashby\n(per company)"]
        WF["Wellfound\n(feed URL)"]
        RO["RemoteOK\n(public RSS)"]
        MC["MyCareersFuture\n(public API)"]
    end

    subgraph pipeline ["🔄 Pipeline"]
        N["Normalize\n→ RawJob[]"]
        F["Role Filter\n(expanded_roles)"]
        T["tagLocations()\n→ location_tags"]
        D["Drop\n(empty tags)"]
        FP{"Fingerprint match?\n(cross-source dedup)"}
        SKIP["Skip insert\n→ job_duplicates (provenance)"]
        U["Upsert jobs\n(source + source_job_id)"]
        L["Log scrape_run\n(timing + counts + duplicates)"]
    end

    sources --> N --> F --> T --> D --> FP
    FP -- "yes, different source" --> SKIP --> L
    FP -- "no" --> U --> L
```

Cross-source duplicate detection (Phase 1 Task 1-3, `computeFingerprint.ts`): before a job with a
new `(source, source_job_id)` is inserted, its fingerprint (normalized title + canonical company +
sorted location tags) is checked against every existing job regardless of source. A match means the
same logical posting was already ingested elsewhere -- it is recorded in `job_duplicates` for
provenance instead of becoming a second `jobs` row, so scoring and notifications run once per
logical job. Jobs already known by `(source, source_job_id)` always go through the normal
update path, unaffected by the fingerprint check.

---

## 5. Source Health Tracking

```mermaid
flowchart TD
    PROBE["Probe ATS board\n(validate-sources.ts)"] --> OK{HTTP 200?}
    OK -- Yes --> RESET["Reset consecutive_failures = 0\nSet health_status = active\nSet last_success_at"]
    OK -- No --> INC["Increment consecutive_failures\nSet last_failure_at"]
    INC --> THRESH{≥ SOURCE_DISABLE_THRESHOLD?}
    THRESH -- No --> UNHEALTHY["Set health_status = unhealthy"]
    THRESH -- Yes --> DISABLED["Set health_status = disabled"]
    DISABLED --> SKIP["Skipped by scraper\n(listActiveHealthy)"]
```

The three health states:

| State | Meaning | Scraper behavior |
|---|---|---|
| `active` | Probing succeeds | Included in scrape runs |
| `unhealthy` | Consecutive failures below threshold | Included in scrape runs |
| `disabled` | Failures ≥ SOURCE_DISABLE_THRESHOLD | Excluded from scrape runs |

### 5.1 Source-Level Health Summary (Phase 1 Task 5/7)

The probe-based tracking above only covers board-token sources (greenhouse/lever/ashby) via their
`companies` rows, and only reacts to the separate `validate-sources.ts` cron -- a company whose
*actual scrape* fails is invisible to it until the next probe run (AD-13/AD-16 follow-up). A second,
independent signal now covers every source uniformly, including the feed-based ones with no
`companies` row (wellfound/remoteok/mycareersfuture):

```
scrape.ts catch/success path
  → classifyScrapeFailure(error) or 'empty_feed' (found_count === 0 on success)
  → scrape_runs.failure_category
  → computeSourceHealthSummary(source, recent scrape_runs)
  → { successRate, avgLatencyMs, consecutiveFailures, lastSuccessAt/lastFailureAt,
      recoveryDetected, topFailureCategory, recommendation }
  → getSourceHealthReport(): one summary per registered source
```

Failure categories (`classifyScrapeFailure.ts`, deterministic keyword/status heuristics, no AI):
`timeout | parsing | selector | captcha | blocked | authentication | rate_limited | not_found |
empty_feed | unknown`. `selector`/`captcha` are extension points -- no current adapter does
HTML/DOM scraping or hits a CAPTCHA wall. `getSourceHealthReport()` is surfaced on `/analytics`
(Phase 4 Task 13).

---

## 6. Scoring Pipeline

```mermaid
flowchart TD
    START(["Load active resume\n+ role_selection"]) --> QUERY["Find unscored jobs\n(matching expanded_roles)"]
    QUERY --> EACH["For each job"]
    EACH --> KW["computeKeywordScore()\nskill overlap → 0–1"]
    KW --> GATE{keyword_score\n≥ threshold?}
    GATE -- No --> SAVE_KW["Save keyword score only\n(ai_score = null)"]
    GATE -- Yes --> AI["OpenRouter AI call\n15s timeout, 1 retry"]
    AI --> AI_OK{Success?}
    AI_OK -- Yes --> SAVE_AI["Save keyword + ai_score\n+ ai_reasoning"]
    AI_OK -- No --> SAVE_KW2["Save keyword score only\n(retried next cron run)"]
    SAVE_KW --> NEXT
    SAVE_AI --> NEXT
    SAVE_KW2 --> NEXT
    NEXT["Next job"] --> EACH
```

Every save goes through the `upsert_job_score` RPC (erd.md), which atomically increments `retry_count`
whenever the write leaves `ai_score` null. After each `score.ts` run, `getScoringQueueReport()` (Phase 1
Task 6) queries `ScoreRepository.findAwaitingAi` (keyword gate passed, `ai_score IS NULL`, ordered
oldest `scored_at` first) and computes `{ awaitingAiCount, oldestPendingAgeHours, stuckJobs,
maxRetryCount, avgRetryCount }` via the pure `computeScoringQueueSummary`. "Stuck" jobs (waiting past
`SCORING_STUCK_THRESHOLD_HOURS`, default 48h) are logged as a warning -- AD-14 already retries
indefinitely, so this is visibility, not a new retry mechanism. `getScoringQueueReport()` is
surfaced on `/analytics` (Phase 4 Task 13).

---

## 7. Notification Pipeline

```mermaid
flowchart LR
    Q["Query: ai_score ≥ threshold\nAND NOT IN notifications_log"] --> EACH["For each match\n(isolated)"]
    EACH --> FMT["Format Telegram\nHTML message"]
    FMT --> SEND["POST to Bot API"]
    SEND --> OK{Success?}
    OK -- Yes --> LOG["Upsert notifications_log\n(prevents re-send)"]
    OK -- No --> SKIP["Log error\ncontinue to next"]
    LOG --> NEXT["Next match"]
    SKIP --> NEXT
```

---

## 8. Authentication Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant M as middleware.ts
    participant SA as Server Action
    participant SB as Supabase Auth

    U->>M: Request any route
    M->>SB: Refresh session (cookies)
    SB-->>M: Session valid / expired
    alt Not authenticated
        M-->>U: Redirect → /login
    end
    U->>SA: Submit form / action
    SA->>SB: createServerClient() (reads cookies)
    SB-->>SA: Authenticated session
    SA->>SA: Execute with anon key + RLS
    SA-->>U: ActionResult<T>
```

---

## 9. Database Access Matrix

| Caller | Client | Key | RLS |
|---|---|---|---|
| RSC / client components | `browserClient` | anon key | enforced |
| Server actions | `serverClient` (SSR) | anon key + session | enforced |
| Cron scripts | `serviceClient` | service role key | **bypassed** |

The service role is **only** imported in `scripts/` — enforced by the `check:service-role-boundary` CI gate.

---

## 10. Shared Infrastructure (`src/shared/`)

```mermaid
flowchart LR
    subgraph shared ["📦 src/shared/"]
        HTTP["http.ts\nfetchWithRetry()"]
        BC["supabase/browserClient"]
        SC["supabase/serverClient"]
        SVC["supabase/serviceClient"]
        OR["openrouterClient.ts"]
        ENV["config/env.ts"]
        DICT["domain/skillsDictionary.ts"]
        RMAP["domain/roleExpansionMap.ts"]
        ERR["supabaseError.ts\ntoAppError()"]
    end

    Features["src/features/*"] --> HTTP
    Features --> BC
    Features --> SC
    Scripts["scripts/*"] --> SVC
    Scripts --> OR
    Features --> ENV
    Features --> DICT
    Features --> RMAP
```
