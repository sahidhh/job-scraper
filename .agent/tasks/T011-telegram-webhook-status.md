---
id: T011
title: Telegram webhook st:<action>:<jobId> callback handler and in-place card edit
status: pending
gate_level: 3
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T010]
requirements: [REQ-F015, REQ-S001]
---
# Objective
Extend `src/app/api/telegram/webhook/route.ts` and `helpers.ts` to handle `st:applied:<jobId>`, `st:skipped:<jobId>`, and `st:closed:<jobId>` callback queries: update Supabase (`job_state` for applied/skipped; `jobs.is_active = false` for closed) and edit the Telegram card message in place to append the confirmed state and remove action buttons.

# Context
- `src/app/api/telegram/webhook/route.ts` currently validates `X-Telegram-Bot-Api-Secret-Token` (`401` on mismatch) and handles `wr:<page>` pagination callbacks.
- `supabase/seed.sql` seeds `job_statuses` labels: `New`, `Viewed`, `Interested`, `Applied`, `Not Interested`, `Archived` (no `Skipped` label).
- Spec Further Notes: check existing `job_statuses` names in Supabase before wiring `st:applied` and `st:skipped`.

# Inputs
- `src/app/api/telegram/webhook/route.ts`
- `src/app/api/telegram/webhook/helpers.ts` & `helpers.test.ts`
- `src/features/jobs/infrastructure/SupabaseJobRepository.ts`
- `supabase/seed.sql`

# Scope
Included: `st:<action>:<jobId>` callback parsing, Supabase `job_state` / `jobs.is_active` updates, in-place Telegram `editMessageText` / `editMessageReplyMarkup`, and Vitest unit tests (including `401` secret check and all 3 actions).
Excluded: Migrating away from Vercel webhook or changing `wr:` pagination behavior.

# Implementation guidance
1. **Status mapping (confirmed):** Map `st:applied` → `Applied` and `st:skipped` → `Not Interested` (existing seeded label in `supabase/seed.sql`).
2. Parse `cq.data` matching `/^st:(applied|skipped|closed):([0-9a-f-]{36})$/i` (reject malformed payloads cleanly with `answerCallbackQuery` and `200 OK`).
3. Answer callback query immediately (`answerCallbackQuery(cq.id, "Updating...")`) so Telegram's spinner resolves fast.
4. For `applied` / `skipped`: look up the target `job_statuses` row by label (`Applied`, and confirmed skipped label), upsert `job_state` (`{ job_id: jobId, status_id, updated_at }`, `onConflict: "job_id"`).
5. For `closed`: update `jobs` setting `is_active = false, inactive_reason = "closed"` (and optionally update `job_state` if configured).
6. Edit the original message (`cq.message.message_id`, using existing `cq.message.text` if present in `TelegramCallbackQuery` or `editMessageReplyMarkup` + status suffix) to remove the action buttons (keeping only `[🔗 Apply]` or empty `inline_keyboard: []`) and append `\n\n✅ Marked as <b>Applied</b>` / `⏭️ Skipped` / `🚫 Closed`.

# Expected outputs
- Updated `src/app/api/telegram/webhook/route.ts`
- Updated `src/app/api/telegram/webhook/helpers.ts`
- Unit/route tests in `src/app/api/telegram/webhook/`

# Acceptance criteria
Blocking:
- [ ] AC-011-1: `st:applied:<jobId>` and `st:skipped:<jobId>` upsert `job_state` with the verified `job_statuses.id`; `st:closed:<jobId>` sets `jobs.is_active = false`.
- [ ] AC-011-2: Webhook edits the Telegram card in place to show the confirmed status and remove action buttons, preventing duplicate clicks.
- [ ] AC-011-3: Missing/invalid `X-Telegram-Bot-Api-Secret-Token` still returns `401`; malformed `st:` payloads do not crash or return `500`.
Quality:
- [ ] `wr:<page>` pagination continues to work identically.
Compatibility:
- [ ] `npm run typecheck` and webhook tests pass.

# Verification
- `npx vitest run src/app/api/telegram/webhook`
- `npm run typecheck`

# Constraints
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `TELEGRAM_BOT_TOKEN` in responses or logs.

# Handoff
Return: status, summary, changed files, test results, and exact `job_statuses` label mapping used.

# Failure handling
- If `job_statuses` target label is not confirmed or missing in DB, mark `BLOCKED` and ask user before guessing.
- On judge FAIL (G3): one bounded `sr` or `pro` fix cycle.
