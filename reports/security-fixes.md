# Security Fixes — P3 & U3

**Agent:** Security Agent
**Date:** 2026-06-13
**Scope:** `post-merge-audit.md` Open Findings P3 (service-role key CI boundary) and U3 (resume upload storage-path filename).

---

## Findings Resolved

### P3 — `security-audit.md` #3: no CI/lint boundary check for `SUPABASE_SERVICE_ROLE_KEY`

Added an automated check enforcing that `SUPABASE_SERVICE_ROLE_KEY` and `createSupabaseServiceClient()` only appear under `scripts/**` and `src/shared/infrastructure/supabaseClient.ts` (AD-12). Wired into a new CI workflow that runs on every push/PR and fails the build on violation.

### U3 — `security-audit.md` #1: resume upload uses raw `file.name` in Storage path

`uploadResumeAction` now derives the Storage object path from `Date.now()` + `randomUUID()` only — `file.name` (client-controlled) is no longer used in the path, eliminating the path-traversal/collision risk. Original filename is not currently displayed anywhere, so no separate storage of it was needed (no schema change).

---

## Files Changed

- `scripts/checkServiceRoleBoundary.ts` (new) — walks `src/` and `scripts/` for `.ts`/`.tsx` files, flags any occurrence of `SUPABASE_SERVICE_ROLE_KEY` or `createSupabaseServiceClient` outside `scripts/**` and `src/shared/infrastructure/supabaseClient.ts`, exits non-zero on violation.
- `package.json` — added `check:service-role-boundary` script (`tsx scripts/checkServiceRoleBoundary.ts`).
- `.github/workflows/ci.yml` (new) — runs `npm ci` + `npm run check:service-role-boundary` on `push`/`pull_request`.
- `src/features/resume/actions.ts` — `uploadResumeAction`: `filePath` changed from `` `${Date.now()}-${file.name}` `` to `` `${Date.now()}-${randomUUID()}.pdf` ``; added `import { randomUUID } from "node:crypto"`.

No domain/application/infrastructure layers, schema, or scraper code touched. No new dependencies.

---

## Validation

- `npx tsx scripts/checkServiceRoleBoundary.ts` → "Service-role key boundary check passed." (current codebase has zero violations — `createSupabaseServiceClient` usages confined to `scripts/scrape.ts`, `scripts/score.ts`, `scripts/notify.ts`, and `src/shared/infrastructure/supabaseClient.ts`).
- `npx tsc --noEmit` → clean, no errors.
- `npx vitest run` → 28 test files / 129 tests, all passing (no regressions).

---

## Remaining Security Debt

- **U4** (Low, `maintainability-audit.md` #3) — `hasScore` dead code in `ScoreRepository`/`SupabaseScoreRepository` + tests. Unrelated to security; Cleanup Agent's item.
- **U5** (Medium/Low, Performance Agent) — `SupabaseJobRepository`/`SupabaseNotificationRepository` query-pattern findings. No security impact; deferred to Phase 2 per `post-merge-audit.md`.
- **U6** (by design) — cron `schedule:` trigger in `.github/workflows/scrape.yml` remains commented out pending Phase 4 human go-live decision. No change made here.
- **N4** (Low) — `WELLFOUND_FEED_URL` not configured in `scrape.yml`. Operational, not security; Deployment Agent's item.
- **N6** (Low) — no root `.gitignore`. Recommend adding before any push to a shared remote; out of scope for this pass (Cleanup/Deployment Agent).
- The new CI check is regex/substring-based (no AST parsing) — sufficient for these two literal identifiers, but a renamed export or re-exported alias (e.g. `export { createSupabaseServiceClient as makeServiceClient }`) from an allowed file and re-imported elsewhere would not be caught. Not a current risk (no such alias exists), flagged for awareness only.

---

## Decision

**READY FOR DEPLOYMENT REVIEW**

Both merge-condition blockers from `post-merge-audit.md` (P3, U3) are resolved with passing `tsc`/`vitest` and no regressions. Remaining items (U4, U5, U6, N4, N6) are explicitly Low/deferred and were already classified as non-blocking for the deployment-review gate.
