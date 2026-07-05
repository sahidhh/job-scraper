# AI Handoff

Read this first. It's the minimum needed to be productive in this repo without re-deriving what prior sessions already established. For narrative detail, follow the links — don't re-read everything up front.

## Do this before touching anything

1. Read `CLAUDE.md` (root) — it overrides default behavior and is non-negotiable: no `any`, no duplicated types/DTOs, no Prisma/Drizzle/Zustand/Redux/React Query, repository pattern only, domain→application→infrastructure→tests before UI, and **every code change that touches scope/data-model/architecture/deps/API/security/limitations/UX must update the matching `design/*.md` file in the same change** (table is in `CLAUDE.md` and `design/README.md`).
2. Skim `PROJECT_STATE.md` for what the system does today.
3. Skim `ARCHITECTURE.md` for lifecycles and where new work fits ("Extension Points" table — check it before inventing a new pattern).
4. Check `ROADMAP.md`'s Backlog/Deferred sections before assuming something isn't done — several older docs describe pre-implementation plans, not current state (see `docs/reviews/2026-07-04/repository-consolidation-report.md` for the full stale-doc audit).

## Non-negotiable conventions (verified, not guessed)

- **Every feature is `src/features/<name>/{domain,application,infrastructure}` + `actions.ts`.** Domain has zero imports from other layers. Application takes injected deps, no I/O. Infrastructure implements domain interfaces. Never call Supabase directly from a use-case.
- **Service role key only in `scripts/`.** Enforced by CI (`npm run check:service-role-boundary`) — if you're writing app/feature code and need `SUPABASE_SERVICE_ROLE_KEY`, you're in the wrong layer.
- **Deterministic over AI, always.** Every job-signal extractor (salary, contact email, employment type/seniority/etc.) is a pure regex function, not an AI call — copy `extractSalary.ts`'s shape for a new one, don't reach for OpenRouter.
- **New DB columns:** add a forward-only migration in `supabase/migrations/` (never edit a merged one) **and** manually update `supabase/database.types.ts` to match — there is no live Supabase project in this environment to run `supabase gen types` against, so the generated-types file is hand-maintained. Also update `design/erd.md` (the canonical schema doc — **not** `docs/database.md`, which is stale, marked as such at its own top).
- **Verify before calling anything done:** `npm run verify` (typecheck + full test suite + production build). This is the single command; use it, don't run the three separately and forget one.
- **`npm run doctor`** if anything env-related looks wrong locally — it checks required/optional vars and does a live Supabase+Telegram connectivity probe.
- **`npm run diagnostics`** (or `verify:production` for a saved report) for a full operational health snapshot — 26 checks across infrastructure/application/external services/data quality, each with a probable cause and suggested fix, not just pass/fail. See `docs/operations/production-verification.md`. Not the same tool as `npm run diagnose` (older, source-quality-specific) — similar name, different purpose.
- **Adding a new verification check?** Follow `docs/operations/production-verification.md` §1.1 exactly (shared skip outcome for missing Supabase client, structured diagnostics fields, severity rubric) — this framework was specifically reviewed for consistency across all 26 checks; a new check that doesn't follow the pattern will stand out.

## Where things actually are (not where you'd guess)

| Looking for... | It's here |
|---|---|
| The real, current architecture diagrams | `design/architecture.md` (not `docs/architecture.md` — that one's a superseded duplicate, banner points here) |
| The real, current DB schema | `design/erd.md` (not `docs/database.md`'s inline `create table` — stale) |
| Why a decision was made | `docs/decisions.md` — 28 numbered entries (AD-01..AD-28), each with rationale/alternatives/consequences. Read before re-litigating an existing choice |
| Env var reference | `design/tech-stack.md` §3, mirrored in `.env.example` |
| What's actually deferred vs. actually backlog vs. actually done | `ROADMAP.md` (this session's consolidation — trust this over any single older doc) |
| Known, accepted limitations (not bugs) | `design/limitations.md` — read before "fixing" something that's a deliberate tradeoff |
| Real, open technical debt | `TECHNICAL_DEBT.md` |
| Production verification framework (check catalog, severity rubric, how to add a check) | `docs/operations/production-verification.md` |

## Gotchas that will burn you if you skip them

- **The cron pipeline is live**, running every 6 hours (`scrape.yml`'s `schedule:` is active, not commented out despite what a couple of older docs still say). Changes to `scripts/scrape.ts`/`score.ts`/`notify.ts` affect a running production pipeline, not a staged one.
- **Migrations auto-apply on merge to `main`** via `migrate.yml` (`supabase db push`). A migration you write and merge takes effect automatically — it is not a manual step someone remembers to run later.
- **No live Supabase/Telegram credentials exist in this sandboxed environment.** You cannot browser-test the app or run a real cron script end-to-end here. Verification is `tsc --noEmit` + `vitest run` (mocked Supabase client) + `next build`. Say so explicitly if asked to "verify it works" — don't imply live verification happened when it didn't.
- **`filterMatches.ts` and `scoreJob.ts` must use the same text source** (`title + "\n" + description`) when matching skills — a real bug (fixed in v1.2) where they diverged and silently dropped valid matches. If you touch either, check the other.
- **`JobWithScore` deliberately omits several `Job` fields** (description, fingerprint, salary_*, contact_email_*, and the v1.2 job-attribute fields) — this is intentional (never rendered by the dashboard today), not an oversight. Don't "fix" it without a UI reason to add the field back.

## Agent usage in this repo's own sessions

Prior sessions have used Haiku-model subagents for repository exploration/grep/doc-summarization and reserved reasoning/writing/decisions for the main session model. If you spawn subagents, the same split works well here — this repo is large enough (~50 doc files, 36 migrations) that full-context reads by every agent add up fast.
