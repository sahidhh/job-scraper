# Staging Validation Report — Phase 1 (Investigation Only)

**Date:** 2026-06-14
**Scope:** Validate deployed Job Intelligence Platform against expected V1 user journey:
Upload Resume → Select Roles → Add Companies → Run Scraper → Generate Scores → Receive Telegram Notification → View Ranked Jobs

No code was modified during this phase.

---

## P1 — Resume Upload Broken

**Symptom:** `(0 , pdf_parse__WEBPACK_IMPORTED_MODULE_0__.pdf) is not a function`

**Root Cause:** `src/features/resume/infrastructure/parsePdf.ts:1` uses `import { pdf } from "pdf-parse";` — a named import. `pdf-parse@1.1.1` is a pure CJS module (`node_modules/pdf-parse/index.js:4` — `module.exports = Pdf;`), with no named `pdf` export and no `.default`. Under webpack/Next.js CJS→ESM interop this resolves `pdf` to `undefined`, and calling it throws exactly the observed error.

`next.config.ts:4` (`serverExternalPackages: ["pdf-parse"]`) is correctly configured — that is **not** the problem.

**Severity:** P1 — 100% failure rate on resume upload, core feature completely broken.

**Files Involved:**
- `src/features/resume/infrastructure/parsePdf.ts:1,7` — incorrect import/call
- `src/features/resume/actions.ts:23-56` — server action; error correctly caught and surfaced, not the source of the bug
- `next.config.ts:4` — correct, no change needed

**Code Path:**
`ResumeUploadCard.tsx` → `actions.ts:23` `uploadResumeAction` (server action) → `parsePdf.ts:7` (`pdf(data)` → `undefined(data)` → TypeError) → caught in `actions.ts:54-56` → surfaced to UI as the error string.

**Recommended Fix:** Single-line change in `parsePdf.ts:1`. Replace the named import with one of:
1. `import pdf from "pdf-parse";` (default import — try first)
2. `const pdf = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;` (CJS require — most robust fallback, file is server-only/infrastructure)

Entirely contained within the infrastructure layer (`docs/architecture.md:184` already designates this module as the sole pdf-parse consumer). No domain/application/UI/config changes required.

**Confidence:** High (root cause). Medium on which exact import variant resolves cleanly under Next.js interop — recommend trying default import first, falling back to `require`.

---

## P1 — Role Selection: No Granular Selection + "Frozen" Save/Continue

### Issue A: No granular role selection

**Root Cause:** `ExpandedRolesCard.tsx:24-28` renders AI/seed-expanded roles as a flat, read-only list of `Badge` chips — no checkbox/toggle, no per-item selection state. `RoleSelectorForm.tsx:46,49` always passes the *entire* `preview.relatedRoles` array to `confirmRoleSelectionAction` — all-or-nothing activation. `docs/frontend.md:40` documents this same all-or-nothing spec, so this is a real feature gap vs. the staging requirement, not a regression.

