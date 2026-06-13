# Security Review Audit

Scope: secret handling, Supabase service-role usage, RLS, auth validation, file-upload handling, and (per the 10-category brief) AI-call usage / two-stage scoring gating.

---

## Findings

### 1. Resume upload uses raw, attacker/user-influenced filename as Storage path

- **Severity:** Medium
- **File:** `src/features/resume/actions.ts:36` (`uploadResumeAction`)
- **Location:** `const filePath = \`${Date.now()}-${file.name}\``, passed to `client.storage.from(RESUME_BUCKET).upload(filePath, buffer, {contentType: "application/pdf", upsert: true})`
- **Description:** `file.name` comes directly from the uploaded `File` object's filename (client-controlled, browser-supplied) and is concatenated into the Storage object path with no sanitization — no stripping of path separators (`/`, `..`), no character allowlist, no length cap. While the action validates the file's MIME type/extension as PDF before this point, it does not validate or sanitize the *name* string itself.
- **Why it matters:** Supabase Storage paths are effectively object keys, and most Storage backends normalize `/` as a path separator. A filename like `../../other-bucket-path/evil.pdf` or one containing unusual Unicode/control characters could produce an unexpected storage key (e.g., escaping the intended prefix structure), produce duplicate/colliding keys via `upsert: true` (overwriting another object if the resulting path happens to collide), or simply break listing/cleanup tooling that assumes `<timestamp>-<simple-name>.pdf`. This is a single-user app behind auth, so the blast radius is limited to the authenticated user's own bucket — but it's still an avoidable input-validation gap on a path construction.
- **Recommended fix:** Generate the storage path from server-controlled values only — e.g. `const filePath = \`${Date.now()}-${randomUUID()}.pdf\`` (the original filename, if needed for display, can be stored separately as metadata/column value) — removing `file.name` from the path entirely. This also sidesteps any need for sanitization logic.

---

### 2. Telegram notification messages are not Markdown-escaped before `parse_mode: "Markdown"`

- **Severity:** High
- **File:** `src/features/notifications/application/formatMatchMessage.ts:14-26` and `src/features/notifications/infrastructure/TelegramBotSender.ts:23`
- **Location:** `formatMatchMessage` interpolates `match.title`, `match.companyName`, and `match.aiReasoning` directly into the message string; `TelegramBotSender.sendMessage` sends with `parse_mode: "Markdown"`.
- **Description:** `match.title` and `match.companyName` come from scraped job postings (external, untrusted sources), and `match.aiReasoning` is LLM-generated free text. None of these are escaped for Telegram's Markdown special characters (`_`, `*`, `` ` ``, `[`). A job title or company name containing an unmatched `_` or `*` (very common in real job titles, e.g. `"Senior_Engineer"` or `"C++ * Backend"`) will produce invalid Markdown.
- **Why it matters:** This is rated High primarily because of its **downstream effect** documented in maintainability-audit Finding #1: when Telegram's API rejects a malformed-Markdown message, `TelegramBotSender.sendMessage` throws, and the calling loop in `sendNotification.ts` has no try/catch — so the entire notification batch aborts and the matching job is never marked as notified, causing it to block all subsequent matches on every future run. From a pure security-classification standpoint this is a data-handling/input-validation bug (untrusted external+AI content fed unescaped into a markup-interpreting API) rather than a credential/auth issue, but its operational impact (permanent notification-pipeline stall) is severe.
- **Recommended fix:** Escape Telegram MarkdownV2/Markdown special characters (`_*[]()~\`>#+-=|{}.!`) in `match.title`, `match.companyName`, and `match.aiReasoning` within `formatMatchMessage`, or switch `parse_mode` to `"HTML"` and HTML-escape (`&`, `<`, `>`) the same fields, or drop `parse_mode` entirely if formatting isn't essential. Combine with the try/catch fix in maintainability-audit Finding #1 for defense in depth.

---

### 3. `createSupabaseServiceClient` (service-role key) is unused dead code — currently a non-issue, but a future-risk flag

- **Severity:** Low
- **File:** `src/shared/infrastructure/supabaseClient.ts`
- **Location:** `createSupabaseServiceClient()` — confirmed via grep to have zero callers anywhere in `src/`.
- **Description:** The service-role client factory (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS per AD-12) exists and is correctly isolated to `shared/infrastructure` (not imported by any `domain`/`application`/UI code, per dependency-audit). It is currently unused because the cron scripts that would use it (architecture-audit Finding #1) don't exist yet.
- **Why it matters:** Not a vulnerability today — the code is inert. Flagging because once `scripts/scrape.ts`/`score.ts`/`notify.ts` are implemented (architecture-audit Finding #1) and start calling this factory, `SUPABASE_SERVICE_ROLE_KEY` becomes a live secret that must be present in the GitHub Actions secrets store and never exposed to the Next.js client bundle. Worth a deliberate check at that time that this env var is never referenced from any file under `src/app` or any `"use client"` component.
- **Recommended fix:** No action required now. When implementing the cron scripts, add a CI/lint check (or a simple grep in a pre-commit hook) ensuring `SUPABASE_SERVICE_ROLE_KEY` only appears in `scripts/` and `shared/infrastructure/supabaseClient.ts`, never in `src/app` or client components.

---

## Summary of Compliant Areas (no action needed)

- **Secret handling**: all secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, etc.) are accessed exclusively via `requireEnv`/`optionalEnv` (`src/shared/infrastructure/env.ts`) from `infrastructure/` files; no secret is hardcoded or committed. `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the only `NEXT_PUBLIC_*` vars, correctly client-exposable) are used by `shared/infrastructure/supabase/server.ts` per AD-12.
- **Supabase service-role usage**: `createSupabaseServiceClient()` is correctly scoped to `shared/infrastructure` and not imported anywhere reachable from the browser bundle (see Finding #3 for the forward-looking caveat).
- **RLS**: enabled on all 8 tables with `authenticated_full_access` policy, matching AD-12 — verified in database-audit.
- **Auth validation**: `src/middleware.ts` + `shared/infrastructure/supabase/middleware.ts` (`updateSession`, `PUBLIC_PATHS = ["/login", "/auth"]`) gate all non-public routes; `(protected)/layout.tsx` performs a second `supabase.auth.getUser()` check as defense-in-depth before rendering `AppShell`. `loginAction` validates credentials via zod before calling `supabase.auth.signInWithPassword`. PKCE callback (`src/app/auth/callback/route.ts`) correctly uses `exchangeCodeForSession(code)`.
- **No `any`-typed escape hatches** anywhere that could bypass type-level validation on user input (confirmed via codebase-wide grep, see maintainability-audit summary).
- **AI-call surface area is minimized and gated**: `scoreJob.ts` only calls `OpenRouterAiScoreProvider.score()` when `keywordScore >= KEYWORD_THRESHOLD` (default 0.5), and `OpenRouterRoleExpansionProvider` is only invoked as a cache-miss fallback in `expandRole.ts` (seed map checked first) — both confirmed matching AD-06/AD-07. No code path sends resume/job content to OpenRouter unconditionally.
- **OpenRouter client** (`src/shared/infrastructure/openrouterClient.ts`): enforces a 15s timeout (`REQUEST_TIMEOUT_MS`), requires both `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` via `requireEnv` (fails fast if misconfigured rather than silently sending to a default model), and uses strict `json_schema` response formatting — reduces risk of malformed/unbounded AI responses.
- **File upload validation**: `uploadResumeAction` checks file presence, MIME type, and extension before processing, and caps processing to PDF via `pdf-parse` — no arbitrary file type is persisted or parsed.
