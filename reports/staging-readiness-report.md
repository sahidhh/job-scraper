# Staging Readiness Report — Phase 5

**Date:** 2026-06-14
**Cycle:** Staging Validation (Phases 1-4 complete — see `reports/staging-validation-report.md`, `reports/architecture-review.md`, `reports/test-report.md`)

---

## 1. Can a user upload a resume?

**Yes (code-level).** Fixed the P1 `pdf-parse` import bug (`src/features/resume/infrastructure/parsePdf.ts` — default import + new `src/types/pdf-parse.d.ts` declaration). `tsc`, full test suite (130/130), and `npm run build` all pass with `pdf-parse` resolving correctly under `serverExternalPackages`.

**Caveat:** not yet exercised against a real PDF in a running app — recommend one manual upload on staging to close the loop.

---

## 2. Can a user select roles?

**Yes, with the originally-requested granularity.** `/roles` now lets a user expand a primary role, then click individual related-role chips to include/exclude them before confirming (`ExpandedRolesCard` + `RoleSelectorForm`). Confirm is disabled until at least one role is selected. Persistence path (`confirmRoleSelectionAction` → `set_active_role_selection` RPC) is unchanged and was already verified correct in Phase 1.

---

## 3. Can a user run scraping?

**Yes, but only via GitHub Actions (`workflow_dispatch`) — by design, not from the app UI.** This was confirmed intentional for staging per `docs/architecture.md`/`docs/deployment.md` (cron schedule deliberately commented out pending the Phase 4 go-live decision). `/settings` now has a help card pointing the user to the repo's Actions tab and explaining the pipeline, closing the "how is scraping triggered?" visibility gap. An in-app trigger button was explicitly scoped out (would require a new infrastructure adapter + GitHub PAT — separate ADR).

---

## 4. Can jobs be viewed?

**Yes.** `/dashboard` renders `JobsTable`/`JobRow`/`FilterBar` from `jobRepository.findForDashboard`, unchanged and previously verified working. New: the dashboard now also explains *why* the table might be empty (no companies configured / no scrape runs yet / scraped-but-no-matches / scraped-but-unscored), so a first-time user isn't looking at a silent empty page.

---

## 5. Can scoring be generated?

**Yes, automatically as part of the scrape→score→notify pipeline** (`scripts/score.ts`, unchanged). The dashboard now distinguishes "scraped but not yet scored" from other empty/zero states, so the user can tell scoring just hasn't run yet vs. something being broken.

---

## 6. Can notifications be sent?

**Yes, automatically as part of the same pipeline** (`scripts/notify.ts` → Telegram, unchanged). New: `/settings` has a "Recent notifications" list (`NotificationsLogList`, backed by new `SupabaseNotificationRepository.listRecent(n)`) so the user can verify in-app that notifications were actually sent, rather than relying solely on Telegram delivery or GitHub Actions logs.

---

## 7. Is the system READY FOR STAGING VALIDATION PASS?

**Yes — all 4 P1 findings from Phase 1 are resolved at the code level, architecture-reviewed (Phase 2), implemented (Phase 3), and pass typecheck/build/full test suite (Phase 4, 130/130 tests).**

The full intended journey (Upload Resume → Select Roles → Add Companies → Run Scraper → Generate Scores → Receive Telegram Notification → View Ranked Jobs) now has either a working UI step or, where the step is intentionally backend/cron-only (scraping, scoring, notification), a clear in-app explanation of how/when it runs and where to check its status.

### Before declaring the staging pass complete, confirm these ops items (carried from Phase 1, not code blockers):

1. Migration `20260612000006_fix_rpc_return_types.sql` is applied to the staging Supabase project.
2. `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` are set in the staging environment (role expansion depends on these).
3. One manual end-to-end pass on the deployed staging instance:
   - Upload a real PDF resume.
   - Expand a role, toggle a few related-role chips, confirm, follow "View matching jobs →".
   - Add a company in Settings, trigger the GitHub Actions pipeline via `workflow_dispatch`, and confirm `/dashboard` and `/settings` (scrape runs + notifications log) reflect the run.

No further code changes are required to proceed with the staging validation pass, pending the above ops confirmations and manual smoke test.
