---
id: T006
title: Typed auth/block errors, local cookie store, NaukriScraper & NaukriGulfScraper, and registry
status: pending
gate_level: 3
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T002]
requirements: [REQ-F005, REQ-F006, REQ-N001, REQ-I001]
---
# Objective
Implement `SourceAuthExpiredError` and `SourceBlockedError`, a local cookie store reader (env-configurable path, gitignored), `NaukriScraper` and `NaukriGulfScraper` conforming to `JobSourceScraper` (`requiresCompanyConfig: false`), and register both in `src/features/sources/infrastructure/registry.ts`.

# Context
- `MyCareersFutureScraper.ts` and `AdzunaScraper.ts` provide existing `JobSourceScraper` (`requiresCompanyConfig: false`) patterns.
- `classifyScrapeFailure.ts` maps error messages/status codes to `FailureCategory` (`authentication`, `blocked`, `empty_feed`, etc.).
- Naukri (India + Remote) and NaukriGulf (UAE/Gulf) require session cookies from a local box store, 3–8s random jitter between requests, a strict daily page cap, and immediate abort (no retry) on `401`, `403`, login redirect, or unexpected 0-job payload.

# Inputs
- `src/features/sources/domain/JobSourceScraper.ts`
- `src/features/sources/domain/classifyScrapeFailure.ts`
- `src/features/sources/infrastructure/registry.ts`
- `src/features/sources/infrastructure/mycareersfuture/MyCareersFutureScraper.ts`
- `.gitignore` and `.env.example`

# Scope
Included: `SourceAuthExpiredError` / `SourceBlockedError`, `classifyScrapeFailure.ts` updates, cookie store reader, `NaukriScraper.ts`, `NaukriGulfScraper.ts`, `registry.ts`, `.gitignore` / `.env.example`, and fixture-based Vitest unit tests.
Excluded: Modifying `scripts/scrape.ts` (T007) or cookie refresh CLI scripts (T008).

# Implementation guidance
1. **Search endpoint:** Naukri uses `GET https://www.naukri.com/jobapi/v3/search` with headers `appid: "109"`, `systemid: "109"`, `clientid: "d3skt0p"`, `accept: "application/json"`, `User-Agent`, plus session cookies / `nkparam` (initialized from HTML search page). Verify NaukriGulf search endpoint & response shape from a live session/fixture before writing its parser.
2. Create `SourceAuthExpiredError` and `SourceBlockedError` (carrying `source`, `statusCode`, `reason`) in `src/features/sources/domain/errors.ts` and recognize them directly in `classifyScrapeFailure.ts`.
3. Create a shared cookie store helper (`src/features/sources/infrastructure/cookieStore.ts`) reading from `NAUKRI_COOKIE_FILE` / `NAUKRIGULF_COOKIE_FILE` (or `COOKIES_DIR`, defaulting to a gitignored `.cookies/` path), supporting `Cookie` header string or JSON cookie array (`name`/`value` pairs). Throw `SourceAuthExpiredError` if missing/empty.
4. Implement `NaukriScraper` (`source: "naukri"`, `requiresCompanyConfig: false`) and `NaukriGulfScraper` (`source: "naukrigulf"`, `requiresCompanyConfig: false`):
   - Query 1–3 year experience (`experience=2` / equivalent) for `.NET`, `C#`, `Full Stack`, `Software Engineer` (India + Remote for Naukri; UAE/Gulf for NaukriGulf).
   - Enforce a strict daily page cap (configurable via env, e.g., `NAUKRI_MAX_PAGES=3`) and 3–8s random jitter between requests (injectable delay/jitter for fast unit tests).
   - Do NOT retry on `401`, `403`, login redirect (`3xx` to login or HTML login form), or unexpected 0-job response — immediately throw `SourceAuthExpiredError` or `SourceBlockedError`.
   - Normalize `minYears`, `postedAt`, `locationRaw`, `url`, `description`, `companyName`, `title` and filter via `jobMatchesRoles`.
5. Register `naukriScraper` and `naukriGulfScraper` in `src/features/sources/infrastructure/registry.ts`.
6. Add `.cookies/` and `*cookies*.json` (excluding fixtures if named `*.fixture.json`) to `.gitignore`, and document env vars in `.env.example`.

# Expected outputs
- `src/features/sources/domain/errors.ts` & updated `classifyScrapeFailure.ts`
- `src/features/sources/infrastructure/cookieStore.ts`
- `src/features/sources/infrastructure/naukri/NaukriScraper.ts` & `NaukriScraper.test.ts`
- `src/features/sources/infrastructure/naukrigulf/NaukriGulfScraper.ts` & `NaukriGulfScraper.test.ts`
- Updated `src/features/sources/infrastructure/registry.ts`, `.gitignore`, `.env.example`

# Acceptance criteria
Blocking:
- [ ] AC-006-1: `NaukriScraper` and `NaukriGulfScraper` parse fixtures into valid `RawJob[]` with accurate `title`, `companyName`, `locationRaw`, `url`, and `postedAt`.
- [ ] AC-006-2: Both scrapers enforce the configured page cap and 3–8s jitter between requests (verified with mocked timer/delay in tests).
- [ ] AC-006-3: `401`, `403`, login redirect, missing cookies, and unexpected 0-job responses throw `SourceAuthExpiredError` or `SourceBlockedError` without retrying.
- [ ] AC-006-4: Cookie store path is env-configurable and gitignored.
Quality:
- [ ] `registry.test.ts` passes with `naukri` and `naukrigulf` registered.
Compatibility:
- [ ] Existing scrapers and `npm run typecheck` pass.

# Verification
- `npx vitest run src/features/sources`
- `npm run typecheck`

# Constraints
- Never hardcode or commit real cookies or session tokens.

# Handoff
Return: status, summary, changed files, test results, and any endpoint/header assumptions verified.

# Failure handling
- If live Naukri/NaukriGulf endpoints are not yet confirmed, stop and mark `BLOCKED` requesting captured API/HTML fixtures from the user.
- On judge FAIL (G3): one bounded `sr` or `pro` fix cycle.
