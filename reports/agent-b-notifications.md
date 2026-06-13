# Notification Agent Report

Scope: `src/features/notifications/**` — Telegram notification reliability (`maintainability-audit.md` Finding #1, `security-audit.md` Finding #2).

Constraints honored: no schema changes, no architecture changes, no new dependencies, AD-08 (notify-at-most-once via `notifications_log`, gated on `ai_score`) preserved.

---

## 1. Markdown escaping → switched to HTML `parse_mode` + HTML-escaping

- **File:** `src/features/notifications/application/formatMatchMessage.ts`, `src/features/notifications/infrastructure/TelegramBotSender.ts`
- **Problem:** `match.title`, `match.companyName`, and `match.aiReasoning` (untrusted scraped/AI content) were interpolated unescaped into a message sent with `parse_mode: "Markdown"`. Any `_`, `*`, `` ` ``, or `[` in a job title (very common, e.g. `"Senior_Engineer"`) produces invalid Markdown and Telegram's API rejects the message.
- **Fix:** Of the two options in `security-audit.md` Finding #2 (escape Markdown special chars, or switch to HTML + HTML-escape), chose **HTML**: the escape set is just three characters (`&`, `<`, `>`) vs. MarkdownV2's eighteen, and legacy Markdown's four special chars (`_*`[`` ` ```) are common in real job titles and URLs (which also needed escaping under Markdown but not under HTML).
  - `TelegramBotSender.sendMessage` now sends `parse_mode: "HTML"`.
  - `formatMatchMessage` adds a local `escapeHtml()` helper (replaces `&` → `&amp;` first, then `<`/`>`) applied to `title`, `companyName`, `aiReasoning`, and `url` (job URLs can contain `&` in query strings).
  - Location tags are not escaped — they come from the fixed `LocationTag` enum, not external input.

## 2. Retry strategy — Telegram 429 (flood control)

- **File:** `src/features/notifications/infrastructure/TelegramBotSender.ts`
- **Problem:** `fetchWithRetry` (shared helper) only retries on network errors / 5xx; Telegram's rate-limit response is HTTP 429 with a `parameters.retry_after` (seconds) hint, which `fetchWithRetry` treats as final (`status < 500` → return immediately, no retry). A single chat can easily hit Telegram's per-chat rate limit when several matches are notified in one run.
- **Fix:** `TelegramBotSender.sendMessage` now checks for `status === 429` + `body.parameters.retry_after`, waits that long (capped at `MAX_RETRY_AFTER_MS = 30_000` so one flood-controlled send can't stall the cron job indefinitely), and retries the request once more. This is on top of (not a replacement for) `fetchWithRetry`'s existing 5xx/network-error retry — each call can now survive one 5xx *and* one 429.

## 3. Error handling — per-match isolation

- **File:** `src/features/notifications/application/sendNotification.ts`
- **Problem (`maintainability-audit.md` Finding #1):** the `for` loop had no try/catch. One match producing a Telegram-rejected payload or hitting a transient API error threw, aborting the whole batch — and since `markNotified` was never called for that match, `findUnnotifiedMatches` returns the same match (and everything behind it) on every future run, permanently starving the queue.
- **Fix:** each iteration's `formatMatchMessage` + `sendMessage` + `markNotified` is now wrapped in its own try/catch. On error, the failure is logged (see §4) and the loop `continue`s to the next match — no match behind a failing one is starved.
- **Behavior change:** `sendNotification`'s return value now means **successfully sent** (previously: total candidates). A failed match is neither marked notified nor counted, so it remains a candidate on the next run (consistent with AD-08 — "notify at most once," not "attempt at most once").

## 4. Logging

- **File:** `src/features/notifications/application/sendNotification.ts`
- Added `console.error(\`sendNotification: failed to notify job ${match.jobId}\`, error)` on a per-match failure — consistent with the existing scraper pattern (`console.warn`-and-continue per `architecture-audit.md` Finding #2's description of the source adapters) and with `maintainability-audit.md` Finding #1's recommended fix. No new logging infrastructure/dependency introduced (none exists in the codebase to reuse, and adding one is out of scope for this fix).

---

## Tests added

- `formatMatchMessage.test.ts`:
  - asserts `&`, `<`, `>` in `title`/`companyName`/`aiReasoning` are HTML-escaped (`&amp;`, `&lt;`, `&gt;`).
  - asserts a title containing `_`, `*`, `` ` ``, `[` passes through unchanged and the function doesn't throw (the original failure trigger under Markdown).
- `TelegramBotSender.test.ts`:
  - updated existing payload assertion to `parse_mode: "HTML"`.
  - new: retries once after `retry_after` on a 429 and succeeds on the retry.
  - new: still throws (with Telegram's `description`) if the retry after a 429 also fails.
- `sendNotification.test.ts`:
  - new: when `sendMessage` throws for match N, matches N+1 onward are still sent and `markNotified`'d, the failure is `console.error`-logged with the job id, and the returned count reflects only successful sends (2 of 3).

All 17 tests in `src/features/notifications/**` pass (`npx vitest run src/features/notifications`). `npx tsc --noEmit` clean.

---

## Findings resolved

- **`security-audit.md` Finding #2** — Resolved. `formatMatchMessage.ts` now HTML-escapes `&`/`<`/`>` in `title`, `companyName`, `aiReasoning`, and `url` before interpolation; `TelegramBotSender` sends with `parse_mode: "HTML"`. Regression test added covering the original failing input pattern (title with `_`).
- **`maintainability-audit.md` Finding #1** — Resolved. Per-match try/catch in `sendNotification.ts`; a failing send is logged and skipped, `markNotified` still runs for all other matches, and the failing match remains a candidate (not permanently skipped) on the next run.

---

## Notes / not changed

- `NotificationRepository`, `notifications_log` schema, and AD-08's one-time-notify guarantee are unchanged — no schema or architecture changes made.
- `fetchWithRetry` (`src/shared/infrastructure/http.ts`) is unchanged; the 429-specific retry is local to `TelegramBotSender` since it's Telegram-specific behavior (`retry_after` is a Telegram Bot API field, not generic HTTP) and `shared/infrastructure/**` is outside this agent's allowed files.
