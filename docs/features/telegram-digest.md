# Telegram Digest MVP

## Overview

`NOTIFY_MODE=digest` sends a single, structured Telegram message per cron run, replacing the
previous per-job (`individual`) and grouped-text (`digest_legacy`) formats.

The digest uses Telegram Inline Keyboard buttons — direct apply links plus optional
"Worth Reviewing" and Dashboard shortcuts — so the user can act on matches without leaving
Telegram.

---

## Message Format

### Main Digest Message

```
📌 Job Matches

⭐ Strong Match: 3   ✓ Worth Reviewing: 4

Showing Top 3 Strong Match(es):

1. Senior Backend Engineer @ Stripe
   📍 Singapore | 3+ yrs

2. Staff Software Engineer @ Shopify
   📍 Remote

3. Platform Engineer @ Grab
   📍 Singapore | 5+ yrs
```

Inline keyboard buttons below the message:

```
[Apply #1]  [Apply #2]
[Apply #3]
[✓ Worth Reviewing (4)]
[📊 Dashboard]
```

### Worth Reviewing Follow-Up

Sent to Telegram when the user taps "Worth Reviewing":

```
✓ Worth Reviewing Jobs

1. Full Stack Developer @ Acme Corp (76%)
   📍 Remote

2. React Developer @ Startup (72%)
   📍 India
```

---

## Score Bands

| Band | Condition | Behaviour |
|---|---|---|
| **Strong Match** | `aiScore >= 0.80` | Shown in digest body (top 5 by score) |
| **Worth Reviewing** | `NOTIFY_THRESHOLD <= aiScore < 0.80` | Count shown in header; accessible via button |
| **Ignored** | `aiScore < NOTIFY_THRESHOLD` | Not notified |

Constants (in `src/features/notifications/domain/types.ts`):

```typescript
export const STRONG_MATCH_THRESHOLD = 0.8;
export const DIGEST_DISPLAY_LIMIT = 5;
```

---

## Inline Keyboard Layout

| Row | Button(s) | Condition |
|---|---|---|
| Apply rows | `Apply #1` `Apply #2` pairs | One per strong match, up to `DIGEST_DISPLAY_LIMIT` |
| Worth Reviewing | `✓ Worth Reviewing (N)` | Only when `N > 0` **and** `APP_URL` + `TELEGRAM_CALLBACK_SECRET` are set |
| Dashboard | `📊 Dashboard` | Only when `APP_URL` is set |

Apply buttons are URL-type inline buttons that open the job posting directly.

---

## Worth Reviewing Callback

The Worth Reviewing button is a **URL-type** inline keyboard button (not a callback query).
When tapped, Telegram opens the URL in an in-app browser. The route sends the pre-formatted
message to Telegram and returns a small HTML confirmation page.

### Architecture

```
notify.ts (cron)
  │
  ├─ formats worth-reviewing HTML text
  ├─ base64url-encodes it
  └─ embeds in URL: {APP_URL}/api/telegram/worth-reviewing?msg={encoded}&token={secret}
                                              ↑
                              URL button in inline keyboard

User taps button → Telegram opens URL
  │
  └─ GET /api/telegram/worth-reviewing?msg=…&token=…
       │
       ├─ validates token === TELEGRAM_CALLBACK_SECRET
       ├─ decodes msg via Buffer.from(msg, "base64url")
       ├─ POSTs decoded text to Telegram Bot API
       └─ returns HTML success page
```

### Why stateless

The callback route needs no Supabase access. The complete message content is encoded into the
URL at cron time and validated via a shared secret. This avoids:
- Needing a Supabase session in the callback route
- Registering a Telegram webhook
- Any state storage for pending callbacks

---

## Configuration

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | GitHub Actions + Vercel | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | GitHub Actions + Vercel | Chat/channel ID |
| `NOTIFY_THRESHOLD` | GitHub Actions | Min AI score to notify (default `0.75`) |
| `NOTIFY_MODE` | GitHub Actions | Set to `digest` to enable this feature |
| `APP_URL` | GitHub Actions | App base URL, e.g. `https://app.example.com`; enables Worth Reviewing and Dashboard buttons |
| `TELEGRAM_CALLBACK_SECRET` | GitHub Actions + Vercel | Shared secret for signing callback URLs; required for Worth Reviewing button |

`APP_URL` and `TELEGRAM_CALLBACK_SECRET` are optional. When absent, the Worth Reviewing and
Dashboard buttons are omitted from the keyboard; the digest still sends without them.

### Activating Digest Mode

```bash
NOTIFY_MODE=digest
```

No database migration is required. The same `notifications_log` table and deduplication
guarantee apply as for other modes.

---

## Notification Guarantee

The at-most-once guarantee is preserved:

1. `findUnnotifiedMatches()` returns only jobs without a `notifications_log` row.
2. `sendMessageWithButtons()` is called **once** with all matched jobs.
3. Only after a successful send does the use case call `markNotified()` for each job.
4. If the Telegram send throws, no jobs are marked — the full digest retries next run.

---

## File Map

| File | Role |
|---|---|
| `src/features/notifications/domain/types.ts` | `STRONG_MATCH_THRESHOLD`, `DIGEST_DISPLAY_LIMIT` constants |
| `src/features/notifications/domain/TelegramSender.ts` | Extended interface: `sendMessageWithButtons` |
| `src/features/notifications/application/bandMatches.ts` | Splits matches into strong / worth-reviewing bands |
| `src/features/notifications/application/formatDigestMvp.ts` | `formatDigestMvp` + `formatWorthReviewingMessage` |
| `src/features/notifications/application/buildDigestKeyboard.ts` | Builds `InlineKeyboardButton[][]` grid |
| `src/features/notifications/application/sendDigestMvp.ts` | Main use case: query → band → format → send → mark |
| `src/features/notifications/infrastructure/TelegramBotSender.ts` | Implements `sendMessageWithButtons` via private `post()` |
| `src/app/api/telegram/worth-reviewing/route.ts` | Stateless callback route |
| `scripts/notify.ts` | Wires deps; constructs signed worth-reviewing URL |

---

## Backward Compatibility

| Mode | Value | Behaviour |
|---|---|---|
| MVP digest | `NOTIFY_MODE=digest` | This feature |
| Individual | `NOTIFY_MODE=individual` (default) | Unchanged per-job messages |
| Legacy digest | `NOTIFY_MODE=digest_legacy` | Old grouped-text digest format |

Switching modes has no effect on which jobs were previously notified.
