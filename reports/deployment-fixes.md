# Deployment Fixes

**Agent:** Deployment Agent
**Date:** 2026-06-13
**Scope:** Resolve blockers from `reports/deployment-readiness.md` (BLOCKED) without architecture changes.

---

## Files Changed

1. **`supabase/migrations/20260612000007_storage_resumes.sql`** (new) — creates the `resumes` Storage bucket (private) and a single `storage.objects` policy (`authenticated_full_access_resumes`, scoped to `bucket_id = 'resumes'`), following the same single-policy-per-table shape as `20260612000005_rls.sql` (AD-12). Forward-only (AD-11).
2. **`docs/deployment.md`** (new) — consolidated setup guide: Supabase project + migrations + seed, storage bucket/policy verification, Auth user, Vercel env vars, GitHub Actions secrets/vars, Telegram bot setup, OpenRouter setup, first `workflow_dispatch` run, and a go-live checklist.
3. **`.env.example`** (new) — canonical list of all env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `KEYWORD_THRESHOLD`, `NOTIFY_THRESHOLD`, `WELLFOUND_FEED_URL`) with context comments per usage site.
4. **`docs/database.md`** — added §8 "Storage" documenting the `resumes` bucket, its policy, and how `resumes.file_path` relates to it.
5. **`docs/scrapers.md`** — added §5 "Wellfound feed configuration": documents degraded-mode default (unset = 0 jobs, safe for staging) and the expected JSON array shape (`isWellfoundEntry`/`toRawJob` field mapping) for operators who later want to wire a feed.
6. **`.github/workflows/scrape.yml`** — added optional `WELLFOUND_FEED_URL: ${{ secrets.WELLFOUND_FEED_URL }}` to the `npm run scrape` step env, with a comment noting it's optional/degrades gracefully if unset.

No `src/**` code changes; `tsc --noEmit` clean, `npm run check:service-role-boundary` passes.

---

## Deployment Blockers Resolved

| `deployment-readiness.md` item | Resolution |
|---|---|
| #1 `resumes` bucket not created by anything | Migration 007 creates it |
| #2 No storage policies for `resumes` | Migration 007 adds `authenticated_full_access_resumes` |
| #3 GitHub Actions secrets undocumented | `docs/deployment.md` §7 |
| #4 GitHub Actions variables undocumented | `docs/deployment.md` §7 |
| #5 `WELLFOUND_FEED_URL` unset/undocumented | `docs/scrapers.md` §5 (degraded mode + shape) + wired into `scrape.yml` as optional secret |
| #6 Vercel env vars undocumented | `docs/deployment.md` §6 |
| #7 Auth user creation not in deploy flow | `docs/deployment.md` §5 |
| #8 Seed step timing/how unclear | `docs/deployment.md` §3 |
| #9 No `.env.example` | Created |
| #10 No `supabase db push` step documented | `docs/deployment.md` §2 |
| Missing-doc #1 No root deployment doc | `docs/deployment.md` (full guide) |
| Missing-doc #2 `database.md` doesn't document bucket | `docs/database.md` §8 |
| Missing-doc #3 Wellfound feed format unspecified | `docs/scrapers.md` §5 |
| Missing-doc #4 No Telegram setup doc | `docs/deployment.md` §8 |
| Missing-doc #5 No OpenRouter setup doc | `docs/deployment.md` §9 |

---

## Remaining Deployment Risks

1. **Migration 007 not yet applied to any live Supabase project.** `supabase db push` must be run against staging before the first resume upload; bucket/policy correctness can't be exercised by `tsc`/`vitest` (no integration test against real Supabase Storage) — only by the manual upload step in `docs/deployment.md` §12.
2. **`storage.objects` RLS policy change** — per `agent-profiles.md`, RLS policy changes normally route through Database Agent + architect sign-off. This migration was authored under this task's explicit "if architecture permits, create a migration for storage policies" instruction; recommend a quick Database Agent confirmation pass before/with `supabase db push`, consistent with normal process.
3. **`WELLFOUND_FEED_URL` remains unset by design** — Wellfound contributes 0 jobs until an operator stands up a feed matching `docs/scrapers.md` §5's shape. Per AD-10 this is silent/operationally invisible (looks identical to "no new postings"); acceptable for staging, just worth knowing.
4. **Cron `schedule:` stays commented (U6, AD-04)** — correct by design, pending Phase 4 human go-live approval per `agent-workflow.md`. Not a regression, but the operator must run the pipeline manually (`workflow_dispatch`) for staging data.
5. Non-blocking carry-overs unaffected by this pass: U4 (`hasScore` dead code), U5 (Phase 2 perf findings).

---

## Decision

# READY FOR STAGING

All blockers identified in `deployment-readiness.md` are resolved additively (one new forward-only migration, two new files, two doc sections, one workflow env line) — no architecture, schema-design, or storage-redesign changes. `tsc --noEmit` and `check:service-role-boundary` both pass. Remaining items are operational steps (apply migration 007 + seed to a real project, run the go-live checklist in `docs/deployment.md` §12) rather than code/doc gaps. Recommend: Database Agent sign-off on migration 007 (per item #2 above), then proceed through `docs/deployment.md`'s staging checklist.
