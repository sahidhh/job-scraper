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
