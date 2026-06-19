# Telegram Digest MVP — Design

**Branch:** `feature/telegram-digest-mvp`  
**Date:** 2026-06-19  
**Status:** Pre-implementation design

---

## 1. Problem Statement

The digest mode (`NOTIFY_MODE=digest`) is functional but has three gaps that reduce its usefulness:

1. **Job URLs are plain text.** They appear as non-clickable strings in Telegram.
2. **No dashboard deep-link.** The user cannot navigate from a notification to the full filtered job list.
3. **No link preview suppression.** Telegram auto-expands the first URL into a large preview card, pushing readable content far down the screen.

The MVP closes all three gaps with minimal, low-risk changes confined to the existing notification feature.

---

## 2. Current Architecture

### 2.1 Notification Pipeline

```
scripts/notify.ts  (cron entry point)
  │
  ├─ requireEnv: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
  ├─ optionalEnv: NOTIFY_THRESHOLD (default 0.75), NOTIFY_MODE (default "individual")
  ├─ [no APP_URL — does not exist today]
  │
  ├─ SupabaseRoleRepository.getActiveSelection()   → exits if none
  ├─ SupabaseNotificationPreferencesRepository.getPreferences()
  │
  └─ NOTIFY_MODE=digest ──▶ sendDigest(roleSelectionId, deps)
  └─ NOTIFY_MODE=individual ─▶ sendNotification(roleSelectionId, deps)
```

```
sendDigest(roleSelectionId, deps)
  ├─ validateNotifyThreshold(deps.notifyThreshold)
  ├─ notificationRepository.findUnnotifiedMatches(roleSelectionId, threshold)
  │     PostgREST equivalent:
  │       SELECT jobs.*, job_scores.ai_score, job_scores.ai_reasoning,
  │              notifications_log.id
  │       FROM jobs
  │       INNER JOIN job_scores ON role_selection_id = $id AND ai_score >= $threshold
  │       LEFT JOIN notifications_log ON job_id = jobs.id
  │     JS post-filter: rows where notifications_log array is empty
  │
  ├─ filterMatches(matches, preferences)  [if preferences set]
  ├─ formatDigestMessage(matches)         → single HTML string
  ├─ splitDigestChunks(text, 4096)        → string[]
  ├─ for each chunk: telegramSender.sendMessage(chunk)   [all-or-nothing; failure aborts]
  └─ for each match: notificationRepository.markNotified(jobId)
```

### 2.2 Domain Interface

```ts
// src/features/notifications/domain/TelegramSender.ts
interface TelegramSender {
  sendMessage(text: string): Promise<void>;
}
```

### 2.3 Infrastructure Adapter

```ts
// src/features/notifications/infrastructure/TelegramBotSender.ts
// POST https://api.telegram.org/bot{token}/sendMessage
body: {
  chat_id: TELEGRAM_CHAT_ID,
  text,
  parse_mode: "HTML",
  // disable_web_page_preview: missing
}
// 429 retry: waits body.parameters.retry_after (capped 30 s), one retry only
// No inter-message delay between successive sendMessage calls
```

### 2.4 Current Digest Message Format

```
📋 <b>Jobs Digest</b>

<b>High Match</b> (≥85%)

🎯 92% — Senior Backend Engineer @ Stripe
📍 Singapore · https://boards.greenhouse.io/stripe/jobs/456      ← plain text, not a link

<b>Medium Match</b>

🎯 78% — Full Stack Developer @ Shopify
📍 Remote · https://example.com/shopify/789                       ← plain text, not a link

<b>New Companies</b>
• Stripe
• Shopify

<b>Summary</b>
2 jobs processed
1 high-value job
                                                                   ← no dashboard link
```

### 2.5 Dashboard Deep-Link Capability (already exists)

`/dashboard` is a server component that parses `searchParams` server-side and feeds them to `SupabaseJobRepository.findForDashboard()`. All filters are in the URL — there is no client-side filter state.

