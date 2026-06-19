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
        U["Upsert jobs\n(source + source_job_id)"]
        L["Log scrape_run\n(timing + counts)"]
    end

    sources --> N --> F --> T --> D --> U --> L
```

---

## 5. Scoring Pipeline

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

---

## 6. Notification Pipeline

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

## 7. Authentication Flow

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

## 8. Database Access Matrix

| Caller | Client | Key | RLS |
|---|---|---|---|
| RSC / client components | `browserClient` | anon key | enforced |
| Server actions | `serverClient` (SSR) | anon key + session | enforced |
| Cron scripts | `serviceClient` | service role key | **bypassed** |

The service role is **only** imported in `scripts/` — enforced by the `check:service-role-boundary` CI gate.

---

## 9. Shared Infrastructure (`src/shared/`)

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
