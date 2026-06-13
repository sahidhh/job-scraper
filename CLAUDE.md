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