| Param | Accepted values | Effect |
|---|---|---|
| `minScore` | `0`–`1` float (e.g. `"0.85"`) | Jobs with `ai_score ≥ value` |
| `location` | `india` · `singapore` · `uae` · `remote` | Filter by location tag |
| `source` | `greenhouse` · `lever` · `ashby` · `wellfound` · `remoteok` · `mycareersfuture` | Filter by ATS |
| `status` | status UUID | Filter by workflow status |
| `archived` | `"1"` | Include archived jobs |
| `maxYears` | integer ≥ 0 | Exclude jobs requiring > N years |
| `limit` | integer, max 500 | Page size |

**Best target URL for digest:** `/dashboard?minScore=0.85` — mirrors `HIGH_MATCH_THRESHOLD = 0.85` defined in `formatDigestMessage.ts`.

No per-job detail page exists. There is no `NEXT_PUBLIC_APP_URL` or equivalent env var today.

### 2.6 Key Gaps Summary

| Gap | Location | Impact |
|---|---|---|
| Job URLs are plain escaped text | `formatDigestMessage.ts` → `formatEntry()` | Not clickable in Telegram |
| No dashboard deep-link | `formatDigestMessage.ts` Summary section | Cannot navigate to filtered list |
| Missing `disable_web_page_preview` | `TelegramBotSender.ts` request body | Telegram expands first URL into a preview card |
| No base URL env var | `scripts/notify.ts` | Cannot construct dashboard link |
| AI reasoning absent from digest entries | `formatDigestMessage.ts` | Present in individual mode, absent in digest |

---

## 3. Proposed Architecture

Three targeted changes, all within the existing notification feature. No new modules, no new tables, no database migrations.

### 3.1 Change Overview

```
scripts/notify.ts (CHANGED)
  ├─ reads APP_URL (NEW optional env var — no default)
  └─ constructs dashboardUrl = APP_URL ? `${APP_URL}/dashboard?minScore=${threshold}` : undefined

sendDigest.ts (CHANGED)
  ├─ SendDigestDeps gains dashboardUrl?: string
  └─ passes { dashboardUrl } as second arg to formatDigestMessage()

formatDigestMessage.ts (CHANGED)
  ├─ signature: formatDigestMessage(matches, options?: { dashboardUrl?: string })
  ├─ formatEntry(): URL → <a href="...">View job →</a>   (was: plain escaped text)
  └─ Summary section: + dashboard link if options.dashboardUrl is set

TelegramBotSender.ts (CHANGED — infrastructure only)
  └─ request body += disable_web_page_preview: true
```

`TelegramSender` domain interface is **unchanged** — `disable_web_page_preview` is an infrastructure concern that improves all messages uniformly.

### 3.2 Proposed Digest Message Format

```
📋 <b>Jobs Digest</b>

<b>High Match</b> (≥85%)

🎯 92% — Senior Backend Engineer @ Stripe
📍 Singapore · <a href="https://boards.greenhouse.io/stripe/jobs/456">View job →</a>

<b>Medium Match</b>

🎯 78% — Full Stack Developer @ Shopify
📍 Remote · <a href="https://example.com/shopify/789">View job →</a>

<b>New Companies</b>
• Stripe
• Shopify

<b>Summary</b>
2 jobs processed · 1 high-value job
<a href="https://your-app.vercel.app/dashboard?minScore=0.75">View all on dashboard →</a>
```

### 3.3 Architecture Diagram (after MVP)

```
scripts/notify.ts
  ├─ reads APP_URL (optional) → dashboardUrl
  └─ sendDigest(roleSelectionId, { notificationRepository, telegramSender,
                                   notifyThreshold, preferences, dashboardUrl })

sendDigest.ts
  └─ formatDigestMessage(matches, { dashboardUrl })

formatDigestMessage.ts
  ├─ formatEntry(match): URL → <a href>
  └─ summary: + <a href=dashboardUrl> if set

TelegramBotSender.ts
  └─ POST /sendMessage { chat_id, text, parse_mode: "HTML",
                         disable_web_page_preview: true }
```

---

## 4. Required Code Changes

### 4.1 `src/features/notifications/application/formatDigestMessage.ts`

**Change 1 — Add options parameter to `formatDigestMessage`:**

```ts
// Before
export function formatDigestMessage(matches: JobMatch[]): string

// After
export function formatDigestMessage(
  matches: JobMatch[],
  options?: { dashboardUrl?: string }
): string
```

**Change 2 — Convert job URLs to HTML hyperlinks in `formatEntry`:**

