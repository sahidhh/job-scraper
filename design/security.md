# Security Design

## 1. Authentication

The platform uses **Supabase Auth** (email + password) for the single user account.

| Aspect | Implementation |
|---|---|
| Session storage | httpOnly cookies (managed by `@supabase/ssr`) |
| Session refresh | `middleware.ts` refreshes session on every request |
| Route protection | Middleware redirects unauthenticated requests to `/login` |
| Token exposure | Anon key is public (safe — RLS enforces access); service role key is never in client-reachable Next.js code (one server-only route handler exception, §3/AD-29) |
| No JWT manipulation | Supabase handles all token lifecycle; no custom JWT logic |

---

## 2. Row-Level Security (RLS)

All Supabase tables have RLS enabled. Policies allow full access to the `authenticated` role only.

```sql
-- Example: jobs table
CREATE POLICY "authenticated_full_access_jobs"
ON public.jobs FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

| Table | Policy | Role |
|---|---|---|
| jobs | authenticated full access | authenticated |
| companies | authenticated full access | authenticated |
| job_scores | authenticated full access | authenticated |
| resumes | authenticated full access | authenticated |
| role_selections | authenticated full access | authenticated |
| role_expansion_map | authenticated full access | authenticated |
| job_statuses | authenticated full access | authenticated |
| job_state | authenticated full access | authenticated |
| notifications_log | authenticated full access | authenticated |
| scrape_runs | authenticated full access | authenticated |
| app_settings | authenticated full access | authenticated |
| job_duplicates | authenticated read-only (writes are service-role only, via scripts/scrape.ts) | authenticated |
| company_career_pages | authenticated read-only (writes are service-role only, via scripts/discover-career-pages.ts) | authenticated |
| digest_sessions | authenticated full access | authenticated |
| resume_suggestions | authenticated full access | authenticated |
| applications | authenticated full access | authenticated |

Anonymous or unauthenticated requests receive zero rows / permission denied.

**Automated verification (v1.4):** `src/features/verification/infrastructure/checks/infrastructure/rlsCheck.ts`
confirms this at run time — `createSupabaseAnonClient()` (`src/shared/infrastructure/supabaseClient.ts`, a
session-less anon-key client, distinct from the app's always-authenticated `server.ts` client) attempts an
unauthenticated read of `jobs`; a PostgREST error or zero rows is the healthy outcome, any row returned is a
critical-severity failure. Run via `npm run verify:production` / `npm run diagnostics`
(docs/operations/production-verification.md).

---

## 3. Service Role Boundary

The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It is permitted only in `scripts/`, in the service-client factory itself, and in one formally-approved exception — never anywhere else in `src/app/` or `src/features/`. See AD-29 (`docs/decisions.md`) for the exception's rationale.

### Enforcement

**CI gate:** `npm run check:service-role-boundary`
(`scripts/checkServiceRoleBoundary.ts`) — statically scans `src/` and `scripts/` for any import of the service client or reference to `SERVICE_ROLE_KEY`, exempting `scripts/**` and the paths in its `ALLOWED_FILES` set. Fails the CI build if found outside those.

**Convention:** The service client factory is `src/shared/infrastructure/supabaseClient.ts` (`createSupabaseServiceClient`). It is imported by `scripts/scrape.ts`, `scripts/score.ts`, and `scripts/notify.ts`, and by one allowlisted exception: `src/app/api/telegram/webhook/route.ts` (AD-29) — a server-only Next.js route handler, never reachable from the browser bundle, gated on the `X-Telegram-Bot-Api-Secret-Token` header rather than Supabase Auth, which needs cross-RLS read access to serve "Worth Reviewing" pagination to an authenticated Telegram callback.

**Deployment:** `SUPABASE_SERVICE_ROLE_KEY` is set only as a GitHub Actions secret — not as a Vercel env var. This prevents it from appearing in any server-side Next.js bundle.

---

## 4. Storage Security

| Bucket | Visibility | Access Policy |
|---|---|---|
| `resumes` | Private | `authenticated_full_access_resumes` — authenticated role only |

Resume files are stored with their sha256 content hash as the path (`<hash>.pdf` / `<hash>.docx`), not a random UUID — this doubles as the storage-level half of the parse-once cache (decisions.md AD-30): re-uploading identical bytes overwrites the same object rather than creating a new one. A sha256 digest is preimage-resistant, so this is not more guessable than a random UUID; access still requires a valid Supabase session regardless of path.

---

## 5. External API Key Management

| Secret | Where Stored | Used By |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secrets only | Cron scripts |
| `OPENROUTER_API_KEY` | GitHub Actions secrets + Vercel env | Scripts + server actions (role expansion) |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Vercel env only (no cron script uses them) | Server actions (resume suggestions, `src/shared/infrastructure/llmClient.ts`) — same pattern as `OPENROUTER_API_KEY`'s server-action usage: read server-side only, never exposed via `NEXT_PUBLIC_*` |
| `TELEGRAM_BOT_TOKEN` | GitHub Actions secrets only | Notify script |
| `TELEGRAM_CHAT_ID` | GitHub Actions secrets only | Notify script |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env (public) | Client-side Supabase calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env (public) | Client-side Supabase calls |

`NEXT_PUBLIC_*` variables are intentionally public — they are scoped to the anon role which requires authentication for any data access.

---

## 6. Input Validation

All user input entering the system boundary is validated with **Zod** schemas before use.

| Boundary | Validation |
|---|---|
| Server actions (form data) | Zod parse of incoming parameters |
| OpenRouter responses | JSON schema response format + Zod parse |
| ATS API responses | Zod schemas on normalized `RawJob` shape |
| Resume upload | MIME type check (PDF/DOCX only) + pdf-parse/mammoth error handling; empty/near-empty extracted text (e.g. scanned PDF) rejected by `validateParsedText` |

The TypeScript `any` type is explicitly banned (CLAUDE.md) — all data at boundaries must be typed.

---

## 7. Injection Risks

### SQL Injection
All database queries use the Supabase JS SDK (PostgREST) with parameterized queries. Raw SQL is only used in migrations and RPC function definitions — not in application code.

### XSS
- Next.js (React) escapes all JSX output by default
- Telegram messages use `parse_mode: "HTML"` with explicit field-by-field formatting — no user-controlled HTML is interpolated into the template without escaping

### Server-Side Request Forgery (SSRF)
All outbound HTTP requests are made to hardcoded URLs (OpenRouter, Telegram Bot API, ATS board APIs, Wellfound feed). The Wellfound feed URL is user-configurable via env var — this is a known SSRF surface. It is mitigated because it is an administrator-only env var, not a user-submitted URL.

---

## 8. Sensitive Data Handling

| Data | Sensitivity | Handling |
|---|---|---|
| Resume file (PDF/DOCX) | Personal | Stored in private Supabase Storage bucket; authenticated access only |
| Resume text / skills | Personal | Stored in Postgres under RLS; never logged to console |
| AI scoring reasoning | Low | Stored in `job_scores.ai_reasoning`; visible to authenticated user only |
| Telegram chat ID | Low | GitHub Actions secret; not stored in database |
| Job descriptions | Public | Sourced from public ATS APIs |

---

## 9. Single-User Security Model

This is a personal tool with a single user account. The security model is simpler than multi-tenant apps:

- No per-row user isolation needed (no `user_id` columns)
- No RBAC or permission tiers
- No public signup — user account created manually in Supabase Auth dashboard
- No API keys issued to third parties
- One inbound webhook: `src/app/api/telegram/webhook/route.ts` receives Telegram
  `callback_query` updates (inline-keyboard pagination on the "Worth Reviewing"
  digest message). Gated on `X-Telegram-Bot-Api-Secret-Token` matching
  `TELEGRAM_CALLBACK_SECRET`, not on Supabase auth -- `middleware.ts` excludes
  `/api` from its auth-redirect matcher for this reason, and the route uses the
  service-role client internally

---

## 10. Security Checklist for Changes

When modifying the codebase, verify:

- [ ] New server actions validate all inputs with Zod
- [ ] No `any` types introduced at trust boundaries
- [ ] No import of service client in `src/app/` or `src/features/`
- [ ] New tables have RLS enabled with authenticated-only policies
- [ ] New secrets stored in GitHub Actions secrets (not Vercel) where not needed by web app
- [ ] New outbound HTTP calls use `fetchWithRetry` (consistent timeout/retry)
- [ ] User-supplied URLs (if any new ones) are validated against an allowlist
