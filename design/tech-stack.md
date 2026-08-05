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
| Tests (vitest) | CI / local | 22+ (jsdom 30's bundled undici requires `node:worker_threads`' `markAsUncloneable`, added in Node 21 — absent on 20, see AD-64) |

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
    "jszip": "^3.10",
    "jsdom": "^30.0",
    "@testing-library/react": "^16.3",
    "@testing-library/user-event": "^14.6",
    "@testing-library/jest-dom": "^7.0"
  }
}
```

**Note on the four testing-library/jsdom packages:** dev-only, added in the UI/UX audit pass to give
the presentation layer its first automated coverage (`docs/decisions.md` AD-61). They are used by
**component tests only**, which opt into a DOM per file — the vitest default environment stays `node`
so the ~1000 domain/application tests keep their speed. See §8 "Component tests" below and
`design/technical-design.md` §11. No runtime dependency was added: fonts come from `next/font`, which
ships with Next.

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
| `print:manual-matches-sql` | `tsx scripts/print-manual-matches-sql.ts <path-to-state.json>` | (`docs/decisions.md` AD-66) Companion to `import:manual-matches` for environments without `SUPABASE_SERVICE_ROLE_KEY` (e.g. the cloud "Claude routine"). Reuses `mapManualMatch()`/`tagLocations()` -- no duplicated logic -- and prints the equivalent `INSERT ... ON CONFLICT (source, source_job_id) DO UPDATE` SQL to stdout instead of writing to Supabase itself; the caller runs that SQL via the Supabase connector's Execute SQL tool |

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

---

## 8. Design System & Tokens

The UI has exactly one source of visual truth: the CSS custom properties in `src/app/globals.css`.
Tailwind v4 has no `tailwind.config.*` in this repo — the theme is declared in CSS via `@theme inline`,
which maps each `--color-*` utility token onto the corresponding variable. Adding a colour means adding
a variable there, not a hex value in a component.

### Colour

All colours are **oklch**, in both `:root` and `.dark`. No hex, no hsl, anywhere in the stylesheet.

| Token | Value (light) | Used for |
|---|---|---|
| `--primary` | `oklch(0.5 0.1 264)` | The accent. Primary buttons, active sidebar item, active tab underline, active role chips, the AI-scored stat chip, progress bars, focus rings (decisions.md AD-54) |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text/icons on accent fills |
| `--foreground` | `oklch(0.145 0 0)` | Body text |
| `--muted-foreground` | `oklch(0.556 0 0)` | Captions, section labels, inactive nav |
| `--border` | `oklch(0.922 0 0)` | Card, table, and toolbar borders |
| `--success` | — | Score badge ≥ 0.75 (`Badge variant="success"`) |
| `--warning` | — | Score badge ≥ 0.40 (`Badge variant="warning"`) |
| `--info` | — | Insights "In demand" rows (`SkillRow variant="info"`) |

The accent is used at low opacity for tints (`/10`, `/12`, `/25`, `/30`) for chip fills and tinted
borders — always as `bg-primary/10`-style utilities, never as a separate hardcoded variable.

### Radius and spacing

`--radius: 0.625rem` (10px) is the base; `--radius-sm/md/lg/xl` derive from it with `calc()`.
Cards, frames, and the filter toolbar use `--radius-lg` (10px); buttons, inputs, and small badges use
`--radius-md`; chips and status pills use `rounded-full`.

Spacing is plain Tailwind scale, applied consistently rather than tokenised: page padding `p-6`,
card padding `p-4`, vertical rhythm between page sections `space-y-5`, chip/icon gaps `gap-1.5`–`gap-2`.

### Typography

**IBM Plex Sans**, self-hosted by `next/font/google` in `src/app/layout.tsx` — latin subset, the
variable cut, `display: "swap"`. It is the **only** webfont, and a second one should not be added
without re-checking the cold-start budget (limitations.md §6.4).

Why a webfont at all, having previously shipped the system stack: this UI is a dense data surface —
the job table, the stat chips and the insight percentages all sit at `text-xs`/`text-[11px]`, where
the OS default renders differently on every machine and the layout stops holding. Plex is a
neo-grotesque drawn for technical reading (open apertures, distinguishable `l`/`I`/`1` and `0`/`O`)
with even-width lining figures, which is what makes the `tabular-nums` convention below actually do
its job. Why it is cheap: the variable cut is one file covering 400/500/600/700 rather than four
downloads, `next/font` self-hosts it (no runtime request to Google, no extra dependency — `next/font`
ships with Next), and `swap` paints immediately in a metric-adjusted fallback so a slow font never
blocks first paint.

Wiring, which is Tailwind-v4-specific: the generated class on `<html>` only *defines*
`--font-ibm-plex-sans`. `globals.css` maps it onto the theme's `--font-sans` token inside
`@theme inline` —
`--font-sans: var(--font-ibm-plex-sans), ui-sans-serif, system-ui, -apple-system, sans-serif` — so
every `font-sans` utility and the preflight default resolve to it. Adding a second family means a
second `next/font` call, a second variable, and a matching token; never a `@font-face` or a `<link>`.

Page title `text-2xl font-semibold`; section labels `text-xs font-semibold uppercase tracking-wide
text-muted-foreground`; body and table text `text-sm`; metadata and badges `text-xs`; stat numbers
`text-lg font-bold tabular-nums` (`tabular-nums` is required on every changing number so filter
changes don't jitter the layout).

### Product name

**"Job Intelligence"** is the product name, used in the `AppShell` heading and throughout these docs.
The design handoff's wordmark reads "Job Intel"; that is the prototype's shorthand and is **not**
adopted. Do not introduce a third variant.

### Icons

Lucide React only, stroke-based, 24×24 viewBox. `size-3.5`/`size-4` in content, `size-4` in nav.
Do not mix in a second icon set or inline raw SVG paths — `components.json` pins `"iconLibrary": "lucide"`.

### Theming

**Light and dark, and nothing else.** There is no density toggle and no accent picker
(decisions.md AD-54, still in force on both). Light/dark is the one axis that is switchable
(AD-63), because the OS already carries the preference and the parallel token set already existed.

How it works, end to end:

- `src/lib/theme.ts` holds `applyStoredTheme(root, stored, prefersDark)` and `THEME_SCRIPT`, the
  serialized form of it. **The function is `String()`-ed into a blocking inline `<script>` in
  `<head>`** (`layout.tsx`), so the class is on `<html>` before first paint — without that the page
  paints white and repaints dark after hydration. It must therefore stay entirely self-contained:
  no imports, no closure over module scope.
- Resolution order: an explicit `localStorage["theme"]` of `"light"`/`"dark"` wins; **absence means
  follow the OS**. That absence is the third state, which is why the control itself is two-state.
- `ThemeToggle` (sidebar footer, mobile header) holds **no React state** — it toggles the class and
  writes storage. Its icons are CSS-driven (`dark:hidden` / `hidden dark:block`), both present in
  the server HTML, so nothing needs to read the theme in JS and there is no `mounted` flicker.
- `<html>` carries `suppressHydrationWarning`. The standing rule that creates: **never branch
  server-rendered output on theme — branch in CSS.**
- `color-scheme: light` / `dark` is set on `:root` / `.dark`. It is what themes the surfaces CSS
  cannot reach: scrollbars, `<select>` popups, date pickers, autofill.

The trap, because it fails silently and looks like something else: the script must use
`classList.add`, never `className =`. `<html>` also carries `next/font`'s generated class, the only
thing defining `--font-ibm-plex-sans`. `src/lib/theme.test.ts` has a named test for exactly this.

`docs/plans/dark-mode-plan.md` is the full working plan, including the residual manual visual pass.

**Contrast is a constraint on the token, not a review step.** Every solid-chip pairing —
`bg-<token>` with `text-<token>-foreground` — must clear WCAG AA (4.5:1) for normal text, and the
token's lightness is chosen to satisfy that before it is chosen for looks. The two themes reach it
from opposite directions: **light mode darkens the chip** so white text is legible, **dark mode
darkens the text** so the chip can stay light against a near-black page. `--warning` has always
worked this way and is the pattern the other status tokens now follow (decisions.md AD-62).

`--primary` answers to two pairings and is the one to be careful with: solid `bg-primary`, and
`text-primary` over the `bg-primary/10` wash used by stat chips, the sidebar active state and
selected role chips. The wash needs the accent light, so its foreground — not its background —
absorbs the change.

`src/app/globals.contrast.test.ts` parses `globals.css` and fails the gate on any pairing below AA,
so an unreadable token cannot ship. It does not model alpha-composited variants beyond the accent
wash; `Badge`'s `dark:bg-destructive/60` in particular is out of its reach and is tracked in the
dark-mode plan.

### What is *not* in `components/ui/`

The shadcn primitives actually installed are: `badge`, `button`, `card`, `collapsible`, `dialog`,
`input`, `label`, `progress`, `select`, `sheet`, `table`, `textarea`. Notably absent — and deliberately
so, since each is currently served by a plainer construct — are `checkbox` (raw
`<input type="checkbox" className="accent-primary">`), `tabs` (route-based `RouteTabs`, see
architecture.md §12), `skeleton` (per-route `loading.tsx` with `animate-pulse` divs), and `switch`
(no toggle-switch surface exists; see decisions.md AD-57). Add a primitive when a second call site
appears, not before.

The `skeleton` line is the one worth re-checking periodically, because it now has six call sites, not
two: every protected route (Dashboard, Roles, Resume, Insights, Analytics, Settings) has a
`loading.tsx`. The reason it still isn't a primitive is that these are not one repeated block — each
skeleton is a bespoke tracing of that page's real layout (stat chips, a table frame with row lines, a
two-column insights grid), and the only thing they share is the three-utility idiom
`animate-pulse rounded bg-muted` / `bg-muted/50` inside `border-border rounded-xl` frames. A
`<Skeleton>` wrapper around three utilities would add an import without removing a decision. Revisit
if a genuinely repeated shape appears.

**Reuse the variant before writing the classes.** `size="icon-sm"` on `Button` exists; `size="sm"
className="size-8 p-0"` is the same thing spelled worse and drifts when the variant is retuned. For a
non-`<button>` element that should look like one — the `<a>` on a job card, an anchor that must carry
a real `mailto:`/`target="_blank"` — use `cn(buttonVariants({ variant, size }), …)` rather than
re-deriving `inline-flex items-center justify-center rounded-md` by hand.

The same applies to status pills: `Badge`'s base is already
`rounded-full px-2 py-0.5 text-xs font-medium`, so a hand-rolled `<span>` with those classes is a
`Badge` with the token system removed. **`src/` contains no literal Tailwind palette colours** —
no `bg-green-100`, no `text-red-800` — and that is an invariant worth keeping, because a literal
palette colour is invisible to the contrast gate in `globals.contrast.test.ts` and does not follow
`.dark`. Map the domain union onto a `Badge` variant with an exhaustive
`Record<TheUnion, ComponentProps<typeof Badge>["variant"]>`, so adding a status is a type error
rather than an unstyled pill; `ScrapeRunHealthTable` and `SourceHealthTable` are the reference.

**Recharts renders outside CSS classes, so it needs the tokens passed in by hand.**
`AnalyticsCharts.tsx` has three shared constants for this — `AXIS_STYLE`, `TOOLTIP_STYLE` and
`stroke="var(--border)"` on every `CartesianGrid`. A bare `<Tooltip />` is Recharts' default: an
opaque **white** panel with dark text, which is a white slab on a dark page. Tooltips only exist on
hover, so a route-by-route visual pass will not catch a missed one — pass `contentStyle` every time.
Series fill colours remain literal hex; they are saturated mid-tones that read on both grounds, and
they are the documented exception to the no-literal-colours rule above.

### Component tests (jsdom, per-file opt-in)

Client components are tested against a real DOM with `@testing-library/react`. The convention, and
the reason for each part of it (`docs/decisions.md` AD-61):

- **Vitest's default `environment` stays `node`.** A component test opts in with a docblock on line 1:
  ```tsx
  // @vitest-environment jsdom
  import "@testing-library/jest-dom/vitest";
  ```
  Do not flip the global environment — that would make ~1000 DOM-free domain and application tests
  pay jsdom startup to serve a handful of component files, on a gate (`npm run verify`) run before
  every change.
- **`vitest.config.ts` carries two lines that are forced, not stylistic.** `globals: true`, because
  `@testing-library/react` only registers its automatic between-test unmount when a global `afterEach`
  exists — without it, renders leak across tests within a file. And `esbuild: { jsx: "automatic" }`,
  because `tsconfig.json` sets `jsx: "preserve"` for Next's compiler, which leaves esbuild on the
  classic transform and fails JSX in tests with "React is not defined".
- **Co-locate:** `src/components/dashboard/Foo.test.tsx` beside `Foo.tsx`; shared fixtures in a plain
  builder module beside them (`testJobFixture.ts`).
- **Extract rather than render.** Anything decidable without a DOM belongs in a pure module and is
  tested in the node environment — `jobHotkeys.ts` and `jobScore.ts` are both tested that way. A jsdom
  test is for *wiring*: does this event reach that action, once, with the right argument.
