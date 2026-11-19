---
id: T010
title: Interactive 8-card Telegram notifier replacing single-message digest dump
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T009]
requirements: [REQ-F014]
---
# Objective
Replace the single-message digest dump in `scripts/notify.ts` with up to 8 individual compact HTML per-job cards per day, each featuring `[🔗 Apply]` (`url`), `[✅ Applied]` (`st:applied:<jobId>`), `[⏭️ Skip]` (`st:skipped:<jobId>`), and `[🚫 Closed]` (`st:closed:<jobId>`) inline buttons.

# Context
- `scripts/notify.ts` currently branches on `NOTIFY_MODE` (`individual` vs `digest` vs `digest_legacy`).
- `TelegramSender` (`TelegramBotSender.ts`) already supports `sendMessageWithButtons(text, buttons)`.
- Spec §6: up to 8 compact HTML cards/day showing title, company, location, `minYears`, score, freshness badge (`🆕 <24h` when applicable), and 1-line highlight, sent to `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

# Inputs
- `scripts/notify.ts`
- `src/features/notifications/domain/types.ts` (from T009)
- `src/features/notifications/domain/TelegramSender.ts`
- `src/features/notifications/application/buildJobHighlights.ts`
- `src/features/notifications/application/sendNotification.ts`

# Scope
Included: Card formatter (`formatJobCard.ts`), card inline keyboard builder (`buildJobCardKeyboard.ts`), `sendDailyCards` (or updated `sendNotification` / `notify.ts` default mode) capping at 8 jobs/day and marking sent jobs notified, plus unit tests.
Excluded: Webhook callback handling (T011).

# Implementation guidance
1. Create `formatJobCard(match: JobMatch, now?: Date): string` producing compact, HTML-escaped Telegram card text: title, company, location tags, `minYears` (if present), score percentage, `<24h` freshness badge (if `postedAt` < 24h), and 1-line highlight via `buildJobHighlights`.
2. Create `buildJobCardKeyboard(match: JobMatch): InlineKeyboardButton[][]` with:
   - Row 1: `[{ text: "🔗 Apply", url: match.url }]`
   - Row 2: `[{ text: "✅ Applied", callback_data: "st:applied:" + match.jobId }, { text: "⏭️ Skip", callback_data: "st:skipped:" + match.jobId }, { text: "🚫 Closed", callback_data: "st:closed:" + match.jobId }]`
   - Note: Telegram `callback_data` max is 64 bytes; UUID (36 chars) + `"st:skipped:"` (11 chars) = 47 bytes (safe).
3. Cap daily delivery at `MAX_DAILY_CARDS = 8` (top 8 from T009-sorted unnotified matches, after `filterMatches` preferences). Mark only the sent cards as notified (`markNotified` per sent card, isolating per-card failures as in `sendNotification.ts`).
4. Wire `scripts/notify.ts` so the daily card mode is the default (while keeping `NOTIFY_MODE=digest` / `individual` fallback if explicitly set, or making `cards` the default).

# Expected outputs
- `src/features/notifications/application/formatJobCard.ts` & `.test.ts`
- `src/features/notifications/application/buildJobCardKeyboard.ts` & `.test.ts`
- `src/features/notifications/application/sendDailyCards.ts` & `.test.ts`
- Updated `scripts/notify.ts`

# Acceptance criteria
Blocking:
- [ ] AC-010-1: At most 8 cards are sent per run, ordered by T009 ranking, and only successfully sent cards are marked notified.
- [ ] AC-010-2: Each card includes HTML-escaped title, company, location, `minYears`, score, freshness badge (when `<24h`), 1-line highlight, and the 4 inline buttons with exact `st:<action>:<jobId>` callback payloads (≤ 64 bytes).
Quality:
- [ ] Reuses `buildJobHighlights` and `escapeHtml` rather than duplicating formatting helpers.
Compatibility:
- [ ] `notifyPendingDrafts` in `scripts/notify.ts` continues to run after card delivery.

# Verification
- `npx vitest run src/features/notifications`
- `npm run typecheck`

# Constraints
- Do not create a new Telegram bot or change env var names (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).

# Handoff
Return: status, summary, changed files, test results.

# Failure handling
- If `callback_data` could exceed 64 bytes for non-UUID IDs, validate length in `buildJobCardKeyboard`.
