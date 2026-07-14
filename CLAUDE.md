# Claude Development Rules

Always read docs/ before making changes.

Never create new architecture without approval.

Never introduce:

* Prisma
* Drizzle
* Zustand
* Redux
* React Query

Use:

* Supabase
* Repository Pattern
* Server Actions

Never use:

* any
* duplicated DTOs
* duplicated types

Prefer:

* composition
* feature modules
* pure functions

All new features require:

1. domain
2. application
3. infrastructure
4. tests

before UI.

Always update docs when architecture changes.

## Design rules carried over from jobhunt-app

jobhunt-app (the predecessor this app merged and sunset, merge-workspace
Phase 6) had five non-negotiable design rules. All five hold here too —
treat any change that would violate one as a design decision, not a bug fix,
and record it in `docs/decisions.md` per this file's other rules.

* **No scraping of LinkedIn/Indeed/Naukri or any other job-board account.**
  No login, no anti-bot bypass, ever. Use licensed aggregator APIs (JSearch,
  Adzuna) or static, public-HTML pages only (the careers-URL fetcher). See
  `design/scope.md`'s "Job board accounts (LinkedIn, Indeed)" out-of-scope
  row and `design/security.md` §"outbound HTTP requests" for why this isn't
  just a ToS concern but an SSRF-surface one too.
* **No auto-apply / no bulk send.** AI may draft an email or cover letter;
  the user always reviews and sends it themselves (mailto only). Never add
  a "send all" or server-side email-send path. See `docs/decisions.md`
  AD-33/AD-34.
* **Drafts must be truthful.** Resume-suggestion and application-draft
  prompts forbid inventing experience, skills, or metrics — preserve that
  instruction in any prompt edits (`LlmResumeSuggestionProvider.ts`,
  `LlmApplicationDraftProvider.ts`).
* **Parse once.** A resume's extracted text is cached by sha256 content
  hash and never re-parsed on identical re-upload. See `docs/decisions.md`
  AD-30 and `ResumeRepository.findByContentHash`.
* **Provider-agnostic AI.** Never call a provider SDK/API directly outside
  the two designated clients — `openrouterClient.ts` (job scoring) and
  `llmClient.ts` (resume coaching, application drafts, careers-page
  extraction; `LLM_PROVIDER` switches gemini/anthropic). See
  `docs/decisions.md` AD-32.

## Document Maintenance Rules

Every code change that touches any of the items below **must** update the corresponding document(s) in `design/` before the PR is merged. No exceptions.

| Change type | Document(s) to update |
|---|---|
| New feature or feature removal | `design/use-cases.md`, `design/scope.md` |
| Data model change (new table, column, index, enum, RPC) | `design/erd.md` |
| Architecture change (new layer, new pattern, new module) | `design/architecture.md`, `design/technical-design.md` |
| New or removed dependency, env var, or npm script | `design/tech-stack.md` |
| New server action or API route | `design/api-reference.md` |
| Auth, RLS, storage, or service-role boundary change | `design/security.md` |
| New limitation or known issue | `design/limitations.md` |
| Workflow or UX change visible to the user | `design/user-guide.md` |
| Change to project scope or phase roadmap | `design/scope.md` |

Additionally:
- Always read `design/` (in addition to `docs/`) before making changes.
- If a change affects multiple documents, update all of them in the same commit.
- If you are unsure which documents apply, err on the side of updating more rather than fewer.