```ts
// Before
`📍 ${location} · ${escapeHtml(match.url)}`

// After
`📍 ${location} · <a href="${escapeHtml(match.url)}">View job →</a>`
```

**Change 3 — Add dashboard link to Summary section:**

```ts
// Before
lines.push(
  "",
  "<b>Summary</b>",
  `${matches.length} job${...} processed`,
  `${high.length} high-value job${...}`,
);

// After
const summaryLine = `${matches.length} job${...} processed · ${high.length} high-value job${...}`;
lines.push("", "<b>Summary</b>", summaryLine);
if (options?.dashboardUrl) {
  lines.push(`<a href="${escapeHtml(options.dashboardUrl)}">View all on dashboard →</a>`);
}
```

### 4.2 `src/features/notifications/application/sendDigest.ts`

**Change — Add `dashboardUrl` to deps interface and forward to formatter:**

```ts
export interface SendDigestDeps {
  notificationRepository: NotificationRepository;
  telegramSender: TelegramSender;
  notifyThreshold: number;
  preferences?: NotificationPreferences | null;
  dashboardUrl?: string;  // NEW — optional; if absent, no link in digest
}

// Inside sendDigest():
const chunks = splitDigestChunks(
  formatDigestMessage(matches, { dashboardUrl: deps.dashboardUrl })
);
```

### 4.3 `src/features/notifications/infrastructure/TelegramBotSender.ts`

**Change — Suppress link preview in every message:**

```ts
body: JSON.stringify({
  chat_id: chatId,
  text,
  parse_mode: "HTML",
  disable_web_page_preview: true,   // NEW
}),
```

No interface change required. This is an infrastructure decision that benefits all message types.

### 4.4 `scripts/notify.ts`

**Change — Read `APP_URL` and construct `dashboardUrl`:**

```ts
const appUrl = optionalEnv("APP_URL", "").replace(/\/$/, ""); // strip trailing slash
const dashboardUrl = appUrl
  ? `${appUrl}/dashboard?minScore=${notifyThreshold}`
  : undefined;

const deps = {
  notificationRepository,
  telegramSender,
  notifyThreshold,
  preferences,
  dashboardUrl,  // NEW — undefined if APP_URL not set
};
```

### 4.5 Documentation updates (required by CLAUDE.md doc-maintenance rules)

| Document | Required update |
|---|---|
| `design/tech-stack.md` | Add `APP_URL` to Optional env vars table (cron scripts section) |
| `design/api-reference.md` | Update §3.2 Telegram Bot API: show new message format with `<a href>` links, document `disable_web_page_preview: true` in request body |
| `docs/features/notifications.md` | Update digest message format example; add `APP_URL` to Configuration table |

### 4.6 Test changes

| Test file | Changes required |
|---|---|
| `application/formatDigestMessage.test.ts` | Add cases: (a) job entry URL is `<a href="...">View job →</a>`, (b) Summary contains dashboard link when `dashboardUrl` set, (c) Summary has no link when `dashboardUrl` absent |
| `infrastructure/TelegramBotSender.test.ts` | Assert `disable_web_page_preview: true` present in HTTP request body |
| `application/sendDigest.test.ts` | Pass `dashboardUrl` in deps; assert it is forwarded to formatter |

---

## 5. Implementation Risk

### 5.1 Low-risk items

| Item | Rationale |
|---|---|
| `<a href>` hyperlinks | Standard Telegram HTML mode since Bot API 4.5; already using `parse_mode: "HTML"` throughout |
| `disable_web_page_preview` | Stable, documented Bot API parameter; no side effects on message delivery |
| Optional `APP_URL` | Defaults to undefined → no dashboard link → full backward compatibility if env var unset |
| No database migration | Zero schema changes |
| No `TelegramSender` interface change | Infra-only addition; existing tests and mocks are unaffected |
| No new feature modules | All changes inside existing `notifications` feature |
| Individual mode unchanged | `formatMatchMessage.ts` and `sendNotification.ts` are untouched |

### 5.2 Moderate risks

