# Technology Stack

## 1. Overview

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| UI Framework | Next.js (App Router) | 15 | RSC, server actions, SSR without extra API layer |
| UI Language | TypeScript | 5 (strict) | Type safety across all layers |
| Styling | Tailwind CSS | 4 | Utility-first, minimal bundle |
| Component Library | shadcn/ui + Radix UI | latest | Accessible, unstyled primitives; includes both granular `@radix-ui/react-*` packages and unified `radix-ui` package |
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
| PDF Parsing | pdfjs-dist (legacy/Node build) | v4 | Extract text from uploaded PDF resumes (decisions.md AD-41 — swapped from pdf-parse, which pinned an old, unmaintained internal PDF.js fork that rejected some real-world PDFs) |
| DOCX Parsing | mammoth | — | Extract text (including table content) from uploaded DOCX resumes |
| Local Embeddings | @huggingface/transformers | v4 | Offline resume/job semantic-similarity signal (`scoring.md` §3.1, `decisions.md` AD-31); runs on-device, no API key/cost |
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
| `OPENROUTER_API_KEY` | OpenRouter account key (server-side only). Powers job scoring/role expansion AND, by default, `llmClient.ts` (resume suggestions/application drafts/careers extraction) — decisions.md AD-42. No second LLM key required unless `LLM_PROVIDER` is switched to `gemini`/`anthropic` (see Optional below) |
| `OPENROUTER_MODEL` | Model ID e.g. `anthropic/claude-3.5-sonnet` (job scoring/role expansion only — `llmClient.ts`'s OpenRouter calls default to `google/gemini-2.5-flash`, overridable via `LLM_MODEL`) |

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
| `OPENROUTER_MAX_TOKENS` | `300` | Maximum output tokens for stage-2 AI response; see docs/scoring.md §5 |
| `OPENROUTER_MAX_RESUME_PROMPT_CHARS` | `4000` | Caps resume text sent in the AI prompt (Phase 3 Task 11-12 cost control) |
| `OPENROUTER_MAX_DESCRIPTION_PROMPT_CHARS` | `2000` | Caps job description text sent in the AI prompt (Phase 3 Task 11-12 cost control) |
| `OPENROUTER_COST_PER_1K_TOKENS` | _(unset)_ | Blended per-1k-token rate for the active model (e.g. `0.0008` for $0.80/1M); enables cost logging and `estimated_cost_usd` in `job_scores` |
| `WELLFOUND_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable Wellfound ingestion without triggering a config warning |
| `RAPIDAPI_KEY` | _(unset)_ | JSearch (RapidAPI) key; unset = JSearch auto-disables (clean skip, same convention as Wellfound) |
| `JSEARCH_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable JSearch even if `RAPIDAPI_KEY` is set |
| `JSEARCH_COUNTRIES` | `in,sg,ae` | Comma-separated country codes JSearch searches per run (merge-workspace Phase 5) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | _(unset)_ | Adzuna API credentials; either unset = Adzuna auto-disables |
| `ADZUNA_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable Adzuna even if credentials are set |
| `ADZUNA_COUNTRIES` | `in,sg` | Comma-separated country codes Adzuna searches per run -- no `ae`, Adzuna does not cover the UAE (`design/limitations.md` §1.1) |
| `SOURCE_DISABLE_THRESHOLD` | `7` | Number of consecutive probe failures before a source is auto-disabled |
| `MIN_HEALTHY_SOURCE_COUNT` | `3` | Minimum number of healthy sources; validation exits 1 if count drops below this |
| `SCORING_STUCK_THRESHOLD_HOURS` | `48` | Hours an AI-retry job can wait before `score.ts` logs it as "stuck" (Phase 1 Task 6, `getScoringQueueReport`) |
| `MAX_AI_RETRIES` | `3` | Failed AI-scoring attempts before a job is dropped from the retry queue (AD-52). A failed AI call is the only skip reason that spends tokens on every attempt, so this is the spend bound; raise it if your failures are mostly transient rate limits |
| `SOURCE_STALE_HOURS` | `6` | Hours since a source's last scrape_runs row (of any status) before it's flagged `isStale` on `/analytics` -- distinct from an actively-failing source |
| `JOB_EXPIRATION_DAYS` | `14` | Days since `last_seen_at` before `scrape.ts` soft-deactivates a job (`is_active = false`, `inactive_reason = 'expired'`) |
| `REMOTEOK_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable RemoteOK ingestion (set in `scrape.yml` — RemoteOK's near-zero yield made it not worth probing on every run, see `docs/remoteok-evaluation.md`) |
| `REMOTIVE_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable Remotive ingestion (remote-global board, public JSON API) |
| `HIMALAYAS_DISABLED` | _(unset)_ | Set `true` or `1` to explicitly disable Himalayas ingestion (remote-global board, public JSON API) |
| `LLM_PROVIDER` | `openrouter` | `llmClient.ts` provider switch: `openrouter` (default, routes through `OPENROUTER_API_KEY`/`openrouterClient.ts`), `gemini`, or `anthropic` (decisions.md AD-32, AD-42 — supersedes AD-32's Gemini-default for the default case; direct Gemini/Anthropic REST stays available for anyone who wants a different key/provider than scoring) |
| `LLM_MODEL` | per-provider (`google/gemini-2.5-flash` / `gemini-2.5-flash` / `claude-haiku-4-5`) | Overrides the default model for the active `LLM_PROVIDER` |
| `GEMINI_API_KEY` | _(unset)_ | Google AI Studio key for `llmClient.ts`'s direct-Gemini path; required only when `LLM_PROVIDER=gemini` (decisions.md AD-42 — no longer required by default) |
| `ANTHROPIC_API_KEY` | _(unset)_ | Anthropic key for `llmClient.ts`'s direct-Anthropic path; required only when `LLM_PROVIDER=anthropic` |

**Note on NOTIFY_MODE:** The code default is `individual`, but the scheduled production workflow `.github/workflows/scrape.yml` overrides this to `digest` by default via `NOTIFY_MODE: ${{ vars.NOTIFY_MODE || 'digest' }}` (line 71). This is intentional—digest mode is the production-recommended setting per `docs/reviews/project-completion-audit.md`.

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
    "pdfjs-dist": "^4.10",
    "mammoth": "^1.12",
    "@huggingface/transformers": "^4.2",
    "recharts": "^3.8.1",
    "radix-ui": "^1.5.0",
    "@tailwindcss/postcss": "^4.3.1",
    "tw-animate-css": "^1.4.0",
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
    "eslint": "^9",
    "eslint-config-next": "^15.5",
    "@eslint/eslintrc": "^3",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jszip": "^3.10"
  }
}
```

**Note on jszip:** dev-only, used to build an in-memory `.docx` fixture (a real OPC zip) in `parseDocx.test.ts` so DOCX/table extraction is tested against actual mammoth parsing rather than a mocked `mammoth` module. It's already a transitive dependency of `mammoth` itself; listed explicitly as a devDependency rather than relied on implicitly.

**Note on @huggingface/transformers:** pulls in native/WASM runtime deps (`onnxruntime-node`, `sharp`) and downloads a ~90 MB model on first use. Only ever imported by `TransformersEmbeddingScoreProvider.ts` (infrastructure) and instantiated by `scripts/score.ts` — no `src/app/` page or server action imports it, so it is never bundled into the Next.js app (verified: `npm run build`'s route bundle sizes are unaffected). Tests mock the pipeline (`TransformersEmbeddingScoreProvider.test.ts`) so `npm run verify` never triggers a real model download.

## 6. npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local development server |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `test` | `vitest run` | Run unit tests once |
| `test:watch` | `vitest` | Watch mode for tests |
| `typecheck` | `tsc --noEmit` | Type-check without build |
| `lint` | `eslint .` | ESLint (next/core-web-vitals + next/typescript) |
| `verify` | `npm run typecheck && npm run lint && npm run test && npm run build` | Single quality-gate command (v1.2) — run before considering any change done |
| `check:service-role-boundary` | `tsx scripts/checkServiceRoleBoundary.ts` | CI safety gate — ensures service role key not used in app/ |
| `scrape` | `tsx scripts/scrape.ts` | Manual scrape run |
| `score` | `tsx scripts/score.ts` | Manual scoring run |
| `rescore` | `tsx scripts/rescore.ts` | Clears every `job_scores` row for the active role selection + resume version so the next `score` run rebuilds them under the current prompt/constraints (decisions.md AD-50). Delete-only; run `score` after, or use the `rescore.yml` workflow which chains both |
| `notify` | `tsx scripts/notify.ts` | Manual notification run |
| `doctor` | `tsx scripts/doctor.ts` | (v1.2) Checks required/optional env vars are set and does a live Supabase + Telegram connectivity check; exit 1 if anything required is missing or unreachable |
| `verify:production` | `tsx scripts/verify-production.ts --format=all` | (v1.4) Runs the 24-check production verification framework; writes `verification-reports/latest.{md,json}` + console; exit 1 only on a critical-severity ("not ready") failure |
| `diagnostics` | `tsx scripts/verify-production.ts --format=console` | (v1.4) Same 26 checks, console-only, no files written -- quick ad-hoc health check |
| `health` | `tsx scripts/validate-sources.ts` | (v1.2) Alias of `validate-sources` under the name used elsewhere in the mission's dev-experience vocabulary |
| `diagnose` | `tsx scripts/report-sources.ts && tsx scripts/filter-analysis.ts` | (v1.2) Combined pipeline diagnostic: recent-run/failure report + fetch→location-filter→ingest funnel |
| `analytics` | `tsx scripts/source-analytics.ts` | (v1.2) 30-day per-source quality report (keep rate, low performers) |
| `report:sources` | `tsx scripts/report-sources.ts` | (v1.2) Explicit name for the last-run/recent-failures report (previously unwired) |
| `report:matches` | `tsx scripts/report-top-matches.ts [N] [--location <india\|singapore\|uae\|remote>] [--remote] [--sponsoring]` | Read-only terminal report of the top N (default 10) scored jobs for the active role selection + resume version, ordered by overall score — the same ranking `/dashboard` shows. Optional filters (pass after `--`, e.g. `npm run report:matches -- 15 --location uae`) mirror the dashboard's location/remote/sponsoring filters |
| `validate-sources` | `tsx scripts/validate-sources.ts` | Probe all configured ATS boards; exit 1 only on new failures or healthy count below minimum |
| `backfill:fingerprints` | `tsx scripts/backfill-fingerprints.ts` | One-off backfill of `jobs.fingerprint` for rows inserted before cross-source dedup (Phase 1 Task 1) |
| `backfill:min-years` | `tsx scripts/backfill-min-years.ts` | (v1.2) Explicit name for the one-off `min_years` backfill (previously unwired) |
| `backfill:eligibility` | `tsx scripts/backfill-eligibility.ts` | (AD-51) Recomputes `jobs.ineligible_reason` for every active job. Required once after migration `20260720000001`; idempotent, so it doubles as the refresh path after editing `candidate-constraints.ts` |
| `sweep:stranded-resumes` | `tsx scripts/sweep-stranded-resumes.ts` | (bugfix session, decisions.md AD-40) Read-only report of Storage objects orphaned by the pre-fix upload ordering and any resume row with suspiciously short `parsed_text`; pass `--delete-orphaned-storage` to remove confirmed-orphaned Storage objects (rows are never auto-deleted) |
| `discover:career-pages` | `tsx scripts/discover-career-pages.ts` | Manual run of ATS career-page discovery (Phase 2 Task 8) |
| `setup:webhook` | `tsx scripts/setup-webhook.ts` | One-off Telegram webhook registration |
| `scrape:careers-url` | `tsx scripts/scrape-careers-url.ts` | (merge-workspace Phase 5) Manual-trigger fetch of one operator-provided public careers page URL -- not part of any cron/workflow |
| `migrate:jobhunt-sqlite` | `tsx scripts/migrate-jobhunt-sqlite.ts -- <path-to-jobhunt.db>` | (merge-workspace Phase 6) One-off jobhunt-app cutover: migrates its `resumes` and already-reviewed (`status != 'new'`) `jobs` rows into Supabase. Reads SQLite via Node's built-in `node:sqlite` -- no new dependency (`docs/decisions.md` AD-36) |

## 7. CI / CD

| Pipeline | Trigger | Steps |
|---|---|---|
| `ci.yml` | Push / PR to main | `typecheck` → `lint` → `test` → `build`; separate `check:service-role-boundary` job |
| `scrape.yml` | Cron (every 6h) or `workflow_dispatch` | `scrape.ts` → `score.ts` → `notify.ts` |
| `rescore.yml` | `workflow_dispatch` only | `rescore.ts` (clears active scores) → `score.ts` (rebuilds). Shares the `scrape-pipeline` concurrency group so it never overlaps a scheduled scrape. Use after a scoring prompt/constraint change to re-rank the existing corpus (decisions.md AD-50) |
| `validate-sources.yml` | `workflow_dispatch` only | `validate-sources.ts` — probe ATS boards, exit 1 only on new failures or sub-minimum healthy count |
| `verify-production.yml` | `workflow_dispatch` only (v1.4, no schedule) | `verify-production.ts` — 24-check operational health report, uploads `verification-reports/` as a build artifact, exit 1 only on a critical-severity failure |
| `maintenance.yml` | `workflow_dispatch` only (AD-51) | Runs one maintenance script chosen from a dropdown (`backfill:eligibility`, `backfill:min-years`, `backfill:fingerprints`, `sweep:stranded-resumes`, `report:matches`) |
| `migrate.yml` | Push to `main` | `supabase link` → `supabase db push`. Sends a Telegram alert on failure — the triggering PR has already merged green, so nothing else surfaces that the schema is behind the code |

**Running maintenance scripts:** use `maintenance.yml`, not your laptop. Every script reads
`process.env` directly (AD-04) and the repo intentionally has **no `dotenv`**, so a local
`npm run backfill:*` fails with `Missing required environment variable: SUPABASE_URL` unless you
export the secrets into your shell by hand. Dispatching the workflow runs them where
`SUPABASE_SERVICE_ROLE_KEY` already lives, keeping the service-role key off developer machines
(`design/security.md`'s service-role boundary).

**Applying migrations:** likewise never run `supabase db push` locally (it needs `supabase link`,
a project ref, and an access token). `migrate.yml` pushes migrations automatically on every push to
`main`.

`SUPABASE_ACCESS_TOKEN` is a Supabase **personal access token, and those expire.** When it lapses,
`migrate.yml` fails at the `link` step with `Unauthorized` and every subsequent migration silently
stops applying while PRs keep merging green — the schema drifts behind the code until something
reads a column its migration never created. This happened between 2026-07-19 and 2026-07-21 and is
why the workflow now alerts on failure. If you see that alert, rotate the token at
`supabase.com/dashboard/account/tokens`, update the repo secret, and re-run the workflow.

The cron `schedule:` entry in `scrape.yml` is **active** (`0 */6 * * *`, every 6 hours), not commented out — whether this 6h cadence was a deliberate, approved choice is an open question tracked in `TECHNICAL_DEBT.md` #1, not a doc-accuracy issue.
