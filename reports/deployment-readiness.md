# Deployment Readiness Audit

**Agent:** Deployment Agent
**Date:** 2026-06-13
**Scope:** Can a fresh clone of this repo be deployed (Vercel + Supabase + GitHub Actions + Telegram + OpenRouter) end-to-end? Cross-checked against `CLAUDE.md`, `docs/**`, `reports/post-merge-audit.md`, `reports/security-fixes.md`, `reports/merge-conditions-resolution.md`, current `supabase/migrations/**`, `.github/workflows/**`, `src/shared/infrastructure/**`.

---

## READY ITEMS

1. **Migrations** — `supabase/migrations/` has 6 forward-only files (`20260612000001`–`6`), covering enums, tables, indexes, RPC functions (`set_active_resume`, `set_active_role_selection`), and RLS. `20260612000006` fixes the RPC return-type mismatch (per `agent-c-database.md`); `supabase/database.types.ts` regenerated to match (confirmed by `reports/agent-c-database.md`).
2. **RLS** — `20260612000005_rls.sql` enables RLS on all 8 tables with a single `authenticated_full_access` policy per table (AD-12). Cron scripts use the service-role key and bypass RLS.
3. **Seed data** — `supabase/seed.sql` seeds `role_expansion_map` (source='seed') with `on conflict (role) do nothing` — safe to apply once manually post-deploy.
4. **Service-role boundary enforcement** — `scripts/checkServiceRoleBoundary.ts` + `.github/workflows/ci.yml` run on every push/PR, confining `SUPABASE_SERVICE_ROLE_KEY`/`createSupabaseServiceClient` to `scripts/**` and `src/shared/infrastructure/supabaseClient.ts` (P3 resolved per `security-fixes.md`).
5. **Resume upload path security** — `uploadResumeAction` now uses `${Date.now()}-${randomUUID()}.pdf`, no `file.name` in storage path (U3 resolved).
6. **Auth flow** — `src/middleware.ts` + `supabase/middleware.ts` + `(protected)/layout.tsx` implement session refresh and route guards (AD-01, AD-12). Single user is created manually via Supabase dashboard (documented in `docs/frontend.md` §1, §4).
7. **Cron pipeline scripts** — `scripts/scrape.ts`, `score.ts`, `notify.ts` exist, composition-root pattern followed, `.github/workflows/scrape.yml` wires secrets/vars to `npm run scrape|score|notify`. Cron `schedule:` intentionally commented out pending human go-live (AD-04, U6 — by design, not a blocker for staging).
8. **`.gitignore`** present — `node_modules/`, `.next/`, `.env`, `.env.*`, `*.tsbuildinfo`, `coverage/` (N6 resolved).
9. **Validation** — `tsc --noEmit` clean, 129/129 vitest tests pass per `post-merge-audit.md` and `security-fixes.md`.

---

## MISSING CONFIGURATION

