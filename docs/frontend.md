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
│   ├── insights/
│   │   └── page.tsx           # P1 — skill-gap + demand over role-matched jobs
│   ├── analytics/
│   │   ├── layout.tsx         # header + RouteTabs (Overview/Scraping & Scoring/Job Breakdown/Sources)
│   │   ├── page.tsx           # Overview tab: pipeline + scoring queue + token stats
│   │   ├── loading.tsx
│   │   ├── scraping/          # Scraping & Scoring tab
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   ├── breakdown/         # Job Breakdown tab
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   └── sources/           # Sources tab (source health)
│   │       ├── page.tsx
│   │       └── loading.tsx
│   └── settings/
│       ├── layout.tsx         # header + RouteTabs (Sources/Workflow/Notifications/Activity)
│       ├── page.tsx           # Sources tab: companies, experience, thresholds, ranking
│       ├── loading.tsx
│       ├── workflow/          # Workflow tab (job statuses)
│       │   ├── page.tsx
│       │   └── loading.tsx
│       ├── notifications/     # Notifications tab (notification filters)
│       │   ├── page.tsx
│       │   └── loading.tsx
│       └── activity/          # Activity tab (scrape runs + notification log)
│           ├── page.tsx
│           └── loading.tsx
├── auth/
│   └── callback/
│       └── route.ts           # Supabase auth code-exchange (PKCE) callback
└── middleware.ts               # session refresh + route guard
```

- `(auth)` and `(protected)` are route groups — they don't affect URLs, only layouts.
- `/` redirects to `/dashboard` (which redirects to `/login` if unauthenticated, via middleware).
- No public signup page — single-user app. The one account is created once via the Supabase dashboard (Authentication → Users → Add user) as a setup step, not part of the app UI.
- `/analytics` and `/settings` use route-based tabs (sub-routes, not client-side toggles): each tab is its own server component fetching only its own data, with a co-located `loading.tsx` skeleton shown while that tab's fetch resolves. `/dashboard` and `/insights` were evaluated for the same treatment but kept as single routes — dashboard has only one data-bearing section (already lazy via an internal `<Suspense>` around `JobsSection`), and insights' two cards both derive from one shared query so splitting them into routes would only duplicate that fetch, not reduce it (insights instead got a `<Suspense>` wrapper so it streams rather than blocks). Every protected route now has a `loading.tsx` regardless — `/dashboard`, `/roles`, `/resume` and `/insights` gained theirs in the UI/UX audit pass, so sidebar navigation always shows a shaped skeleton instead of a frozen page. Those four have no nested `layout.tsx`, so their page heading is inside the Suspense boundary and their skeleton has to draw it too (`design/architecture.md` §12.4).

## 2. Components (shadcn/ui primitives as building blocks)

| Component | Used in | Built from shadcn primitives |
|---|---|---|
| `AppShell` | `(protected)/layout.tsx` | Server component. Desktop sidebar (`hidden md:flex`) = `Wordmark` + `SidebarNav` + bottom-pinned Logout form; mobile = `Wordmark` header + `BottomNav`. Holds no nav list of its own |
| `SidebarNav` | via `AppShell`, desktop only | Client component (needs `usePathname`). Renders `NAV_ITEMS`; one item active at a time — `bg-primary/10` + `text-primary` + 600 weight, `aria-current="page"`; the rest muted at 500 |
| `BottomNav` | via `AppShell`, mobile only | Client component, fixed bottom tab bar (`md:hidden`). Reads the same `NAV_ITEMS`, so both primary surfaces render one list (`design/architecture.md` §12.2) |
| `Wordmark` | `AppShell` (both breakpoints) | Server component. Near-black rounded square with a bold white "J" + the product name; `size="mobile"` shrinks it to 20px |
| `RouteTabs` | `/analytics`, `/settings` layouts | Client component (`"use client"`): horizontally-scrollable, `usePathname`-driven tab nav (`Link`s to sub-routes, not client-side state) — mirrors `BottomNav`'s active-link pattern |
| `JobsTable` | `/dashboard` | Client component (`"use client"`): holds multi-select **and expanded-row** state, renders the select-all checkbox header, the bulk-action bar (`Select` + Apply/Archive/Clear `Button`s), `Table` on desktop, `JobCard` list on mobile (`md:hidden`/`hidden md:block` split), `Badge`. Also owns the table's **single** keyboard listener and the roving-focus index (`↑`/`↓`/`R`/`A`/`D`, desktop only) plus the `<kbd>` legend above the table, tied to it with `aria-describedby` — see `design/architecture.md` §12.6 and decisions.md AD-60 |
| `JobRow` (expandable) | inside `JobsTable` | A focusable `TableRow` plus a second `TableRow` revealing `ai_reasoning` + `CompanyHistoryPanel`. Expansion state is **not** local — it is lifted to `JobsTable` so the `D` shortcut can reach it; the row receives `expanded`/`onToggleExpand`/`tabIndex`/`onFocusRow`/`rowRef`. Row checkbox, per-row `JobStatusSelect`, `aria-label`led reject/archive icon buttons (`size="icon-sm"`) |
| `JobStatusSelect` | inside `JobRow` | Client component: `Select` of statuses (colored dot) → `setJobStatusAction([jobId], statusId)` then `router.refresh()`. Optimistic with rollback on `ok: false`, and re-syncs from its prop in an effect because `JobRow` doesn't remount on refresh |
| `JobStatusSheet` | inside `JobCard`, mobile only | Mobile counterpart of `JobStatusSelect`. Controlled `Sheet` — closes on select — with the same optimistic-plus-rollback and prop re-sync contract |
| `jobScore.ts` / `jobHotkeys.ts` | imported by the above | Not components: plain modules holding the shared score bands + `formatScore` (AD-56) and the pure `resolveJobHotkey` decision function + `JOB_HOTKEYS` table (AD-60). No `"use client"`, no JSX, unit-tested in the node environment |
| `FilterBar` | `/dashboard` | Client component. `Input` (search over title/company), `Select` (location tag, source, status), `Input` (min score, max years), and four checkboxes: "Remote only", "Hide jobs I can't apply to" (default on, AD-51), "Hide low keyword matches" (default on, AD-52), "Show archived jobs". Holds **no** filter state — reads `useSearchParams()` and navigates; the URL is the store (architecture.md §12.3). The three typed fields go through an internal `FilterInput` that wraps each in a real `<form onSubmit>`, so Enter commits as well as blur, de-duplicated by a `lastCommitted` ref so Enter-then-blur navigates once. On mobile it collapses to a "Filters" pill with an active-count `Badge` opening a `Sheet`. Full param contract: `design/api-reference.md` §7.1 |
| Analytics tab pages | `/analytics`, `/analytics/scraping`, `/analytics/breakdown`, `/analytics/sources` | Server components, one per tab — each fetches only its own slice via `SupabaseMatchedJobsRepository`/`getSourceHealthReport`/`getScoringQueueReport`; transforms with pure fns; passes to `AnalyticsCharts` |
| `AnalyticsCharts` | all `/analytics/*` tabs | `"use client"` — recharts charts (`JobsOverTimeChart`, `JobsBySourceChart`, `ScoreHistogramChart`, `StatusBreakdownChart`, `JobsByExperienceChart`, `JobsByLocationChart`, `JobsByCompanyChart`, `ScoredBySourceChart`) + stat-card groups (`TokenStatsCards`, `SalaryStatsCards`, `RemoteStatCard`, `PipelineStatsCards`, `ScoringQueueStatsCards`). Empty-state guard per chart |
| `ExperienceCard` | `/settings` | Client `Card` + numeric `Input` → `setDesiredExperienceAction`; blank clears the soft year filter (P2) |
| `RoleSelectorForm` | `/roles` | `Input` + submit `Button` inside a real `<form>`, so Enter expands the role exactly as clicking does; empty/whitespace input is rejected in the handler, not only by the button's `disabled`. Only the input row is wrapped — the preview card below has its own inputs and forms cannot nest |
| `ExpandedRolesCard` | `/roles` | `Card`, `Badge` (toggleable chips per related role, click to include/exclude). Selected chips carry the accent tint at 600 weight, unselected stay plain outlined grey; `aria-pressed` reflects state. Confirm `Button` |
| `ResumeUploadCard` | `/resume` | Client component. Dashed dropzone with drag-and-drop + "Browse files" fallback over a visually-hidden `input type=file` (kept in the DOM for keyboard/AT users), selected-file row with a remove affordance, then `Button` → `uploadResumeAction`. Client-side type check is by extension — a dropped file can carry an empty MIME type; server-side validation is still the real gate |
| `SkillsEditor` | `/resume` | `Badge` (removable chips) + `Input` for adding new skills |
| `CompaniesTable` | `/settings` | `Table`, `Button` (edit/delete), `Dialog` |
| `CompanyFormDialog` | `/settings` | `Dialog`, `Input`, `Select` (source enum) |
| `ScrapeRunsList` | `/settings/activity` | `Table` — recent `scrape_runs` (source, status, jobs_found, run_at, error) |
| `ThresholdsCard` | `/settings` | `Card` — read-only display of `KEYWORD_THRESHOLD`/`NOTIFY_THRESHOLD` from config |
| Insights cards + `SkillRow` | `/insights` | `Card`, `Badge`, proportion bars. Server component recomputes job skills at read time (`extractSkills` over role-matched jobs), then `computeSkillDemand`/`computeSkillGaps`. **"In demand" renders first, "Level up" second** (decisions.md AD-55). `SkillRow variant` is `accent` for in-demand (tinted card + accent bars), `neutral` for gaps. Honest copy: demand is over the user's scraped role-matched jobs, not the market |
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
| `setJobStatusAction(jobIds, statusId)` | jobs | calls `jobs.application.setJobStatus()` (upsert `job_state` per id), revalidates `/dashboard`. Used by both the per-row dropdown (one id) and the bulk-select bar (many ids) |
| `setDesiredExperienceAction(years)` | settings | calls `settings.application.setDesiredExperience()` (upsert/clear `app_settings`), revalidates `/settings` + `/dashboard`. `null` clears the soft year filter (P2) |

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
