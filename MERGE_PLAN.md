# MERGE_PLAN.md — Session Findings Log

## UX session — tabbed lazy-loaded pages + mobile responsiveness

**Session:** Presentation-layer UX pass: per-tab lazy data loading on the four main pages, plus a mobile-responsiveness audit of those pages + resume/applications flows at 375px.
**Date:** 2026-07-15
**Branch:** `claude/tabbed-lazy-mobile-ux-wy4x3r`
**Scope:** Presentation layer only — no domain/application behavior changes.

### 1. Tabbed pages with per-tab data loading

**Mapping performed first** (file:line) for all four pages (`/dashboard`, `/insights`, `/analytics`, `/settings`), proposed to the user, confirmed before building:

- **`/dashboard`** — one data-bearing section (`JobsSection`), already lazy via an internal `<Suspense>`. **No route split** — nothing to split, and forcing tabs onto a single-section page would be unjustified complexity.
- **`/insights`** — both cards ("Level up" / "In demand") derive from one shared `findRoleMatchedJobs` query, split into two views only via pure functions in memory. A route split would either share the fetch (no benefit) or duplicate it (extra round-trip, no reduction). **No route split** — instead wrapped the existing single fetch in `<Suspense>` with a skeleton so it streams instead of blocking the whole page.
- **`/analytics`** — had 13 independent repo calls in one `Promise.all`, all blocking before any of its 7 `<section>`s rendered. **Split into 4 route tabs**, each its own server component with a co-located `loading.tsx`: `/analytics` (Overview: pipeline + scoring queue + token stats), `/analytics/scraping` (Scraping & Scoring), `/analytics/breakdown` (Job Breakdown + Job metrics), `/analytics/sources` (source health).
- **`/settings`** — had 7 repo calls in one `Promise.all` feeding 4 already-visually-separated sections. **Split into 4 route tabs matching the existing `SectionLabel` groups verbatim**: `/settings` (Sources: companies, experience, thresholds, ranking), `/settings/workflow` (job statuses), `/settings/notifications` (notification filters), `/settings/activity` (scrape runs + notification log).

**Implementation:** New shared `src/components/layout/RouteTabs.tsx` client component (route-based `Link` tabs driven by `usePathname`, not client-side state — each tab is a distinct route/server component). Used by new `layout.tsx` files for `/analytics` and `/settings`.

**Revalidation paths updated** to follow their component's new tab location: `createStatusAction`/`updateStatusAction`/`deleteStatusAction` (`src/features/jobs/actions.ts`) now revalidate `/settings/workflow` instead of `/settings`; `setNotificationPreferencesAction` (`src/features/notifications/actions.ts`) now revalidates `/settings/notifications`. Company/experience/ranking actions (still on the `/settings` root/Sources tab) were left targeting `/settings` unchanged.

### 2. Mobile responsiveness audit (375px)

Audited `/dashboard`, `/insights`, `/analytics`, `/settings`, `/resume`, and the application-draft/resume-restore flows. Most of this was already well-built from an earlier session (`BottomNav`, mobile header in `AppShell`, `JobsTable`'s `JobCard`/`JobRow` split, `FilterBar`'s bottom-`Sheet` mobile filters, `JobStatusSheet`, shadcn `Table`'s built-in `overflow-x-auto` + `hidden md:table-cell` column-hiding already applied to `CompaniesTable`/`ScrapeRunsList`/`NotificationsLogList`, and `SourceHealthTable`/`ScrapeRunHealthTable`'s own `overflow-x-auto` dense tables). No table was found "genuinely unusable" as-is, so none were converted to card lists beyond what already existed.

Two concrete defects found and fixed:
- **`ApplicationDraftDialog.tsx`** — `DialogContent` had no `max-height`/scroll, so on short mobile viewports (e.g. iPhone SE, 375×667) the dialog's subject input + 10-row textarea + footer buttons could overflow past the visible viewport with the footer (Save/Send/Dismiss) clipped off-screen and unreachable. Fixed: `max-h-[85vh] overflow-y-auto` on `DialogContent`.
- **Tap targets below the 44px minimum** on the mobile job-card bottom bar: `JobCard.tsx`'s "View job" `<a>` had no explicit size (just an icon + `sr-only` text, effective tap target ~16×16px); `ApplicationDraftDialog`'s trigger button was `size-8` (32px). Fixed both to `size-11` (44px) on mobile, with `ApplicationDraftDialog`'s trigger reverting to `size-8` at `md:` since it's shared with the desktop `JobRow` table cell where a mouse pointer is used.

