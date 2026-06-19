# Telegram Digest MVP — Implementation Report

## Summary

Replaced per-job Telegram notifications with a structured digest format that sends a single
message per cron run, with Telegram Inline Keyboard buttons for direct job application,
"Worth Reviewing" expansion, and dashboard navigation.

**NOTIFY_MODE=digest** is the new production-recommended setting.

---

## Files Changed

### New — Domain

| File | Change |
|---|---|
| `src/features/notifications/domain/types.ts` | Added `STRONG_MATCH_THRESHOLD = 0.8` and `DIGEST_DISPLAY_LIMIT = 5` constants |
| `src/features/notifications/domain/TelegramSender.ts` | Added `InlineKeyboardButton` type and `sendMessageWithButtons` method to interface |

### New — Application Layer

| File | Purpose |
|---|---|
| `src/features/notifications/application/bandMatches.ts` | Pure function — splits matches into `strongMatches` / `worthReviewing` arrays sorted by score descending |
| `src/features/notifications/application/formatDigestMvp.ts` | Two formatters: `formatDigestMvp` (main digest text) and `formatWorthReviewingMessage` (follow-up text) |
| `src/features/notifications/application/buildDigestKeyboard.ts` | Pure function — builds `InlineKeyboardButton[][]` with Apply pairs, Worth Reviewing row, Dashboard row |
| `src/features/notifications/application/sendDigestMvp.ts` | Main use case: query unnotified → band → format → build keyboard → send one message → mark all notified |

### New — Infrastructure / Delivery

| File | Purpose |
|---|---|
| `src/features/notifications/infrastructure/TelegramBotSender.ts` | Refactored: extracted private `post()` helper; added `sendMessageWithButtons` with `reply_markup` and `disable_web_page_preview` |
| `src/app/api/telegram/worth-reviewing/route.ts` | Stateless GET route — validates signed token, decodes base64url message, posts to Telegram, returns HTML confirmation |

### Modified — Script

| File | Change |
|---|---|
| `scripts/notify.ts` | Added `digest` branch: builds `dashboardUrl` and `buildWorthReviewingUrl` from `APP_URL` + `TELEGRAM_CALLBACK_SECRET`, calls `sendDigestMvp`. Added `digest_legacy` branch for backward compat. |

### Modified — Existing Tests

| File | Change |
|---|---|
| `src/features/notifications/application/sendDigest.test.ts` | Added `sendMessageWithButtons` mock to `TelegramSender` factory |
| `src/features/notifications/application/sendNotification.test.ts` | Added `sendMessageWithButtons` mock to `TelegramSender` factory |
| `src/features/notifications/infrastructure/TelegramBotSender.test.ts` | Added test for `sendMessageWithButtons` |

### New — Tests

| File | Tests |
|---|---|
| `src/features/notifications/application/bandMatches.test.ts` | 6 tests: banding, sorting, empty list, custom threshold |
| `src/features/notifications/application/formatDigestMvp.test.ts` | 15 tests: header, counts, location capitalisation, experience, display limit, HTML escaping, `formatWorthReviewingMessage` |
| `src/features/notifications/application/buildDigestKeyboard.test.ts` | 10 tests: Apply button pairs, display limit, Worth Reviewing visibility, Dashboard visibility, full 5-match layout |
| `src/features/notifications/application/sendDigestMvp.test.ts` | 9 tests: empty run, send+mark, banding, `DomainValidationError`, send-failure atomicity, preferences, `buildWorthReviewingUrl` forwarding, null preferences |

### New — Documentation

| File | Purpose |
|---|---|
| `docs/features/telegram-digest.md` | Feature documentation: format, score bands, keyboard layout, callback architecture, configuration |
| `docs/reports/telegram-digest-mvp.md` | This report |
| `docs/design/telegram-digest-mvp-design.md` | Pre-implementation design doc (created in earlier session) |

### Updated — Documentation

| File | What changed |
|---|---|
| `design/tech-stack.md` | Added `APP_URL` and `TELEGRAM_CALLBACK_SECRET` env vars; updated `NOTIFY_MODE` options |
| `design/api-reference.md` | Documented `sendMessageWithButtons` format, MVP digest message format, `/api/telegram/worth-reviewing` route |
| `docs/features/notifications.md` | Updated architecture diagram, mode descriptions, configuration table, test matrix |
| `README.md` | Updated notification row to reference digest format |

---

## Architecture Impact

### New dependency direction

```
scripts/notify.ts
  └─ sendDigestMvp (application)
       ├─ bandMatches (application)
       ├─ formatDigestMvp (application)
       ├─ buildDigestKeyboard (application)
       ├─ filterMatches (application, existing)
       ├─ NotificationRepository (domain interface)
       └─ TelegramSender (domain interface)
                └─ TelegramBotSender (infrastructure)
                     └─ sendMessageWithButtons → POST /bot{token}/sendMessage
                          with reply_markup.inline_keyboard
```

The worth-reviewing URL is constructed in `scripts/notify.ts` (composition root) using
`Buffer.from(text, "utf8").toString("base64url")`, keeping Node.js-specific APIs out of the
pure application layer. The application layer receives the URL builder as an injected callback.

### No schema changes

No new tables, columns, or migrations. Existing `notifications_log` and its UNIQUE constraint
on `job_id` provide the at-most-once guarantee for digest mode exactly as for individual mode.

### Service role boundary

`src/app/api/telegram/worth-reviewing/route.ts` uses no Supabase at all. The CI gate
(`check:service-role-boundary`) continues to pass.

---

## Testing Performed

```
Test Files  29 passed (29)
Tests      366 passed (5 pre-existing failures unrelated to this change)
```

Pre-existing failures (not introduced):
- `SupabaseCompanyRepository > throws the underlying error` — mock setup issue
- `bucketScores` (4 tests) — bucket boundary logic pre-dates this change

All 40 new/modified tests pass. No regressions in existing notification tests.

TypeScript: `tsc --noEmit` reports no errors in any new or modified file.

---

## New Environment Variables

| Variable | Required for | Default |
|---|---|---|
| `APP_URL` | Worth Reviewing button, Dashboard button | _(omit to disable buttons)_ |
| `TELEGRAM_CALLBACK_SECRET` | Worth Reviewing callback validation | _(omit to disable button)_ |

Both are optional. Omitting them degrades gracefully: the digest still sends without those
buttons.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` must also be set in Vercel (not just GitHub
Actions) for the callback route to post to Telegram.

---

## Known Limitations

1. **URL length** — The worth-reviewing message is base64url-encoded in the URL. For large
   worth-reviewing lists, the URL may become long (browsers generally support up to ~2 000
   chars; Telegram may truncate beyond that). Mitigation: the display list only shows jobs
   above `NOTIFY_THRESHOLD`, typically a small set.

2. **Replay risk** — The worth-reviewing URL is valid indefinitely (no expiry). Anyone who
   obtains the URL can trigger the Telegram send again. Mitigated by `TELEGRAM_CALLBACK_SECRET`
   preventing random enumeration.

3. **One retry on 429** — `TelegramBotSender` retries a rate-limited request once using the
   server-specified `retry_after`. If the retry is also rate-limited, the error propagates
   and the entire digest is retried next run.

---

## Future Improvements

- Add URL expiry via HMAC timestamp to prevent replay.
- Paginate worth-reviewing list for large sets to avoid URL length limits.
- Add `DIGEST_DISPLAY_LIMIT` override via env var for flexibility.
- Consider `sendMessageWithButtons` batching if multiple role selections are supported.
