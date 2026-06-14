# Test Report — Phase 4

**Date:** 2026-06-14
**Scope:** Validate Phase 3 implementation (PR A-D) against the Phase 1 findings and the V1 journey checklist.

---

## Automated Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass, 0 errors |
| `npx vitest run` | ✅ 130/130 tests pass across 28 files (was 129; +1 new test for `SupabaseNotificationRepository.listRecent`) |
| `npm run build` | ✅ Pass — `next build` compiles successfully, all 8 routes generated (`/dashboard`, `/roles`, `/settings`, `/resume`, etc.), `pdf-parse` resolves correctly under `serverExternalPackages`. (Initial attempt failed with "No space left on device" due to a full host disk — resolved after user freed space; unrelated to code changes.) |
| `pdf-parse` import resolution | ✅ Verified via `npx tsx -e "import pdf from 'pdf-parse'; console.log(typeof pdf)"` → `function` |
| Lint | N/A — no lint script configured in `package.json` |

---

## Journey Checklist

| # | Step | Status | Verification |
|---|---|---|---|
| 1 | **Resume Upload** | ✅ Fixed | `parsePdf.ts` now uses `import pdf from "pdf-parse"` (default import), matching the CJS `module.exports = Pdf` shape under `esModuleInterop`. Added `src/types/pdf-parse.d.ts` ambient declaration (package ships no types) — this was a pre-existing `TS7016` error on `main` for *any* import style, now resolved. Existing resume tests (11) still pass. **Not yet verified against a real PDF upload in a running app** — recommend a manual smoke test on staging. |
| 2 | **Role Expansion** | ✅ Unchanged, still passes | `expandRoleAction`/`OpenRouterRoleExpansionProvider` untouched; 3 tests pass. Preview now seeds `selectedRoles` with all expanded roles by default (opt-out model). |
| 3 | **Role Selection (granular)** | ✅ Implemented | `ExpandedRolesCard` chips are now toggleable buttons (`aria-pressed`, click to include/exclude). `RoleSelectorForm` tracks `selectedRoles` state; confirm button disabled when `selectedRoles.length === 0`. `docs/frontend.md:40` updated to describe the new interaction. |
| 4 | **Role Persistence** | ✅ Unchanged, still passes | `confirmRoleSelectionAction` → `setActiveRoleSelection` → `set_active_role_selection` RPC path untouched; now receives `selectedRoles` (a valid subset) instead of the full `relatedRoles` array. `validateExpandedRoles` already accepted any non-empty subset. |
| 5 | **Dashboard Navigation** | ✅ Implemented | After a successful confirm (or on load when the current selection matches the active one), `RoleSelectorForm` shows "Saved! This is now your active role selection." with a "View matching jobs →" link to `/dashboard`. Addresses the Step-2 navigation gap. |
| 6 | **Scraper Trigger Visibility** | ✅ Implemented (static help only, per architecture review scope) | `/settings` now shows a help card linking to the repo's GitHub Actions tab, explaining the scrape→score→notify pipeline runs via `workflow_dispatch`. In-app trigger explicitly out of scope (would need new ADR). |
| 7 | **Score Generation Visibility** | ✅ Implemented | `/dashboard` now distinguishes: no companies configured / no scrape runs yet / scraped-but-no-matches / scraped-but-unscored / normal results, using existing `companyRepository`, `scrapeRunRepository.listRecent(1)`, and `jobRepository.findForDashboard`. No new repository methods needed. |
| 8 | **Notification Generation Visibility** | ✅ Implemented | New `SupabaseNotificationRepository.listRecent(n)` (mirrors `SupabaseScrapeRunRepository.listRecent`), joins `notifications_log` → `jobs` for title/company/source. New `NotificationsLogList` component rendered in a new "Recent notifications" card on `/settings`. `docs/repositories.md` §6 updated. New unit test added and passing. |

---

## Files Changed (16)

- `src/features/resume/infrastructure/parsePdf.ts` — fixed import (PR A)
- `src/types/pdf-parse.d.ts` — new ambient type declaration (PR A)
- `src/components/roles/ExpandedRolesCard.tsx`, `src/components/roles/RoleSelectorForm.tsx`, `docs/frontend.md` — granular selection + save feedback/nav (PR B)
- `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/settings/page.tsx` — journey visibility banners + help card (PR C)
- `src/features/notifications/domain/types.ts`, `src/features/notifications/domain/NotificationRepository.ts`, `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` (+ test), `src/components/settings/NotificationsLogList.tsx`, `src/app/(protected)/settings/page.tsx`, `docs/repositories.md` — notifications log list (PR D)
- `src/features/notifications/application/sendNotification.test.ts` — updated mock to satisfy new `listRecent` interface member

No domain/application-layer changes outside the one additive `NotificationRepository.listRecent` method (approved in Phase 2). No new external dependencies, migrations, or RLS changes.

---

## Outstanding / Manual Verification Needed

1. **Live resume upload** — upload a real PDF on staging to confirm `parsePdf` works end-to-end at runtime (type-level fix + build verified; full pdf.js parse path not exercised by unit tests).
2. **Live role selection** — confirm chip toggling, save feedback, and "View matching jobs →" link render correctly in-browser.
3. **Open questions from Phase 1** (carried forward, still unresolved):
   - Is migration `20260612000006_fix_rpc_return_types.sql` applied to the staging Supabase project?
   - Are `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` set in the staging environment?