**Mobile QA checklist for manual testing (375px width):**
- [ ] Dashboard: bottom nav renders (Jobs/Analytics/Insights/Roles/Settings), FilterBar opens as a bottom sheet, job list renders as cards (not a squeezed table), each card's status pill opens a bottom sheet, tapping "View job" and the mail/draft icon both have a comfortably large tap target
- [ ] ApplicationDraftDialog: open on a short-viewport device (or resize browser height down) — confirm the dialog scrolls internally and the footer buttons (Save/Open in mail client/Dismiss) are always reachable
- [ ] Insights: two cards stack vertically, skeleton flashes briefly on load
- [ ] Analytics: tab bar (Overview/Scraping & Scoring/Job Breakdown/Sources) scrolls horizontally without breaking page layout, each tab loads independently with its own skeleton, charts/cards stack to one column
- [ ] Settings: tab bar (Sources/Workflow/Notifications/Activity) works the same way; companies table scrolls horizontally inside its own container rather than pushing the page wide; "Add company" dialog is usable
- [ ] Resume: upload card, skills editor, AI suggestions, and version history all readable/usable one-handed; restore buttons are tappable
- [ ] Verify no page has horizontal page-level scroll (only specific dense tables scroll internally)

### Verification

`npm run verify` (typecheck + lint + test + build) is green: 107 test files, 894 tests passing; production build succeeds with all new routes (`/analytics`, `/analytics/scraping`, `/analytics/breakdown`, `/analytics/sources`, `/settings`, `/settings/workflow`, `/settings/notifications`, `/settings/activity`) present in the route table.

Docs updated in the same commit per `CLAUDE.md`'s document-maintenance rules: `docs/frontend.md` (route structure + components table), `design/user-guide.md`, `design/api-reference.md` (Next.js App Routes table), `design/use-cases.md`, `design/limitations.md`, `design/scope.md` (path references to the two sections that moved off the `/settings` root: Status Management → `/settings/workflow`, Notification filters → `/settings/notifications`).

---

# Bugfix Session Findings Log

**Session:** Real-world manual testing failures (three issues reported by the user after live use of `/resume`).
**Date:** 2026-07-15
**Branch:** `claude/exciting-dijkstra-3vf0yo`
**Discipline followed:** reproduce → isolate → fix → regression test, per `engineering:debug`.

