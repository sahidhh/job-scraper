# Maintainability Review Audit

Scope: duplicate code/types, dead code, overengineering, premature/missing abstractions across `src/`.

---

## Findings

### 1. Notification send loop has no error isolation — one bad message blocks all subsequent notifications permanently

- **Severity:** High
- **File:** `src/features/notifications/application/sendNotification.ts:20-24`
- **Location:**
  ```ts
  for (const match of matches) {
    await deps.telegramSender.sendMessage(message);
    await deps.notificationRepository.markNotified(match.jobId);
  }
  ```
  (no try/catch around the loop body)
- **Description:** `TelegramBotSender.sendMessage` (`src/features/notifications/infrastructure/TelegramBotSender.ts:28-30`) throws an `Error` if `!response.ok || !body.ok`. If any single `match` produces a message that Telegram's API rejects (e.g., due to the unescaped-Markdown issue in security-audit Finding #2, or a transient Telegram API error), `sendMessage` throws inside the loop. Because there's no try/catch, the `for` loop — and the entire `sendNotification` call — aborts immediately. The failing `match` (and every match after it in `matches`) never reaches `markNotified`.
- **Why it matters:** This is the most operationally dangerous finding in the codebase. On the *next* run, `findUnnotifiedMatches` will return the same failing match again (since it was never marked notified) at the same position (assuming stable ordering), causing the same throw on the same item, forever. Every match "behind" that one in the list is permanently starved of notifications — a single bad job posting (e.g., a title containing an unescaped `_`) silently breaks the entire notification pipeline for all future runs, with no error surfaced anywhere a user would see it (this is a cron job — failures go to GitHub Actions logs at best).
- **Recommended fix:** Wrap each iteration's send+mark in its own try/catch; on error, `console.error` (or log to a table) the failure with the `match.jobId` and `continue` to the next match, rather than aborting the whole batch. Combine with security-audit Finding #2 (Markdown escaping) to address both the trigger and the blast radius.

---

### 2. `RoleSelectorForm`'s local `Preview` interface duplicates the `RoleMapSource` domain type

- **Severity:** Low
- **File:** `src/components/roles/RoleSelectorForm.tsx` (~line 10-13)
- **Location:**
  ```ts
  interface Preview {
    relatedRoles: string[];
    source: "seed" | "ai";
  }
  ```
- **Description:** `@/shared/domain/enums` already defines `RoleMapSource` as the canonical `"seed" | "ai"` union (backing the `role_expansion_map.source` enum column and `database.types.ts`). `RoleSelectorForm` redeclares an inline literal union `"seed" | "ai"` for `Preview.source` instead of importing and reusing `RoleMapSource`.
- **Why it matters:** CLAUDE.md explicitly prohibits "duplicated types." If `RoleMapSource` ever gains a third value (e.g., a future `"manual"` override source), this component's `Preview.source` type would silently continue accepting only `"seed" | "ai"`, and TypeScript would not catch the drift since the two types aren't linked — a runtime value of `"manual"` would be assignable to `Preview.source` only via an unsound cast or would be a type error that's confusing to debug because it references an unrelated-looking local interface.
- **Recommended fix:** `import type { RoleMapSource } from "@/shared/domain/enums"` and use `interface Preview { relatedRoles: string[]; source: RoleMapSource; }`.

---

### 3. `hasScore` on `ScoreRepository`/`SupabaseScoreRepository` is unused

