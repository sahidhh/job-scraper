# Deployment

Consolidated setup guide for taking a fresh clone of this repo to a working staging deployment (Vercel + Supabase + GitHub Actions + Telegram + OpenRouter). See `.env.example` for the full list of environment variables referenced below.

## 1. Supabase Project Setup

1. Create a new Supabase project (https://supabase.com/dashboard).
2. From **Project Settings → API**, record:
   - Project URL → used for both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`.
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (cron scripts only — never expose to the browser; boundary enforced by `scripts/checkServiceRoleBoundary.ts`).

## 2. Migrations

Apply the schema in `supabase/migrations/` (7 forward-only files, AD-11) to the new project:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies enums, tables, indexes, RPC functions, table RLS (`20260612000005_rls.sql`), and the `resumes` storage bucket + policy (`20260612000007_storage_resumes.sql`).

## 3. Seed Data

`supabase/seed.sql` seeds `role_expansion_map` with `source='seed'` rows (common role clusters) using `on conflict (role) do nothing` — safe to run once, and safe to re-run. Apply it manually against the linked project via the Supabase SQL editor or:

```sh
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

Not auto-applied by `db push` or CI (database.md §7).

## 4. Storage Bucket & Policies

`20260612000007_storage_resumes.sql` (applied in step 2) creates the `resumes` bucket (private) and a single `storage.objects` policy (`authenticated_full_access_resumes`) granting the `authenticated` role full access scoped to `bucket_id = 'resumes'` (database.md §8, AD-12 shape).

After `supabase db push`, verify in the dashboard under **Storage**:
- A bucket named `resumes` exists and is **private**.
- **Storage → Policies → resumes** shows `authenticated_full_access_resumes` covering select/insert/update/delete for the `authenticated` role.

No manual bucket creation is required if the migration applied successfully.

## 5. Auth User

This is a single-user app with no signup page (frontend.md §1). Create the one account manually:

**Authentication → Users → Add user** — enter an email and password. Use these credentials to log into the deployed app.

## 6. Vercel Setup

1. Import the repo into Vercel as a Next.js project (default build settings work — `next build`).
2. Set the following **Project → Settings → Environment Variables** (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `KEYWORD_THRESHOLD` (optional, defaults to `0.5`)
   - `NOTIFY_THRESHOLD` (optional, defaults to `0.75`)
3. Deploy. `NEXT_PUBLIC_*` vars are required at boot (`supabase/server.ts`, `supabase/middleware.ts` call `requireEnv`) — the app will fail to start without them. `OPENROUTER_*` are only required for `/roles` AI role-expansion fallback (AD-06); if missing, that one action degrades to an inline error rather than crashing the app.

## 7. GitHub Actions Secrets & Variables

`.github/workflows/scrape.yml` and `ci.yml` read the following. Set them under **repo Settings → Secrets and variables → Actions**:

**Secrets:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WELLFOUND_FEED_URL` (optional — see step 9; leave unset for degraded mode)

**Variables** (optional — `optionalEnv` defaults to `0.5`/`0.75` if unset):
- `KEYWORD_THRESHOLD`
- `NOTIFY_THRESHOLD`

`ci.yml`'s service-role-boundary check (`npm run check:service-role-boundary`) needs no secrets — it's a static check over the source tree.

## 8. Telegram Setup

1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts to name the bot. BotFather replies with a token — this is `TELEGRAM_BOT_TOKEN`.
2. Add the new bot to the chat/channel you want notifications sent to (for a personal chat, start a conversation with the bot directly).
3. Get `TELEGRAM_CHAT_ID`:
   - Send any message to the bot/chat.
   - Call `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates` in a browser and read `result[0].message.chat.id` from the JSON response.
4. Set both values as GitHub Actions secrets (step 7).

## 9. OpenRouter Setup

1. Create an account at https://openrouter.ai and generate an API key → `OPENROUTER_API_KEY`.
2. Pick a model and set `OPENROUTER_MODEL` to its OpenRouter model id (e.g. `anthropic/claude-3.5-sonnet` — check https://openrouter.ai/models for current ids and per-token pricing before choosing, since this is billed per call).
3. Used in two places:
   - `scripts/score.ts` — AI-refined scoring (AD-07), runs every pipeline execution.
   - `features/roles/actions.ts` (`expandRoleAction`) — AI fallback for role expansion (AD-06), runs only when a `primary_role` isn't already cached in `role_expansion_map`.
4. Set the same `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` for both Vercel (step 6) and GitHub Actions (step 7) — same account, both contexts call the OpenRouter API independently.

## 10. Wellfound Feed (Optional)

`WELLFOUND_FEED_URL` is **optional**. If unset, the Wellfound source adapter logs a warning and contributes zero jobs every run (AD-10 degraded mode) — every other source is unaffected. See `docs/scrapers.md` §5 for the expected feed shape if you want to configure this later. **No action needed for staging or go-live.**

## 11. First `workflow_dispatch` Run

The cron `schedule:` in `scrape.yml` is intentionally commented out pending go-live approval (AD-04, U6) — until then, the pipeline only runs on manual dispatch:

1. Ensure steps 1–9 are complete (all required secrets set).
2. Add at least one row to `companies` via `/settings` (Greenhouse/Lever/Ashby + `board_token`), or accept zero ATS coverage initially — RemoteOK still runs with no config (AD-05).
3. **GitHub repo → Actions → Scrape pipeline → Run workflow** (manual `workflow_dispatch`).
4. Confirm the run completes: `scrape` → `score` → `notify` jobs all succeed (green).
5. Check `scrape_runs` table (or `/dashboard` recent-runs view) for one row per source with `status = 'success'`.

## 12. Go-Live Checklist

- [ ] Supabase project created; URL + anon + service-role keys recorded.
- [ ] `supabase db push` applied all 7 migrations.
- [ ] `supabase/seed.sql` applied once.
- [ ] `resumes` bucket exists (private) with `authenticated_full_access_resumes` policy.
- [ ] Auth user created (Authentication → Users → Add user).
- [ ] Vercel project deployed with all required env vars set.
- [ ] GitHub Actions secrets + (optional) variables set.
- [ ] Telegram bot created, token + chat id set.
- [ ] OpenRouter account + API key + model set.
- [ ] At least one `companies` row added via `/settings` (optional — RemoteOK works without).
- [ ] Manual `workflow_dispatch` run of `scrape.yml` completes successfully.
- [ ] Logged into the deployed app; `/dashboard`, `/roles`, `/resume`, `/settings` all load.
- [ ] Test PDF uploaded on `/resume` — confirms `resumes` bucket + policy work end-to-end.
- [ ] `ci.yml` passing on the deployed branch (typecheck, tests, service-role-boundary check).
- [ ] Cron `schedule:` in `scrape.yml` remains commented out until a human explicitly approves go-live per `agent-workflow.md` Phase 4 (cost/security re-audit gate) — enabling it is a separate, deliberate step, not part of staging.