This file did not exist prior to this session (the repo's only prior `merge-plan.md` is `reports/merge-plan.md`, an unrelated Phase-1 agent-merge review from 2026-06-13). Created fresh per this session's done-criteria.

---

## Bug 1 — PDF upload: "Invalid PDF structure", yet row persists

**Reported symptom:** Clicking upload throws "Invalid PDF structure"; after a page reload the resume appears in version history anyway.

### 1a. Atomicity

**Traced:** `ResumeUploadCard.tsx` → `uploadResumeAction` (`src/features/resume/actions.ts`) → `uploadResume()` (`src/features/resume/application/uploadResume.ts`) → `SupabaseResumeRepository.create()` → `set_active_resume` RPC.

**Found:** `uploadResumeAction` uploaded the file to Supabase Storage (`upsert: true`, deterministic `<sha256>.<ext>` path) **before** calling `uploadResume()`, which only then parsed and validated the text. A parse/validation failure after a successful Storage upload left an orphaned Storage object with no `resumes` row pointing at it. This never surfaced directly to the user as a phantom row (`listVersions()` reads the `resumes` table, not Storage), but it is real waste and a latent inconsistency, and combines with Bug 2 (below) in the following way: since a DB insert can now be verified to succeed at the SQL level while still throwing an error to the JS layer (Bug 2's root cause), the previous Storage-before-DB-insert ordering meant *any* post-upload failure — not just a parse failure — could leave Storage and the DB out of sync with no cleanup path.

**Fix:** Reordered to parse + validate **first**; only then upload to Storage, then insert the DB row. If the DB insert fails after the Storage upload succeeded, the Storage object is now removed (best-effort). Implemented via a new `ResumeStorage` port (`domain/ResumeStorage.ts`, `infrastructure/SupabaseResumeStorage.ts`) injected into `uploadResume()`, keeping the Storage client out of the application layer per this codebase's repository-pattern/layering rules. See AD-40.

**Regression tests** (`uploadResume.test.ts`, new `describe("atomicity...")` block):
- parser throws → no Storage upload, no DB row
- parsed text fails validation → no Storage upload, no DB row
- Storage upload happens only after parse+validation succeed, and before the DB insert (order asserted)
- DB insert failure after a successful Storage upload → Storage object is removed
- a failure during that cleanup removal does not mask the original DB error
- cache-hit path (identical content_hash) still uploads to Storage (idempotent, deterministic path) — not skipped, only parsing is skipped

**Cleanup:** `scripts/sweep-stranded-resumes.ts` (`npm run sweep:stranded-resumes`) added — read-only by default report of (a) Storage objects with no referencing `resumes.file_path` row, and (b) any `resumes` row with suspiciously short `parsed_text` (defensive; no such row should be reachable given `validateParsedText` already gated every persist path in this codebase's history, before and after this fix — none were found by inspection, but the check costs nothing to leave for a human to run and confirm against the live database). Pass `--delete-orphaned-storage` to actually remove confirmed-orphaned Storage objects; DB rows are never auto-deleted by this script.

### 1b. Parser

**Found:** `pdf-parse@1.1.1` (last published years ago) bundles its own old, pinned internal PDF.js fork rather than depending on the actively-maintained `pdfjs-dist` package. That pinned fork is a well-documented source of `"Invalid PDF structure"` for real-world PDFs using newer spec features (incremental updates, PDF 1.7+/2.0 xref streams, certain encrypted-but-empty-password documents).

**Not confirmed against the user's actual failing file** — it was not available as a fixture when this fix was made. Per the task's "ask before guessing" instruction, the assistant attempted to ask before deciding, but the question tool call did not return a response in this session; the assistant proceeded on `pdf-parse`'s well-documented brittleness (a defensible default, not a blind guess) rather than block the rest of the session. **If the same file still fails to parse against the new `pdfjs-dist`-based parser, that points to a different root cause and should be re-investigated with the actual file as a fixture.**

**Fix:** Swapped `parsePdf.ts` from `pdf-parse` to `pdfjs-dist`'s Node ("legacy") build (`pdfjs-dist/legacy/build/pdf.mjs`). Same public contract (`parsePdf(buffer): Promise<string>`), so no caller changed. `pdf-parse` removed from dependencies along with its ambient type file (`src/types/pdf-parse.d.ts`); `next.config.ts`'s `serverExternalPackages` updated. See AD-41.

**Regression tests** (new `parsePdf.test.ts` — `pdf-parse` had none previously): a hand-written, byte-offset-correct minimal single-page PDF fixture (same "no binary checked in" convention as `parseDocx.test.ts`) verifying real text extraction, plus a non-PDF-buffer failure case.

### Stranded-row sweep

No evidence of any *existing* stranded `resumes` row was found by code-path inspection (every `resumeRepository.create()` call site, before and after this session's fixes, is preceded by `validateParsedText`). The sweep script above exists to let the user confirm this against the live database and to catch orphaned *Storage* objects, which the code-path inspection cannot rule out (Storage writes were never gated on DB success before this fix).

---

## Bug 2 — restore: "set_active_resume returned no row"

**Traced:** `ResumeVersionHistory.tsx` → `restoreResumeVersionAction` → `restoreResumeVersion()` → `SupabaseResumeRepository.create()` → `set_active_resume` RPC → migrations.

**Root cause, confirmed empirically against a local Postgres 16 instance (not mocked):** `20260612000006_fix_rpc_return_types.sql` had already fixed `set_active_resume` to `returns setof resumes` (so PostgREST serializes an array, matching `database.types.ts`'s `Returns: ...[]` and `SupabaseResumeRepository.create`'s `data?.[0]`). Two later migrations that added unrelated columns — `20260618000002_resume_versioning.sql` (version numbers) and `20260710000001_resumes_content_hash.sql` (content hash) — each had to drop+recreate the function to change its signature, and both recreated it as a bare `returns resumes` (a single composite, not a set), silently undoing the earlier fix. Neither migration's comments mention the return type at all.

**Verification performed:**
```sql
-- Applied the full migration chain to a scratch local database, then:
select proname, proretset from pg_proc where proname = 'set_active_resume';
--  proretset = f   (before this session's fix — confirms non-setof)
--  proretset = t   (after 20260715000002 — confirms setof)

-- Simulated PostgREST's actual serialization difference:
select row_to_json(t) from set_active_resume(...) t;   -- pre-fix: bare {"id": ...} object
select json_agg(t)   from set_active_resume(...) t;   -- post-fix: [{"id": ...}] array
```
A non-setof function's PostgREST response is a bare JSON object; `data?.[0]` on an object is always `undefined`, regardless of whether the underlying `INSERT` succeeded — and it does succeed (the row was visible in `resumes` immediately after the "no row" error was thrown against the pre-fix function). This was purely a return-shape bug, not a transaction or permissions issue.

**Checked and ruled out, per the task's checklist:**
- **UUID vs text WHERE-clause mismatch:** N/A — the function has no `WHERE id = ...` matching path; it deactivates *all* currently-active rows then inserts a new one (AD-09's "single active" swap pattern), so there's no id-typing mismatch to have.
- **RLS / SECURITY DEFINER:** The function is `SECURITY INVOKER` (no `security definer` clause) — runs as the calling role. `resumes`' RLS policy (`authenticated_full_access`, `using (true) with check (true)`) permits the `UPDATE`/`INSERT`/`RETURNING` for the `authenticated` role regardless, so this was not a factor.
- **Does the function `RETURN` at all:** Yes — this was never the issue; the function always returns (or returned) its result, just in the wrong shape for the repository code's assumption.
- **Interaction with Bug 1's stranded rows (empty `parsed_text`):** No evidence found — see "Stranded-row sweep" above.

**Fix:** New forward migration `20260715000002_fix_set_active_resume_setof_regression.sql`, restoring `returns setof resumes` with the current (4-arg) signature/body otherwise unchanged. `database.types.ts` required no change (it already correctly declared the setof/array shape — the SQL had drifted from the types, not the other way around). See AD-39.

**Regression tests:**
- `SupabaseResumeRepository.test.ts`: new test asserting that a bare-object RPC response (the exact shape the broken SQL produced) still throws the same clear `"set_active_resume returned no row"` error rather than silently misbehaving — pins the client-side symptom of this class of regression.
- **Integration-style test of the actual SQL function:** attempted per the task's instruction, but this sandbox has no `pg` npm client dependency and no Docker/Supabase-CLI-local available for a live-Postgres-backed automated test in `npm test`. Manual verification was performed instead (commands above, against a real local `postgresql-16` install) and is documented in the migration file's own comment and in this findings log so it can be re-run identically if `set_active_resume`'s `returns` clause is ever touched again. This is flagged as a real gap: consider adding a `pg`-backed integration test (or a lightweight `pg_proc.proretset` check runnable in CI against a Supabase preview branch) in a future session if this class of regression recurs.

**Docs corrected:** `design/api-reference.md` §4 previously documented the *broken* bare-`resumes` return type as if it were correct (encoding the bug into the docs) — fixed to `RETURNS SETOF resumes` with a note. `docs/repositories.md` §3 updated similarly (was also missing the `p_content_hash` parameter that had been added since it was last touched).

---

## Issue 3 — LLM provider consolidation

**Reported symptom:** Drafting fails with `Missing required environment variable: GEMINI_API_KEY`.

**Decision (per task instruction):** Route `llmClient.ts`'s default provider through the *existing* `openrouterClient.ts` client and `OPENROUTER_API_KEY`, using model `google/gemini-2.5-flash`, instead of requiring a second provider key.

**Implementation:**
- `openrouterClient.ts` gained `callOpenRouterCompletion()` — a plain (non-schema) chat completion, sharing a new internal `sendOpenRouterRequest()` helper with the existing schema-constrained `callOpenRouterJson()` so the endpoint/auth/retry/error-classification logic isn't duplicated.
- `llmClient.ts`'s `LlmProvider` gained `"openrouter"`, now the default (`currentLlmProvider()`'s fallback). The new `callOpenRouter()` branch maps `{system, user}` to chat messages and `jsonMode` to OpenRouter's loose `json_object` mode (not a strict schema — callers already parse leniently via `lenientJson.ts`). `OpenRouterError`s are now mapped to `LlmError` with their original `reason` preserved (previously fell through to a generic `"unknown"`).
- `"gemini"`/`"anthropic"` (direct REST) remain fully intact and selectable via `LLM_PROVIDER` — the provider abstraction itself is unchanged, only the default.

**Regression tests:** `llmClient.test.ts` restructured — former "gemini (default provider)" block is now "gemini (LLM_PROVIDER=gemini)" (explicitly sets the env var), new "openrouter (default provider)" block covers the new default path (model default, `LLM_MODEL` override, `jsonMode` → `json_object`, 402 → `quota_exceeded` reason preservation). `openrouterClient.test.ts` gained a `callOpenRouterCompletion` describe block.

**Docs updated:** `.env.example`, `design/tech-stack.md` §3, `design/security.md` §5, `design/architecture.md` §10, `design/api-reference.md` §3.1b, `design/scope.md` §3, `design/use-cases.md`.

**What to put in `.env.local`:** nothing new is *required*. If `OPENROUTER_API_KEY` (and `OPENROUTER_MODEL`, for scoring) is already set, drafting and resume suggestions now work with no further changes — `GEMINI_API_KEY` can be removed from `.env.local` entirely unless you want to explicitly opt a caller into direct Gemini (set `LLM_PROVIDER=gemini` and keep `GEMINI_API_KEY` set) or direct Anthropic (`LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`).

---

## Verification

`npm run verify` (typecheck + lint + test + build) is green: 107 test files, 894 tests passing; production build succeeds. See `docs/decisions.md` AD-39 through AD-42 for full rationale/alternatives-considered per change.