**Severity:** Medium (feature works end-to-end, but granular selection — a stated requirement — doesn't exist).

**Files Involved:**
- `src/components/roles/ExpandedRolesCard.tsx:24-28`
- `src/components/roles/RoleSelectorForm.tsx:46,49`
- `src/features/roles/domain/types.ts:15-18`

**Recommended Fix:** UI-only. Add `selectedRoles: string[]` state in `RoleSelectorForm`, render toggleable chips/checkboxes in `ExpandedRolesCard`, pass `selectedRoles` (not the full `relatedRoles`) to `confirmRoleSelectionAction`. `validateExpandedRoles` already accepts any non-empty subset — no domain/application/infrastructure/RPC changes needed.

**Confidence:** High.

### Issue B: Save/Continue appears frozen

**Root Cause:** Not a hang or swallowed error — the RPC call, types, and RLS are all consistent (verified against migration `20260612000006_fix_rpc_return_types.sql` and `database.types.ts`). It's a **UI feedback gap**: on success, `RoleSelectorForm.tsx` sets `confirmed=true`, which disables the confirm button and relabels it "Active selection" (`ExpandedRolesCard.tsx:30-34`). There is no success toast, no redirect, and no "Continue" affordance — a user sees the button go from enabled→disabled with a subtle label change and perceives it as stuck.

Secondary factor: if `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are unset on staging, `expandRoleAction` fails and shows an error message that could be missed/conflated with "Save" by the user.

**Severity:** Medium (UX/perception bug — persistence works correctly when it succeeds).

**Files Involved:**
- `src/components/roles/RoleSelectorForm.tsx:26-29,45-56`
- `src/components/roles/ExpandedRolesCard.tsx:30-34`
- `src/features/roles/actions.ts:32-47`
- `src/features/roles/infrastructure/SupabaseRoleRepository.ts:53-64`

**Recommended Fix:** UI-only. Add explicit success feedback (e.g. "Saved! This is now your active role selection.") and/or a clear completed-state indicator (checkmark + "Saved"). Add a "View matching jobs →" link to `/dashboard` once confirmed (also addresses the navigation gap below — same component, same fix).

Also: verify `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are set in the staging environment (ops/config check, not a code bug).

**Confidence:** Medium (data path verified High via code/types/migration; staging env vars and whether migration 20260612000006 is actually applied to the staging DB could not be verified from code alone).

---

## P1 — No Clear User Flow After Role Selection / Scraping / Scoring / Notifications

**Root Cause:** The backend pipeline (scrape → score → notify) and data model are correctly implemented and tested, but the UI provides no navigation or status visibility connecting the journey steps. Specifically:

| Step | Status | Root Cause | Severity |
|---|---|---|---|
| 1. Upload Resume | UI present | Minor: no CTA to `/roles` after upload | Low |
| 2. Select Roles | UI present, **no post-confirm navigation** | `RoleSelectorForm.tsx:45-56` sets `confirmed=true` but never `router.push("/dashboard")` or renders a continue link | **High** |
| 3. Add Companies | UI exists but buried | Company CRUD fully implemented under `/settings` (`src/app/(protected)/settings/page.tsx:32-44`), but `/settings` is framed as admin config, not as a journey step — not discoverable as "step 3" | Medium |
| 4. Run Scraper | **Backend-only, zero UI trigger** | Scraping runs only via `scripts/scrape.ts` + `.github/workflows/scrape.yml` (`workflow_dispatch`, cron intentionally commented out per Phase 4 go-live decision). No in-app button or status. `ScrapeRunsList` in `/settings` is history-only | **Critical** |
| 5. Generate Scores | Automatic but invisible | `scripts/score.ts` runs as pipeline step 2 automatically; dashboard shows "No AI reasoning available yet." for unscored jobs but gives no explanation of pipeline state | High |
| 6. Telegram Notification | Automatic, zero UI feedback | `scripts/notify.ts` runs as pipeline step 3; `notifications_log` table exists but has no corresponding UI component anywhere | Medium |
| 7. View Ranked Jobs | UI present and functional | Dashboard correctly renders scored jobs via `JobsTable`/`JobRow`/`FilterBar`. Terminal node of an otherwise disconnected graph — first-time users can't reach a populated dashboard without out-of-band knowledge | None (itself) |

**Per `docs/deployment.md` / `docs/architecture.md`:** the scrape→score→notify pipeline being GitHub-Actions-only (no in-app trigger) during staging is **intentional by design** — this is documented and not a bug. However, the missing roles→dashboard navigation (step 2) is a genuine UI gap not covered by docs.

**Recommended Fixes (description only):**
1. **Step 2 (High):** In `RoleSelectorForm.tsx` `handleConfirm`, after success, redirect to `/dashboard` or render a "View matching jobs →" link. (Same fix as Issue B above — one component, one change.)
2. **Step 3 (Medium):** Add a contextual "No companies configured — add some in Settings" prompt on `/dashboard` or `/roles` when `companyRepository.list()` is empty, mirroring the existing "Choose a role" CTA pattern.
3. **Step 4 (Critical, presentation-only option):** Add a static help card on `/settings` near `ScrapeRunsList` explaining that scraping runs via GitHub Actions (`workflow_dispatch`) with a link to the Actions tab. (A fuller "trigger from UI" option would require a new infrastructure adapter + PAT secret — new architecture, needs separate approval/ADR.)
4. **Step 5 (High):** On `/dashboard`, when active selection exists but jobs are zero or all-unscored, distinguish "nothing scraped yet" vs "scraped, awaiting scoring" using existing `jobRepository`/`scrapeRunRepository` reads — no new domain/application code.
5. **Step 6 (Medium):** Add a read-only `NotificationsLogList` component to `/settings` (mirrors `ScrapeRunsList`), backed by a new `SupabaseNotificationRepository.listRecent(n)` method implementing the existing `NotificationRepository` interface. **New repository method — flag per CLAUDE.md/docs/agent-workflow.md escalation rules.**
6. **Optional cross-cutting:** A "Getting started" checklist widget on `/dashboard` linking Resume → Roles → Settings(Companies), shown only while setup is incomplete.

**Confidence:** High — confirmed via direct reads of routes, components, scripts, workflow config, and docs; absence-of-code checks (no `router.push`/`<Link>` post role-confirm; no non-script caller of the scraper pipeline) corroborated by `docs/deployment.md`.

---

## Summary Table

| # | Issue | Severity | Layer(s) Touched | Confidence |
|---|---|---|---|---|
| 1 | pdf-parse import broken — resume upload fails | P1 / Critical | Infrastructure (1 file, 1-2 lines) | High |
| 2a | No granular role selection | Medium | UI only | High |
| 2b | Save/Continue appears frozen (no success feedback/navigation) | Medium | UI only | Medium |
| 3 | Steps 2-6 of journey lack navigation/visibility | High/Critical (step 4) | UI only, except step 6 (1 new repo method) | High |

All recommended fixes are minimal and stay within existing clean-architecture layering (domain/application/infrastructure/UI). Only item 3, fix #5 (notifications log list) introduces a new repository method and should be flagged for approval before implementation, per CLAUDE.md.

---

## Open Questions for Phase 2 (Architecture Review)

1. Confirm fix approach for pdf-parse (default import vs. `require`) — may need a quick spike to verify which resolves correctly under Next.js's `serverExternalPackages` interop.
2. Confirm whether migration `20260612000006_fix_rpc_return_types.sql` is applied to the staging Supabase project (cannot verify from code).
3. Confirm `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are set in staging env.
4. Approve/reject the new `NotificationRepository.listRecent(n)` method for the notifications log UI (fix #5 above).
5. Decide scope for Step 4 (scraper trigger): static help banner only (minimal) vs. in-app trigger (new architecture, separate ADR).
