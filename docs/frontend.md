# Frontend (Next.js App Router + shadcn/ui)

## 1. Route Structure

```
src/app/
├── layout.tsx                 # root layout (theme, fonts)
├── (auth)/
│   └── login/
│       └── page.tsx           # public — email/password login form
├── (protected)/
│   ├── layout.tsx             # session check + AppShell (nav)
│   ├── dashboard/
│   │   └── page.tsx           # default landing after login
│   ├── roles/
│   │   └── page.tsx
│   ├── resume/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
├── auth/
│   └── callback/
│       └── route.ts           # Supabase auth code-exchange (PKCE) callback
└── middleware.ts               # session refresh + route guard
```

- `(auth)` and `(protected)` are route groups — they don't affect URLs, only layouts.
- `/` redirects to `/dashboard` (which redirects to `/login` if unauthenticated, via middleware).
- No public signup page — single-user app. The one account is created once via the Supabase dashboard (Authentication → Users → Add user) as a setup step, not part of the app UI.

## 2. Components (shadcn/ui primitives as building blocks)

| Component | Used in | Built from shadcn primitives |
|---|---|---|
| `AppShell` | `(protected)/layout.tsx` | `NavigationMenu` / simple sidebar `Sheet` — links to Dashboard, Roles, Resume, Settings, Logout |
| `JobsTable` | `/dashboard` | `Table`, `Badge` (location tags, source), `Progress` or text for scores |
| `JobRow` (expandable) | inside `JobsTable` | `Collapsible` — reveals `ai_reasoning` text |
| `FilterBar` | `/dashboard` | `Select` (location tag, source), `Slider` or `Input` (min score) |
| `RoleSelectorForm` | `/roles` | `Input`, `Button` |
| `ExpandedRolesCard` | `/roles` | `Card`, `Badge` (chips for each related role), confirm `Button` |
| `ResumeUploadCard` | `/resume` | `Card`, `Input type=file`, `Button` |
| `SkillsEditor` | `/resume` | `Badge` (removable chips) + `Input` for adding new skills |
| `CompaniesTable` | `/settings` | `Table`, `Button` (edit/delete), `Dialog` |
| `CompanyFormDialog` | `/settings` | `Dialog`, `Input`, `Select` (source enum) |
| `ScrapeRunsList` | `/settings` | `Table` — recent `scrape_runs` (source, status, jobs_found, run_at, error) |
| `ThresholdsCard` | `/settings` | `Card` — read-only display of `KEYWORD_THRESHOLD`/`NOTIFY_THRESHOLD` from config |
| `LoginForm` | `/login` | `Card`, `Input`, `Button`, `Form` (with `zod` validation) |

All data-displaying components are server components receiving data as props from the page's server-side fetch (via repository → application use-case). Only interactive leaf components (`SkillsEditor`, `FilterBar`, forms) are client components (`"use client"`).

## 3. Server Actions

Mutations go through server actions in `features/<feature>/actions.ts` (e.g. `features/roles/actions.ts`), called from page/client components via `'use server'` functions. Each action instantiates the relevant Supabase repository (composition root) and calls the use-case — same use-cases the cron scripts use. This is presentation/composition-root code per `architecture.md` §5 rule 4, not `application/` (which rule 2 forbids from instantiating repositories directly).

| Action | Feature | Effect |
|---|---|---|
| `loginAction(formData)` | auth | `supabase.auth.signInWithPassword`, redirect to `/dashboard` on success, return field error on failure |
| `logoutAction()` | auth | `supabase.auth.signOut()`, redirect to `/login` |
| `expandRoleAction(primaryRole)` | roles | calls `roles.application.expandRole()`, returns `{ relatedRoles, source }` for preview (does not activate yet) |
| `confirmRoleSelectionAction(primaryRole, expandedRoles)` | roles | calls `roles.application.setActiveRoleSelection()` (RPC-backed atomic swap), revalidates `/dashboard` and `/roles` |
| `uploadResumeAction(formData)` | resume | calls `resume.application.uploadResume()` (storage + parse + extract), revalidates `/resume` |
| `updateResumeSkillsAction(resumeId, skills)` | resume | calls `resume.application.updateSkills()`, revalidates `/resume` |
| `createCompanyAction(input)` / `updateCompanyAction(id, input)` / `deleteCompanyAction(id)` | companies | CRUD via `CompanyRepository`, revalidates `/settings` |

Server actions return typed result objects (`{ ok: true, data }` or `{ ok: false, error }`) — no thrown exceptions cross the server/client boundary.

## 4. Authentication Flow

Supabase Auth (email/password), via `@supabase/ssr` for cookie-based sessions in server components, middleware, and server actions.

1. **`src/middleware.ts`**: runs on every request.
   - Refreshes the Supabase session cookie (required by `@supabase/ssr`).
   - If the request path is under `(protected)` routes and there's no valid session, redirect to `/login`.
   - If the request path is `/login` and a valid session exists, redirect to `/dashboard`.
2. **`(protected)/layout.tsx`**: server-side, re-checks `supabase.auth.getUser()` as defense-in-depth (middleware is the primary guard; this avoids any edge-case where a server component renders without middleware having run) and renders `AppShell` with the page content.
3. **`/login`**: `LoginForm` (client component) submits to `loginAction` (server action). On success, Supabase sets the session cookie and the action redirects to `/dashboard`. On failure (bad credentials), the action returns an error shown inline — no exception.
4. **`/auth/callback/route.ts`**: handles the PKCE code exchange if Supabase email confirmation or password-reset links are used (e.g. initial password setup for the one account). Standard Supabase SSR boilerplate — exchanges `code` query param for a session, then redirects to `/dashboard`.
5. **Logout**: `logoutAction` clears the session and redirects to `/login`.

Cron scripts (`scripts/*.ts`) never go through this flow — they use the Supabase **service role key**, which bypasses Auth/RLS entirely (server-to-server, never exposed to the browser).