- **Severity:** Low
- **File:** `src/features/scoring/infrastructure/SupabaseScoreRepository.ts` (and corresponding domain interface)
- **Location:** `hasScore(jobId, roleSelectionId)` method — confirmed via grep to have zero callers in `src/` (only its own test).
- **Description:** `insertScore` already uses `upsert(..., { onConflict: "job_id,role_selection_id", ignoreDuplicates: true })`, which makes a separate existence check unnecessary for the current `scoreJob` flow — the upsert itself is idempotent. `hasScore` appears to be vestigial from an earlier "check-then-insert" design that was superseded by the upsert-with-ignore-duplicates approach.
- **Why it matters:** Low — it's tested and harmless, but it's dead surface area that someone maintaining this repository has to read, understand, and keep passing tests for no functional benefit. `repositories.md` §5 notes it as "future-use," but per CLAUDE.md's anti-overengineering guidance ("Don't design for hypothetical future requirements"), speculative unused methods should generally be removed until actually needed.
- **Recommended fix:** Remove `hasScore` from both the `ScoreRepository` domain interface and `SupabaseScoreRepository`, plus its test, unless there's a concrete near-term caller (e.g., if architecture-audit Finding #1's `scripts/score.ts` will use it — in which case keep it and note the intended caller in `repositories.md` instead of "future-use").

---

### 4. `recordRun` on `ScrapeRunRepository` is implemented and tested but has zero callers

- **Severity:** Low
- **File:** `src/features/sources/infrastructure/SupabaseScrapeRunRepository.ts:23-32`
- **Description:** Same shape as Finding #3 — fully implemented, tested, unused. Unlike `hasScore`, this one has a clear intended caller (the not-yet-written `scripts/scrape.ts`, per architecture-audit Findings #1-2), so it's reasonable to keep as-is pending that implementation rather than delete.
- **Why it matters:** Low — flagged for completeness; this is "dead code with a known future caller" rather than "speculative dead code," so the maintainability concern is minor (it's currently unreachable but not orphaned-by-design).
- **Recommended fix:** No action needed beyond architecture-audit Finding #1/#2 (implement the caller). If those scripts are descoped instead, revisit whether `recordRun`/`listRecent` and the `scrape_runs` table itself should be removed.

---

### 5. `createSupabaseServiceClient` is unused dead code (cross-reference)

- **Severity:** Low
- **File:** `src/shared/infrastructure/supabaseClient.ts`
- **Description:** See security-audit Finding #3 — same "unused pending cron implementation" pattern as Finding #4 above.
- **Why it matters / Recommended fix:** See security-audit Finding #3 and architecture-audit Finding #1.

---

## Summary of Compliant Areas (no action needed)

- **No `any` usage**: exhaustive grep for `: any`, `<any>`, `as any`, `any[]`, `, any`, `any,`, `(any` across `src/` returns zero true matches — CLAUDE.md's "Never introduce `any`" rule is fully honored.
- **No forbidden libraries**: grep across `package.json` and `src/` confirms no `prisma`, `drizzle`, `zustand`, `redux`, or `react-query`/`@tanstack/react-query` dependencies or imports — CLAUDE.md's forbidden-dependency list is fully honored.
- **`skills-dictionary.ts`** is correctly shared/centralized — both resume-skill-extraction (`resume` feature) and job-skill-extraction (`scoring`/`filtering` features) import the same `extractSkills`/`computeKeywordScore` from one shared module; no duplicated keyword-matching logic found across features.
- **`fetchWithRetry`** is the single shared HTTP helper used by all 5 scraper adapters — no duplicated retry/backoff logic (see scraper-audit summary).
- **`stripHtml`/`normalizeWhitespace`** (`shared/infrastructure/text.ts`) are the single shared text-normalization helpers used by all adapters — no duplicated regex-based HTML stripping across scrapers.
- **`DomainValidationError`** is consistently used as the single domain-validation error type across features (`roles`, `companies`, `resume`) — no per-feature duplicated error classes for the same concept.
- **`ActionResult<T>`** typed-result pattern is used consistently across all `actions.ts` files for server-action returns — no feature reinvents its own success/error envelope.
- **Pure-function filtering domain** (`src/features/filtering/domain/{types,validation}.ts`): `isKnownLocationTag`, `hasAllowedLocation`, etc. are pure, side-effect-free, and reused by both the (future) scrape pipeline and the dashboard filter validation — good composition per CLAUDE.md's "prefer composition / pure functions" guidance.
- **No premature abstraction layers found** beyond the documented clean-architecture split — each feature's `domain`/`application`/`infrastructure` separation corresponds to actual distinct responsibilities (validation rules, orchestration, external I/O), not speculative indirection.