| Risk | Detail | Mitigation |
|---|---|---|
| Character count inflation | `<a href="https://boards.greenhouse.io/...">View job →</a>` is significantly longer than the plain URL. A digest with many jobs splits into more chunks than before. | Behavior is correct — Telegram accepts each chunk. No functional regression. The test suite should include a split-chunk scenario with long URLs. |
| `APP_URL` trailing slash | `APP_URL=https://app.com/` would produce `https://app.com//dashboard`. | Strip trailing slash in `notify.ts`: `appUrl.replace(/\/$/, "")`. |
| `splitDigestChunks` edge case (pre-existing) | A single line > 4096 chars is emitted as an oversized chunk that Telegram rejects. Not introduced by this feature, but clickable URL tags are longer than plain URLs, making this edge case slightly more likely. | Already a known gap. Can be tracked separately. Not a blocker for MVP. |
| Digest is all-or-nothing (pre-existing) | A Telegram API failure mid-chunk-send leaves all jobs unmarked; full digest retries next run. Unchanged by this feature. | Pre-existing behavior; not in MVP scope. |

### 5.3 Out of scope (deferred)

| Capability | Why deferred |
|---|---|
| Inline keyboard buttons (`reply_markup`) | Requires new `TelegramSender` interface method and different Bot API call shape. Higher complexity; HTML hyperlinks deliver equivalent navigation value with zero interface change. |
| Callback query handling | Requires inbound webhook or long-polling — an entirely new runtime. No webhook route exists. Major infrastructure addition outside MVP scope. |
| Message editing (`editMessageText`) | Requires tracking Telegram `message_id` returned from `sendMessage`. `TelegramBotSender` currently ignores response body. Deferred. |
| AI reasoning in digest entries | Orthogonal UX enhancement. Can be added to `formatEntry()` independently. |
| Clickable URLs in individual mode | `formatMatchMessage.ts` has the same plain-URL pattern. Same low-risk change, but deliberately excluded to keep MVP focused. |
| Multiple chat routing | Single `TELEGRAM_CHAT_ID` by design; single-user app. |

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | In `NOTIFY_MODE=digest`, each job entry's URL renders as a Telegram hyperlink (`<a href>` in HTML mode) |
| AC-2 | When `APP_URL` is set, the Summary section includes a "View all on dashboard" hyperlink targeting `{APP_URL}/dashboard?minScore={NOTIFY_THRESHOLD}` |
| AC-3 | When `APP_URL` is not set, no dashboard link appears and the script exits cleanly (no error) |
| AC-4 | Telegram does not expand any job URL into a link preview (verified by `disable_web_page_preview: true` in request body) |
| AC-5 | `NOTIFY_MODE=individual` behavior is byte-for-byte identical to before this change |
| AC-6 | All existing tests pass without modification to test logic (only new test cases added) |
| AC-7 | `formatDigestMessage.test.ts` covers: clickable URL format; dashboard link present when `dashboardUrl` supplied; dashboard link absent when `dashboardUrl` omitted |
| AC-8 | `TelegramBotSender.test.ts` asserts `disable_web_page_preview: true` in the HTTP request body |
| AC-9 | `sendDigest.test.ts` verifies `dashboardUrl` in deps is forwarded to the formatter |
| AC-10 | `design/tech-stack.md` documents `APP_URL` as an optional cron env var |
| AC-11 | `design/api-reference.md` §3.2 reflects the new Telegram request body and message format |
| AC-12 | A trailing slash in `APP_URL` does not produce a double-slash in the dashboard link |

---

## 7. Files Touched

| File | Change type |
|---|---|
| `src/features/notifications/application/formatDigestMessage.ts` | Logic change |
| `src/features/notifications/application/sendDigest.ts` | Interface + forwarding |
| `src/features/notifications/infrastructure/TelegramBotSender.ts` | Infrastructure option |
| `scripts/notify.ts` | Env var + URL construction |
| `application/formatDigestMessage.test.ts` | New test cases |
| `infrastructure/TelegramBotSender.test.ts` | New assertion |
| `application/sendDigest.test.ts` | New test case |
| `design/tech-stack.md` | Doc update |
| `design/api-reference.md` | Doc update |
| `docs/features/notifications.md` | Doc update |

**Not touched:** domain types, `NotificationRepository` interface, `TelegramSender` interface, database schema, scrape/score pipelines, dashboard code.
