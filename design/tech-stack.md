# Technology Stack

## 1. Overview

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| UI Framework | Next.js (App Router) | 15 | RSC, server actions, SSR without extra API layer |
| UI Language | TypeScript | 5 (strict) | Type safety across all layers |
| Styling | Tailwind CSS | 4 | Utility-first, minimal bundle |
| Component Library | shadcn/ui + Radix UI | latest | Accessible, unstyled primitives |
| Icons | Lucide React | latest | Consistent icon set |
| Charts | Recharts | latest | Lightweight React chart library |
| Database | Supabase (Postgres 14.5) | v2 | Managed Postgres + Auth + Storage in one service |
| Auth | Supabase Auth | — | Built-in, integrates with RLS |
| File Storage | Supabase Storage | — | Co-located with database, policy-gated |
| ORM / Query Layer | Supabase JS SDK (PostgREST) | v2.45 | No ORM (Prisma/Drizzle explicitly excluded) |
| Server-side Sessions | @supabase/ssr | v0.12 | Cookie-based SSR session management |
| Validation | Zod | v4 | Schema validation at system boundaries |
| AI / LLM | OpenRouter API | — | Multi-model gateway; model configurable via env |
| Notifications | Telegram Bot API | — | Simple HTTP delivery, no additional SDK |
| PDF Parsing | pdf-parse | — | Extract text from uploaded resumes |
| Testing | vitest | latest | Fast, TypeScript-native test runner |
| Script Runtime | tsx | latest | Execute TypeScript files directly (no build step) |
| Package Manager | npm | — | Standard Node.js package manager |

## 2. Excluded Technologies

These are explicitly banned by the project rules (CLAUDE.md):

| Technology | Reason |
|---|---|
| Prisma | Banned — use Supabase JS SDK + PostgREST |
| Drizzle ORM | Banned — same reason |
| Zustand | Banned — use React state + server actions |
| Redux | Banned — over-engineered for single-user app |
| React Query / TanStack Query | Banned — use Next.js RSC + `revalidatePath` |

## 3. Environment Variables

### Required — Next.js App (Vercel)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (exposed to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (exposed to browser; RLS enforced) |
| `OPENROUTER_API_KEY` | OpenRouter account key (server-side only) |
| `OPENROUTER_MODEL` | Model ID e.g. `anthropic/claude-3.5-sonnet` |

### Required — Cron Scripts (GitHub Actions Secrets)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Same project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS; **never use in app/** |
| `OPENROUTER_API_KEY` | Same key (also needed for AI scoring) |
| `OPENROUTER_MODEL` | Same model |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat / channel ID for alerts |

### Optional

| Variable | Default | Description |
|---|---|---|
| `KEYWORD_THRESHOLD` | `0.25` | Minimum keyword score to trigger AI scoring |
| `NOTIFY_THRESHOLD` | `0.75` | Minimum AI score to send Telegram notification |
| `NOTIFY_MODE` | `individual` | Notification delivery mode: `individual` (one message per job), `digest` (MVP digest with inline buttons), or `digest_legacy` (old grouped-text format) |
| `APP_URL` | _(unset)_ | Base URL of the deployed app, e.g. `https://app.example.com`; enables Worth Reviewing and Dashboard buttons in digest mode |
| `TELEGRAM_CALLBACK_SECRET` | _(unset)_ | Shared secret for signing worth-reviewing callback URLs in digest mode; must also be set in Vercel |
| `WELLFOUND_FEED_URL` | _(unset)_ | Wellfound custom feed URL; see docs/sources/wellfound.md |
| `WELLFOUND_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable Wellfound ingestion without triggering a config warning |
| `SOURCE_DISABLE_THRESHOLD` | `7` | Number of consecutive probe failures before a source is auto-disabled |
| `MIN_HEALTHY_SOURCE_COUNT` | `3` | Minimum number of healthy sources; validation exits 1 if count drops below this |

## 4. Runtime Targets

| Runtime | Environment | Node version |
|---|---|---|
| Next.js server (RSC + actions) | Vercel (serverless) | 20+ |
| Cron scripts (tsx) | GitHub Actions (ubuntu-latest) | 20+ |
| Tests (vitest) | CI / local | 20+ |

## 5. Key Dependencies (package.json)

```json
{
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "@supabase/supabase-js": "^2.45",
    "@supabase/ssr": "^0.12",
    "zod": "^4.0",
    "pdf-parse": "^1.1",
    "recharts": "^2.x",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "typescript": "^5",
    "tailwindcss": "^4",
    "vitest": "latest",
    "tsx": "latest",
    "@types/node": "latest",
    "@types/react": "latest"
  }
}
```

## 6. npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local development server |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `test` | `vitest run` | Run unit tests once |
| `test:watch` | `vitest` | Watch mode for tests |
| `typecheck` | `tsc --noEmit` | Type-check without build |
| `check:service-role-boundary` | `tsx scripts/checkServiceRoleBoundary.ts` | CI safety gate — ensures service role key not used in app/ |
| `scrape` | `tsx scripts/scrape.ts` | Manual scrape run |
| `score` | `tsx scripts/score.ts` | Manual scoring run |
| `notify` | `tsx scripts/notify.ts` | Manual notification run |
| `validate-sources` | `tsx scripts/validate-sources.ts` | Probe all configured ATS boards; exit 1 only on new failures or healthy count below minimum |

## 7. CI / CD

| Pipeline | Trigger | Steps |
|---|---|---|
| `ci.yml` | Push / PR to main | `tsc --noEmit` → `vitest run` → `check:service-role-boundary` |
| `scrape.yml` | Cron (every 6h) or `workflow_dispatch` | `scrape.ts` → `score.ts` → `notify.ts` |
| `validate-sources.yml` | `workflow_dispatch` only | `validate-sources.ts` — probe ATS boards, exit 1 only on new failures or sub-minimum healthy count |

The cron `schedule:` entry in `scrape.yml` remains commented out until the user explicitly approves go-live.
