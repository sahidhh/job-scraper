# Architecture Review — Phase 2

**Date:** 2026-06-14
**Input:** `reports/staging-validation-report.md` (Phase 1, investigation only)
**Reviewed against:** CLAUDE.md, docs/architecture.md, docs/agent-workflow.md, docs/frontend.md

No code modified during this phase.

---

## Finding 1 — pdf-parse import bug

**Verdict: APPROVED WITH MODIFICATIONS (use exact fix specified below)**

- `src/features/resume/infrastructure/parsePdf.ts:1,7` — 100% contained in infrastructure layer, correct per `docs/architecture.md` §5 rule 3. No leakage.
- `tsconfig.json:14` has `esModuleInterop: true` → `import pdf from "pdf-parse";` (Option 1, default import) correctly binds to the CJS `module.exports = Pdf` function. **This is the fix.**
- No `require()` precedent anywhere in `src/` (codebase is ESM, `package.json` `"type": "module"`, `isolatedModules: true`) — `require()` cast (Option 3) would be a new, inconsistent pattern. Use only as a documented fallback if Option 1 fails to resolve under Next.js webpack interop at runtime, with a comment explaining the deviation.
- Single-line change, no abstraction. No domain/application/UI/config changes.

---

## Finding 2a — Granular role selection

**Verdict: APPROVED AS-IS**

- `ExpandedRolesCard.tsx:24-28` / `RoleSelectorForm.tsx:46,49` — genuinely UI-only. `validateExpandedRoles` (`src/features/roles/domain/validation.ts:14-21`) already accepts any non-empty subset; `confirmRoleSelectionAction` (`actions.ts:32-47`) needs zero signature changes.
- Use a local `Set<string>`/`useState<string[]>` toggle — no new shared multi-select component needed.
- **Doc update required (same PR):** `docs/frontend.md:40` documents `ExpandedRolesCard` chips as read-only — update to describe them as selectable. Doc-drift fix, not an architecture change, no ADR needed.

---

## Finding 2b — Save/Continue feedback + navigation

**Verdict: APPROVED AS-IS**

- `RoleSelectorForm.tsx:26-29,45-56` / `ExpandedRolesCard.tsx:30-34` — pure presentation change: success message + `<Link href="/dashboard">` after `confirmed=true`. `confirmRoleSelectionAction` already calls `revalidatePath("/dashboard")` (`actions.ts:41`) — data is fresh.
- **This is the same fix as Finding 3 item 1** (Step 2 navigation) — one change, one component, do not duplicate.
- No toast library or global notification state needed — extend the existing button-state branch in `ExpandedRolesCard.tsx:30-34`.
- `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` env check is ops/config, out of scope for code.

---

## Finding 3 — Journey navigation/visibility (items 1-6)

**Item 1 (Step 2 nav):** Duplicate of Finding 2b — implement once, same component.

**Item 2 (Step 3 — empty-companies prompt):** APPROVED AS-IS. Mirrors existing "Choose a role" CTA pattern (`dashboard/page.tsx:55-57`). `companyRepository.list()` already exists (used at `settings/page.tsx:18`) — no new method, presentation-only.

**Item 3 (Step 4 — scraper trigger visibility):** APPROVED AS-IS, **static help card only**.
- Pure UI: `Card`/`Alert` + external link to GitHub Actions tab near `ScrapeRunsList` in `/settings`.
- **In-app scraper trigger is explicitly NOT approved for this batch** — would require new infrastructure adapter + GitHub PAT secret = new external dependency = needs its own ADR in `docs/decisions.md` and separate architect sign-off per `docs/agent-workflow.md` escalation table. Out of scope here.

**Item 4 (Step 5 — scrape/score status distinction):** APPROVED AS-IS. Uses existing `SupabaseScrapeRunRepository.listRecent(20)` (already used at `settings/page.tsx:19`) and `jobRepository.findForDashboard()` (`dashboard/page.tsx:66`) — branch on `jobs.length === 0` vs `scrapeRuns.length === 0`. Presentation logic only, no layering concern.

**Item 5 (Step 6 — NotificationsLogList + `SupabaseNotificationRepository.listRecent(n)`):** **APPROVED — in-scope additive work, lightweight sign-off only.**
- Per `docs/agent-workflow.md` escalation table, "new repository method" technically triggers escalation. However:
  - `SupabaseScrapeRunRepository.listRecent(20)` is a **structurally identical precedent** (same shape, same purpose: read-only history list for `/settings`).
  - `NotificationLogEntry` domain type (`src/features/notifications/domain/types.ts:4-8`) **already exists**, mirrors `notifications_log`, currently has no reader — appears anticipatory of this exact UI.
  - Adds a read method to an *existing* repository implementing an *existing* `NotificationRepository` interface (`src/features/notifications/domain/NotificationRepository.ts:3-13`). No migration, no RLS, no `src/shared/**` change, no external dependency, no ADR rationale altered.
- **Verdict:** does not need a pre-implementation sign-off gate. Note the `listRecent(20)` precedent + pre-existing `NotificationLogEntry` type in the PR description; update `docs/repositories.md` in the same PR (satisfies CLAUDE.md doc-update rule). Reviewer approval at PR time is sufficient.

**Item 6 (Optional "Getting started" checklist widget):** APPROVED AS-IS but **defer to follow-up**. Self-described as optional/lowest priority; items 1-5 already establish full step-by-step navigability. Adding it now increases PR surface without being on the critical path.

---

## PR Scoping Recommendation

Per CLAUDE.md "minimal changes, no unrelated refactors" — split into 4 PRs (disjoint file sets, verified no overlap):

1. **PR A — pdf-parse fix (Finding 1).** `parsePdf.ts`, 1 line. P1/Critical, ship first, zero dependencies.
2. **PR B — Role selection UX (Findings 2a + 2b + Finding 3 item 1).** `RoleSelectorForm.tsx` + `ExpandedRolesCard.tsx` + `docs/frontend.md:40` doc update. All three are the same files/unit of work.
3. **PR C — Dashboard/Settings visibility (Finding 3 items 2, 3, 4).** `/dashboard` empty-companies prompt, `/settings` scraper help card, `/dashboard` scrape-status distinction. Disjoint from PR B's client components.
4. **PR D — Notifications log list (Finding 3 item 5).** `src/features/notifications/**` new repo method + test, new `/settings` component, `docs/repositories.md` update. Isolated so the repo-method note doesn't hold up A/B/C.

**Item 6 deferred** to a follow-up ticket, not part of this batch.

---

## Blockers Before Phase 3

1. None of the 4 findings are architecturally blocked — all fixes correctly scoped to their layers.
2. **Finding 1:** verify `import pdf from "pdf-parse"` resolves correctly under Next.js webpack interop with `serverExternalPackages: ["pdf-parse"]` via a real upload test. Fall back to `require()` cast + explanatory comment only if needed (would be the first `require()` in `src/`).
3. **Finding 3 item 3:** only the static help card is in scope — in-app scraper trigger excluded from this batch, would need separate ADR.
4. **Finding 3 item 5:** lightweight PR-description note + reviewer approval citing `listRecent(20)` precedent; update `docs/repositories.md` in same PR.
5. **Open questions #2/#3 from Phase 1** (migration `20260612000006` applied to staging? `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` set?) are ops/verification tasks — don't block code implementation, but confirm before Phase 4/5 validation since they could partially explain Finding 2b's symptom.

**All 4 findings APPROVED to proceed to Phase 3 implementation under the PR split above.**
