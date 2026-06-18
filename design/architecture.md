# System Architecture

## 1. Clean Architecture Layers

The codebase enforces a strict four-layer hierarchy. Dependencies only flow inward.

```
┌─────────────────────────────────────────────────────────┐
│  Presentation Layer                                      │
│  app/**/page.tsx · app/**/actions.ts · scripts/*.ts     │
│  (composition root — wires concrete deps)                │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                    │
│  src/features/*/infrastructure/                         │
│  Supabase repos · OpenRouter client · scrapers          │
├─────────────────────────────────────────────────────────┤
│  Application Layer                                       │
│  src/features/*/application/                            │
│  Use-cases · pure business logic · no I/O               │
├─────────────────────────────────────────────────────────┤
│  Domain Layer                                            │
│  src/features/*/domain/                                 │
│  Interfaces · value types · zero dependencies           │
└─────────────────────────────────────────────────────────┘
```

### Layer Rules

| Rule | Enforcement |
|---|---|
| Domain has zero imports from other layers | TypeScript strict + code review |
| Application depends only on domain interfaces | Interfaces injected as function args |
| Infrastructure implements domain interfaces | Concrete classes satisfy interfaces |
| No feature imports another feature's infrastructure | Module boundary review |
| Shared/ has no feature dependencies | Import direction check |

## 2. Feature Module Structure

Each feature follows the same directory layout:

```
src/features/<feature>/
  domain/
    types.ts          # interfaces and value types
    errors.ts         # domain-specific error types (optional)
  application/
    <use-case>.ts     # pure function, deps injected
    <use-case>.test.ts
  infrastructure/
    Supabase<Repo>.ts      # implements domain interface
    Supabase<Repo>.test.ts
  actions.ts          # Next.js server actions (presentation)
```

## 3. Runtime Topology

```
┌───────────────────────────────────────────────────────────┐
│                   VERCEL (Next.js 15)                      │
│                                                           │
│  Browser ──── RSC/Client components                       │
│                    │                                      │
│                    ▼                                      │
│  Server Actions ("use server")                            │
│    ├── anon Supabase client (SSR session)                 │
│    └── revalidatePath on mutations                        │
└────────────────────────────┬──────────────────────────────┘
                             │ Supabase JS SDK (anon key)
                             ▼
┌──────────────────────────────────────────────────────────┐
│              SUPABASE                                     │
│  Postgres 14.5   Auth   Storage (resumes bucket)         │
│  ── RLS policies enforce authenticated access ──         │
└────────────────────────────┬─────────────────────────────┘
                             ▲ service role key
                             │
┌───────────────────────────────────────────────────────────┐
│              GITHUB ACTIONS (Cron)                        │
│                                                           │
│  scrape.yml (every 2 hours)                               │
│    scrape.ts ──► score.ts ──► notify.ts                   │
│                                                           │
│  ci.yml (on push/PR)                                      │
│    tsc --noEmit │ vitest run │ check:service-role-boundary │
└──────────────────┬──────────────────────────┬────────────┘
                   │                          │
                   ▼                          ▼
        OpenRouter API               Telegram Bot API
        (AI scoring)                 (push notifications)
```

## 4. Component Interaction Diagram

```
User Browser
    │
    │ HTTPS
    ▼
Next.js App (Vercel Edge + Node)
    │
    ├── /login        ── Supabase Auth (email+password)
    ├── /dashboard    ── SupabaseJobRepository.findForDashboard()
    ├── /roles        ── expandRoleAction → OpenRouter (if cache miss)
    ├── /resume       ── uploadResumeAction → Storage → pdf-parse → skills
    ├── /settings     ── setCompanyAction / setDesiredExperienceAction
    ├── /analytics    ── compute* analytics functions (read-only)
    └── /insights     ── computeSkillGaps() / computeSkillDemand()
    │
    └── Supabase (all reads+writes via anon key + RLS)

GitHub Actions (Cron)
    │
    ├── scripts/scrape.ts
    │     ├── GreenhouseScraper (per active company)
    │     ├── LeverScraper (per active company)
    │     ├── AshbyScraper (per active company)
    │     ├── WellfoundScraper (feed URL)
    │     ├── RemoteOkScraper (public RSS)
    │     └── MyCareersFutureScraper (public API)
    │
    ├── scripts/score.ts
    │     ├── computeKeywordScore() [pure, always]
    │     └── OpenRouterAiScoreProvider [if keyword ≥ threshold]
    │
    └── scripts/notify.ts
          └── TelegramBotSender [per high-score unnotified job]
```

## 5. Shared Infrastructure

Located in `src/shared/`:

| Module | Purpose |
|---|---|
| `infrastructure/http.ts` | `fetchWithRetry` — 1 retry, 2s delay, used by all scrapers + API clients |
| `infrastructure/supabase/browserClient.ts` | Singleton Supabase client for RSC/client components |
| `infrastructure/supabase/serverClient.ts` | Cookie-based SSR Supabase client (server actions) |
| `infrastructure/supabase/serviceClient.ts` | Service role client — scripts only, never imported in app/ |
| `infrastructure/openrouterClient.ts` | OpenRouter chat completions with timeout + retry |
| `config/env.ts` | Validated env var access |
| `domain/skillsDictionary.ts` | Canonical skill names list |
| `domain/roleExpansionMap.ts` | Seed role-to-related-roles map |

## 6. Authentication Flow

```
1. User navigates to /login
2. Submits email + password → Supabase Auth API
3. Supabase sets session cookies (httpOnly)
4. middleware.ts (Supabase SSR) refreshes session on every request
5. Server actions call createServerClient() → reads session from cookies
6. Unauthenticated requests are redirected to /login by middleware
7. No JWT manipulation or custom session logic
```

## 7. Cron Orchestration

The three cron scripts are executed sequentially within the same GitHub Actions job:

```yaml
# .github/workflows/scrape.yml
steps:
  - run: npx tsx scripts/scrape.ts
  - run: npx tsx scripts/score.ts
  - run: npx tsx scripts/notify.ts
```

Each script is independently idempotent — re-running any step is safe:
- scrape.ts: upserts on (source, source_job_id)
- score.ts: skips already-scored jobs
- notify.ts: skips already-notified jobs (notifications_log)

## 8. Database Access Patterns

| Caller | Client | Key |
|---|---|---|
| Next.js server actions | SSR Supabase client | anon key + session cookies |
| RSC / client components | browser Supabase client | anon key |
| Cron scripts | service client | service role key (bypasses RLS) |

RLS policies on all tables allow `authenticated` role full access. Scripts bypass RLS entirely via the service role — this is intentional and explicitly scoped to scripts/ only.
