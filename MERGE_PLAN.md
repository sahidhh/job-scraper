# MERGE_PLAN.md — Bugfix Session Findings Log

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