1. **Supabase Storage bucket `resumes` does not exist in any migration.** `src/features/resume/actions.ts:14,38` hardcodes `RESUME_BUCKET = "resumes"` and calls `client.storage.from("resumes").upload(...)`. No migration, seed file, or setup script creates this bucket. On a fresh Supabase project, the first resume upload will fail with a storage "bucket not found" error.
2. **No Storage RLS/policies for the `resumes` bucket.** `20260612000005_rls.sql` only covers Postgres tables (`alter table ... enable row level security`), not `storage.objects`. Even after the bucket exists, the `authenticated` user needs explicit `storage.objects` policies (select/insert/update for `bucket_id = 'resumes'`) or uploads/reads will 403.
3. **GitHub Actions Secrets** (required by `.github/workflows/scrape.yml` and `ci.yml`, none documented in a checklist anywhere in `docs/` or `reports/`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
4. **GitHub Actions Variables** (`scrape.yml` references `vars.KEYWORD_THRESHOLD` / `vars.NOTIFY_THRESHOLD`) — optional; `optionalEnv` falls back to `0.5`/`0.75` if unset/empty, so not strictly blocking, but undocumented.
5. **`WELLFOUND_FEED_URL`** — `WellfoundScraper.ts:56` reads this via `optionalEnv(..., "")`; if empty, the scraper logs a warning and returns `[]` every run (AD-10 degraded mode). Not set in `scrape.yml` (N4, already flagged in `post-merge-audit.md`, this agent's item). No documentation anywhere of what value/format this URL should take.
6. **Vercel environment variables** — none documented as a checklist. Required by `requireEnv` calls reachable from the Next.js app:
   - `NEXT_PUBLIC_SUPABASE_URL` (`supabase/server.ts`, `supabase/middleware.ts`) — app fails to boot without it.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same.
   - `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (`openrouterClient.ts`) — required at runtime by `expandRoleAction` (`features/roles/actions.ts`) for any `primary_role` not already in `role_expansion_map` (AD-06). Caught by the action's try/catch (`ActionResult`), so it degrades to an inline error rather than a crash, but the feature is broken without these.
   - `KEYWORD_THRESHOLD`, `NOTIFY_THRESHOLD` — optional, `optionalEnv` defaults `0.5`/`0.75` (used by `(protected)/settings/page.tsx`).
7. **Supabase Auth user** — must be created manually (Supabase dashboard → Authentication → Users → Add user). Documented only as an aside in `docs/frontend.md:29`, not as a deployment step.
8. **`supabase/seed.sql` is not auto-applied** — must be run manually against the linked project (`database.md` §7 says so, but no deployment doc tells the operator *when*/*how* in the context of a fresh clone).
9. **No `.env.example`** — local dev / Vercel setup has no canonical list of variable names to copy from.
10. **No Supabase CLI step anywhere** (CI or docs) that runs `supabase db push` — migrations exist but nothing automates applying them to a fresh project; a fresh clone has an empty database until someone manually pushes migrations.

---

## MISSING DOCUMENTATION

1. **No root-level setup/deployment doc** consolidating: Supabase project creation → `supabase db push` → seed → storage bucket + policies → Auth user → Vercel env vars → GitHub secrets/vars → Telegram bot setup → OpenRouter account/model.
2. **`docs/database.md`** documents `resumes.file_path` as "Supabase Storage path" but never documents the bucket itself (name, public/private, required policies).
3. **`docs/scrapers.md`** documents the Wellfound source as feed-based but gives no guidance on what `WELLFOUND_FEED_URL` should point to (format, expected response shape) for an operator to actually configure it — N4 can't be fixed by Deployment Agent without this being specified by Pipeline/Architecture first.
4. **No documented Telegram bot setup** (how to create the bot, get `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) — `docs/agent-profiles.md`/`architecture.md` reference Telegram only as an architectural component.
5. **No documented OpenRouter setup** (account creation, model selection/cost implications for `OPENROUTER_MODEL`, where the key is used in both runtime contexts).

---

## DEPLOYMENT RISKS

1. **Resume upload is broken on a fresh deploy** until the `resumes` Storage bucket + policies are created manually — highest-impact gap, hits a core feature (`/resume`) on first use, not caught by `tsc`/`vitest` (no integration test against real Supabase Storage).
2. **Wellfound source silently contributes zero jobs forever** without `WELLFOUND_FEED_URL` — AD-10's degraded mode makes this operationally invisible (looks identical to "working correctly, no new postings").
3. **Cron pipeline requires a manual `workflow_dispatch` run** before any data exists — `/dashboard` will be empty and `/roles` will only work for seeded roles until `npm run scrape`/`score`/`notify` are run at least once with all secrets configured.
4. **`/roles` AI fallback fails gracefully but silently degrades** if `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are missing on Vercel — any role not in `supabase/seed.sql`'s 10 seeded clusters returns an inline error, easy to miss during staging smoke-test if only seeded roles are tried.
5. **Migrations are not applied by any automation** — a fresh clone's Supabase project has no schema until `supabase db push` (or manual SQL) is run; nothing in CI/CD enforces or even checks this.
6. **Cron schedule remains disabled (U6)** — by design (AD-04, human go-live gate), correctly out of scope for staging readiness, but operator must know this is intentional, not a bug.
7. Non-blocking carry-overs from `post-merge-audit.md`, unaffected by this audit: U4 (`hasScore` dead code), U5 (Phase 2 perf findings) — neither affects deployability.

---

## STAGING CHECKLIST

1. Create a new Supabase project; record project URL, `anon` key, and `service_role` key.
2. Apply schema: `supabase link --project-ref <ref>` then `supabase db push` (applies all 6 migrations in `supabase/migrations/`).
3. Apply seed data once: run `supabase/seed.sql` against the linked project (SQL editor or `psql`) — safe, `on conflict do nothing`.
4. Create a Storage bucket named `resumes` (private) in the Supabase dashboard.
5. Add `storage.objects` RLS policies for the `resumes` bucket granting `select`/`insert`/`update` to the `authenticated` role.
6. Create the single Supabase Auth user: Authentication → Users → Add user (email/password).
7. Set Vercel project env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, optionally `KEYWORD_THRESHOLD`/`NOTIFY_THRESHOLD`.
8. Set GitHub Actions repo secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
9. (Optional) set GitHub Actions repo variables `KEYWORD_THRESHOLD`/`NOTIFY_THRESHOLD` if overriding defaults (0.5/0.75).
10. Create a Telegram bot via @BotFather, add it to the target chat, record `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`.
11. Add at least one `companies` row (Greenhouse/Lever/Ashby + `board_token`) via `/settings`, or accept zero ATS coverage initially (AD-05).
12. Manually trigger `.github/workflows/scrape.yml` (`workflow_dispatch`) to validate `scrape` → `score` → `notify` end-to-end with real secrets.
13. Deploy to Vercel; log in with the Auth user; confirm `/dashboard`, `/roles`, `/resume`, `/settings` all load.
14. Upload a test PDF on `/resume` to confirm the `resumes` bucket + policies work.
15. Confirm `ci.yml`'s service-role-boundary check passes on the deployed branch.
16. Leave the cron `schedule:` block commented (U6) until a human explicitly approves go-live per `agent-workflow.md` Phase 4.

---

## Decision

# BLOCKED

**Rationale:** No Critical code-level regressions — `tsc`/`vitest` are clean and the two prior merge-condition security fixes (P3, U3) are confirmed resolved. However, a fresh clone **cannot be deployed successfully** today because:

1. The `resumes` Storage bucket (and its `storage.objects` policies) is referenced by working code (`src/features/resume/actions.ts`) but created by **nothing** — no migration, no seed, no documented manual step. First resume upload fails on any fresh project.
2. **No consolidated setup documentation exists** for Supabase project bootstrap (migrations, seed, storage, Auth user), GitHub Actions secrets/vars, Vercel env vars, Telegram bot, or OpenRouter — an operator following only `docs/` and `reports/` cannot reconstruct a working deployment.
3. `WELLFOUND_FEED_URL` (N4, carried from `post-merge-audit.md`) remains unconfigured and undocumented — low severity (degrades gracefully per AD-10) but still an open gap in this agent's remit.

None of these require schema, scraper, or architecture changes — they are additive (a storage-policy migration + a setup doc + wiring one env var into `scrape.yml`). Recommend: Database/Architecture-approved migration adding the `resumes` bucket + storage policies, a new `docs/deployment.md` (or root `README.md`) covering the full staging checklist above, and `WELLFOUND_FEED_URL` added to `scrape.yml` once its expected value is specified. Re-run this audit after those land — at that point the repo should clear to **READY FOR STAGING**.
