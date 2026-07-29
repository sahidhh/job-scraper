# WP-E — Dark Mode Plan

> **📋 Planning document. Nothing here is implemented.** This file describes what
> shipping dark mode would cost, what it would contradict, and whether it is worth
> doing. It ends with a position, not a menu.

**Goal:** Decide whether to activate the dark token set that already exists in
`src/app/globals.css`, and if so, specify the mechanism, the audit obligations,
and the test surface precisely enough that the work is uncontroversial.

**Headline:** The toggle is ~40 lines and one button. The *audit* that has to
accompany it is the expensive half — and the audit finds a WCAG AA failure that
exists in **light mode today**. See [§8 Recommendation](#8--recommendation).

---

## 1 — Current state

### 1.1 What already exists

`src/app/globals.css` carries a **complete, symmetric two-theme token set**.

| | `:root` (lines 6–36) | `.dark` (lines 38–66) |
|---|---|---|
| Surfaces | `--background`, `--card`, `--popover` | all three, re-valued |
| Text | `--foreground`, `--card-foreground`, `--popover-foreground`, `--muted-foreground` | all four |
| Accent | `--primary` `oklch(0.5 0.1 264)`, `--primary-foreground`, `--ring` | `--primary` `oklch(0.62 0.13 264)` — lightened, same hue family, per AD-54's own consequences note |
| Neutrals | `--secondary`, `--muted`, `--accent` (+ `-foreground` each) | all six |
| Status | `--destructive`, `--success`, `--warning`, `--info` (+ `-foreground` each) | all eight |
| Chrome | `--border`, `--input` | both, as `oklch(1 0 0 / 10%)` and `/ 15%` |

There are **26 custom properties in `:root` and 26 in `.dark`** — a genuine parallel
set, not a partial one. Every one of them is mapped into Tailwind v4's theme scale
in the `@theme inline` block (globals.css:68–102), so `bg-card`, `text-muted-foreground`,
`border-border` and friends all resolve through the tokens rather than through a
palette. The `@custom-variant dark (&:is(.dark *))` declaration on line 4 wires the
`dark:` utility variant to the class strategy.

### 1.2 The single missing link

**Nothing in the repository ever sets the `dark` class.** `src/app/layout.tsx:37`
renders:

```tsx
<html lang="en" className={ibmPlexSans.variable}>
```

and that is the only `<html>` in the app apart from `src/app/global-error.tsx:18`,
which replaces the root layout on a root-layout crash. Grep for `classList`,
`localStorage`, `sessionStorage`, `document.cookie` across `src/` returns **zero
matches**. There is no provider, no cookie, no script, no toggle. The 26 dark
tokens are dead CSS that ships in every stylesheet and renders never.

### 1.3 How much `dark:` coverage exists in components

Grepping `dark:` across `src/` yields **11 occurrences across 5 files**, all of them
in `src/components/ui/`:

| File | Occurrences | What they do |
|---|---|---|
| `button.tsx` | 4 (lines 8, 14, 16, 20) | `dark:aria-invalid:ring-destructive/40`, `dark:bg-destructive/60`, `dark:border-input dark:bg-input/30 dark:hover:bg-input/50`, `dark:hover:bg-accent/50` |
| `badge.tsx` | 2 (lines 8, 16) | `aria-invalid` ring opacity, `dark:bg-destructive/60` |
| `input.tsx` | 2 (lines 11, 13) | `dark:bg-input/30`, `aria-invalid` ring |
| `textarea.tsx` | 2 (lines 10, 12) | same shape |
| `select.tsx` | 1 (line 40) | same shape |

**Every one is upstream shadcn boilerplate.** Not one is app-authored. They handle
two things only: the translucent input fill (`bg-input/30`, which needs a different
opacity on dark) and the `aria-invalid` focus-ring alpha.

The correct reading of this is **not** "coverage is 11 utilities deep and the rest
is missing". It is that **the app barely needs `dark:` variants**, because the app
was written against semantic tokens throughout. A `bg-card text-card-foreground`
component is already correct in both themes by construction; it needs no variant.
The places that break are exactly the places that bypassed the tokens — and there
are a knowable, small number of those (§4.3).

### 1.4 What the docs say

`design/tech-stack.md:273–277`, under **Theming**:

> **One fixed theme.** There is no runtime theme switcher, no density toggle, and no
> accent picker (decisions.md AD-54). Dark mode exists as a `.dark` class variant with
> a full parallel token set, but nothing currently toggles it.

This is accurate and self-aware. It is also the sentence that has to change.

---

## 2 — The AD-54 question

### 2.1 What AD-54 actually decided

`docs/decisions.md:593–603`, *"Ship the design handoff's indigo accent as one fixed
theme, not the prototype's tweakable theme props"* (2026-07-27).

Read the decision and the rationale separately, because they are not the same claim.

**The decision sentence** says: adopt the indigo accent, and *"Ship it as **one fixed
theme**. The prototype's three tweakable props (accent hue indigo/emerald/amber/rose,
corner style sharp/rounded/soft, density cozy/compact) are **not** ported as runtime
knobs; the documented defaults (indigo / rounded / cozy) become the only values."*

**The rationale** is entirely about those three props:

> Runtime theming would mean three new persisted settings, a settings surface to change
> them, and every component having to survive a density switch, in exchange for a
> preference exactly one person holds and has already expressed by choosing the defaults.
> That is the configuration sprawl CLAUDE.md's "fewer concepts, less configuration" rule
> exists to prevent.

Every clause of that reasoning is about **accent hue, corner radius, and density**.
Light/dark is not one of the three props. It is not mentioned anywhere in AD-54 — not
in the decision, not in the rationale, not in the three alternatives considered. The
only place dark appears is in the **consequences**: *"`--primary`/`--primary-foreground`
change in both `:root` and `.dark`"* — an acknowledgement that the dark set exists and
must stay in sync, which is the opposite of a decision to never use it.

### 2.2 The honest distinction

**AD-54 decided "one fixed accent". Its wording says "one fixed theme".** Those are
different claims and the gap matters:

| AD-54's reasoning rules out | AD-54's reasoning does *not* rule out |
|---|---|
| An accent-hue picker (4 values, pure taste, no external signal) | A light/dark switch |
| A corner-style toggle (would need every radius re-checked) | — |
| A density toggle (*"every component having to survive a density switch"*) | — |
| A settings surface to hold all three | — |

Three reasons the argument does not transfer:

1. **It is not a taste preference held once.** Accent hue is chosen once and never
   revisited. Light/dark changes with time of day and ambient light — for the same
   user, on the same machine, within the same hour.
2. **The OS already carries the preference.** `prefers-color-scheme` means there is
   no "new persisted setting" to invent and, in the recommended design (§3), **no
   settings surface at all**. AD-54's central cost — configuration sprawl — is
   structurally absent.
3. **Nothing has to "survive" it.** The density objection is real: a density switch
   changes layout, and every component must be re-verified against it. A theme switch
   changes *colour values behind tokens that already have two definitions*. The parallel
   set in globals.css:38–66 is the survival work, and it is already done.

Conversely, AD-54's reasoning **does** apply, unchanged, to the other two props. Nothing
in this plan reopens them.

### 2.3 Recommendation: a superseding AD, not an amendment

**Write a new AD-60 that supersedes AD-54 in part.** Do not edit AD-54.

Rationale:

- `docs/decisions.md` is an append-only log — *"Numbered for reference (ADR-style)"* —
  and there is precedent: **AD-14** is titled *"…(supersedes AD-07/AD-08 null handling)"*.
  Superseding in place is the established move in this file.
- AD-54's substantive outcome — the indigo `--primary`, `--ring` following the accent,
  the rejection of the hue/corner/density props — is **still correct and still in force**.
  Editing it to say "one fixed accent" would quietly rewrite history and lose the record
  of what was actually believed on 2026-07-27.
- An amendment also cannot carry the new reasoning (`prefers-color-scheme` as the
  external signal, the audit obligations, the two-state-no-settings-surface design).
  That is a paragraph of argument, which is what an AD is for.

**AD-60 must say, explicitly:**

- It narrows AD-54 on **one axis only**: light/dark. AD-54's rejection of the accent
  picker, the corner-style toggle and the density toggle is **re-affirmed verbatim**.
  Without this sentence, "we shipped a theme toggle" becomes the precedent for the
  accent picker in the next pass. (See §7, risk 8.)
- The toggle is **two-state with no settings surface** — it lives in the app shell,
  not on `/settings`, precisely so that AD-54's configuration-sprawl objection stays
  unmet rather than merely outvoted.
- Shipping the toggle is conditional on the token corrections in §4 landing with it.

`design/tech-stack.md`'s Theming subsection (lines 273–277) is then rewritten in the
same commit, per CLAUDE.md's document maintenance table (UI / design-system change →
`tech-stack.md` §8 + `architecture.md` §12).

---

## 3 — Toggle mechanism

One recommendation per question. Alternatives are recorded with why they lost.

### 3.1 Persistence: `localStorage`, not a cookie

**Recommended: `localStorage`, key `theme`, values `"light" | "dark"`, absent = follow the OS.**

A cookie read server-side via `await cookies()` in the root layout is the other
plausible design, and it has one genuine advantage: the class is in the server-rendered
HTML, so there is no flash and no hydration concern at all. It loses anyway:

- **A cookie cannot express "follow the OS".** The server has no access to
  `prefers-color-scheme` (the `Sec-CH-Prefers-Color-Scheme` client hint exists but must
  be negotiated over a round trip, and is not universally supported). You would have to
  either drop system-default entirely, or write the OS preference back into the cookie
  from the client on first load — which reintroduces the flash you were avoiding.
- **`cookies()` opts the root layout out of static rendering**, for every route including
  `/login`. Not fatal, but it is a real cost paid on every page for a colour.
- The stated advantage is worth less than it looks: §3.3's script eliminates the flash
  anyway, and §3.5 eliminates the hydration concern by construction.

`localStorage` handles all three states — `"light"`, `"dark"`, absent-means-system — in
one place, and lets the OS-preference branch subscribe to `matchMedia` changes at runtime.

### 3.2 Default: `prefers-color-scheme`, with explicit override

**Recommended: the OS preference is the default; one click writes an explicit override
that wins from then on.**

- No stored value → read `matchMedia("(prefers-color-scheme: dark)")`, and **subscribe**
  to its `change` event so the app follows an OS-level auto-switch live.
- Stored value → use it, ignore the OS, drop the subscription.

Explicit-only (always start light until told otherwise) is simpler by about four lines
and gets the very first page load wrong for a user whose machine is already in dark mode
— which is the single load where a wrong theme is most jarring. Not worth the four lines.

**Two-state control, not three.** The UI is a single toggle: light ⇄ dark. There is
deliberately **no "System" option in the control**, even though the storage model has
three states. A three-way cycle button cannot be labelled by one icon, and "it defaulted
correctly, then I set it" covers the actual usage. The cost is that after the first click
the OS is never followed again — correct behaviour, and what an explicit toggle implies.

### 3.3 Flash of wrong theme: a blocking inline script in `<head>`

The problem, stated precisely: the server has no idea which theme to render, so it emits
`<html class="__variable_xxxx">`. If the class is applied by a `useEffect`, the browser
paints a **white page** — `--background: oklch(1 0 0)` — and then repaints dark after
hydration. On a slow connection that is a full-screen white flash of several hundred
milliseconds, which is worse than not having dark mode.

The only fix is a **synchronous, blocking, inline script in `<head>`**, executed before
the first paint. `layout.tsx` gains an explicit `<head>`:

```tsx
<html lang="en" className={ibmPlexSans.variable} suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
  </head>
  <body className="font-sans antialiased">{children}</body>
</html>
```

`next/script` with `strategy="beforeInteractive"` is the documented App Router
alternative and would also work; a plain inline `<script>` in an explicit `<head>` is
preferred here because its ordering semantics are obvious and it adds no framework
coupling for ~15 lines of code.

> **⚠️ The trap that will bite.** The script must **`classList.add("dark")`**, never
> `document.documentElement.className = "dark"`. `<html>` already carries `next/font`'s
> generated class, which is the *only* thing defining `--font-ibm-plex-sans`
> (`layout.tsx:34–37`). Overwriting `className` silently drops the app's entire
> typography to the fallback stack — and it would look like a font bug, not a theme bug.
> This trap is **new**: it did not exist before the `next/font` change landed on this branch.

### 3.4 `color-scheme`, the part a naive implementation misses

Add to `globals.css`:

```css
:root { color-scheme: light; }
.dark { color-scheme: dark; }
```

Without it, native scrollbars, `<select>` dropdown popups, date pickers, autofill
backgrounds and the browser's own canvas colour stay in light mode. This is the single
most common "why does it still look half-light" defect, and it is two lines.

### 3.5 SSR / hydration correctness

Three concrete obligations, all App-Router-specific:

1. **`suppressHydrationWarning` on `<html>`.** The script mutates `<html>`'s class before
   React hydrates, so server and client markup differ. React's suppression is
   **one level deep** — it covers `<html>`'s own attributes and nothing below it, which is
   exactly the blast radius wanted. Note the standing rule this creates: **never branch
   server-rendered output on theme.** Branch in CSS.
2. **The toggle's icon must be CSS-driven, not state-driven.** A client component that
   renders `{isDark ? <Moon/> : <Sun/>}` cannot know the theme during SSR and will either
   mismatch or need a `mounted` flag that produces a visible icon flicker on every load.
   Instead:

   ```tsx
   <Sun className="size-4 dark:hidden" />
   <Moon className="hidden size-4 dark:block" />
   ```

   Both icons are in the server HTML; the `.dark` class — already applied by the §3.3
   script *before* hydration — decides which one is visible. Zero hydration risk, zero
   flicker, no `mounted` state. `lucide-react` is already a dependency.
   The accessible name stays static (`aria-label="Toggle light and dark theme"`) for the
   same reason; do not compute it from state.
3. **The click handler is the only stateful part**, and it needs no React state at all:
   read `document.documentElement.classList.contains("dark")`, toggle it, write
   `localStorage`. Nothing re-renders. This is why no store is needed — which matters,
   because CLAUDE.md bans Zustand and Redux and "add a theme store" is therefore not an
   available answer. It also is not a *needed* answer: the DOM is the state.

### 3.6 `next-themes` vs ~40 hand-written lines

Weighed honestly rather than dismissed.

**What `next-themes` gives beyond a hand-rolled script:** the injected no-flash script,
`localStorage` handling, `matchMedia` subscription, the `color-scheme` property,
**cross-tab sync via the `storage` event**, and a `useTheme()` hook. It is small
(~5 kB) and well-maintained, and it is what most Next apps use.

**Recommended: hand-rolled.** Reasons, in order of weight:

1. Of that list, §3.1–3.5 cover everything except cross-tab sync — and cross-tab sync is
   ~4 lines (`window.addEventListener("storage", …)`) if it turns out to matter. It is
   the only genuine gap, and it is a small one.
2. `useTheme()` is dead weight here because §3.5's CSS-driven icon means **nothing in the
   tree needs to read the theme in JS**. next-themes' main ergonomic win does not apply.
3. It requires wrapping the entire tree in a client `<ThemeProvider>`. The root layout is
   currently a pure server component, and every route under `(protected)` is server-rendered.
   Adding a client context at the root for a colour is a real architectural cost.
4. CLAUDE.md's dependency discipline. This is not a banned package, but "a dependency for
   something a few lines can do" is the same instinct the ban list encodes.

**The condition under which this flips:** if the toggle grows to three states with a
settings surface, or if theming needs to be readable from JS, take the dependency rather
than growing the hand-rolled version. Record that trigger in AD-60 so the next person
does not re-derive it.

### 3.7 Where the control lives

`src/components/layout/AppShell.tsx` has two chrome surfaces:

| Surface | Lines | Current contents |
|---|---|---|
| Desktop sidebar | 12–23 | `Wordmark`, `SidebarNav`, and a `mt-auto` footer holding the logout form |
| Mobile header | 28–30 | `Wordmark` only, `md:hidden` |
| Mobile bottom nav | 36 (`BottomNav`) | six nav destinations |

**Recommended:**

- **Desktop → the `mt-auto` footer group, directly above the logout button** (AppShell.tsx:17–22).
  Same `variant="ghost"`, same `w-full justify-start gap-2 text-muted-foreground`, same
  visual weight. It is a chrome-level, non-navigational control, which is exactly what
  that footer already holds. Requires wrapping the button and the logout form in a
  `<div className="mt-auto">` and moving `mt-auto` off the form.
- **Mobile → the header** (AppShell.tsx:28–30), right-aligned opposite the wordmark. That
  header currently holds one element and has room; add `justify-between`.
- **Explicitly not `BottomNav`.** `BottomNav` maps `NAV_ITEMS` and applies
  `aria-current="page"` per item; it is a `<nav>` landmark labelled "Primary (mobile)".
  A theme button is not a destination, has no `aria-current` state, and would break the
  "two renderings of one navigation" invariant that `architecture.md` §12.2 and
  `limitations.md` §10.4 exist to protect.
- **Explicitly not `/settings`.** Putting it there creates the settings surface AD-54
  argued against, and invites the accent picker to move in next door.

---

## 4 — Contrast audit obligations

**Target: WCAG 2.1 level AA.** 4.5:1 for normal text; 3:1 for large text (≥24 px, or
≥18.66 px bold); 3:1 for UI-component boundaries and meaningful graphical objects (SC 1.4.11).

**Both token sets get audited, not just the new one.** The light set has never been
measured either, and §4.1 is the reason that matters.

### 4.1 The status-token foregrounds — a light-mode failure, made worse in dark

This is the headline audit finding, and it is not hypothetical.

| Token pair | `:root` | `.dark` | Used by |
|---|---|---|---|
| `--success` / `--success-foreground` | `oklch(0.6 0.15 145)` / `oklch(0.985 0 0)` | `oklch(0.72 0.17 145)` / `oklch(0.985 0 0)` | `Badge variant="success"` (`badge.tsx:17`) |
| `--info` / `--info-foreground` | `oklch(0.6 0.15 230)` / `oklch(0.985 0 0)` | `oklch(0.72 0.15 230)` / `oklch(0.985 0 0)` | `Badge variant="info"` (`badge.tsx:19`) |
| `--destructive` / `--destructive-foreground` | `oklch(0.577 …)` / `oklch(0.985 0 0)` | `oklch(0.704 …)` / `oklch(0.985 0 0)` | token unused — `badge.tsx:16` and `button.tsx:14` hardcode `text-white`, same effective pairing |

Near-white text on a mid-lightness chroma. **Light mode is already around 3.2:1 for
success** — below the 4.5:1 required for the `text-xs` score pill, which is the badge
the entire dashboard is read through (AD-56 makes `success` mean "this would have
notified you", so it is load-bearing, not decorative). **Dark mode is worse, around
2.2:1**, because the `.dark` values were *lightened* for surface separation while the
foregrounds stayed at `oklch(0.985)`.

**Correction on the brief's framing:** the brief describes `--warning` as having *"a
near-white foreground in light mode and a near-black one in dark"*. The code says
otherwise — `--warning-foreground` is `oklch(0.145 0 0)`, near-**black**, in *both*
`:root` (line 30) and `.dark` (line 60), against amber at L 0.77 / 0.82. That pairing
passes comfortably in both (roughly 8.6:1 and 9.8:1).

**`--warning` is the only status token done correctly.** The fix for the other three is
to make them look like warning — a dark foreground on a light chroma — not to darken the
backgrounds and keep white text, which would fight the surfaces.

**How verified:** all six values are literals in one file. Compute the ratios directly
(convert oklch → sRGB → relative luminance) and record the resulting table in
`design/tech-stack.md` §8 so the numbers are checked in, not re-derived.

### 4.2 The accent-tinted surfaces — low contrast by construction

`bg-primary/10` with `text-primary` appears at exactly three call sites, and they are
three of the most important state indicators in the app:

| Site | File:line | What it marks |
|---|---|---|
| Sidebar active item | `SidebarNav.tsx:27` — `bg-primary/10 font-semibold text-primary` | where you are |
| Accent stat chip | `dashboard/page.tsx:194,197` — `border-primary/30 bg-primary/10` + `text-primary` | the key dashboard metric |
| Selected role chip | `ExpandedRolesCard.tsx:53` — `border-primary/30 bg-primary/10 font-semibold text-primary` | which role is active |

These are **low contrast by design**: a 10% alpha wash of the accent, with the accent
itself as the text on top of it. Light mode is comfortable (accent `oklch(0.5 0.1 264)`
on a near-white wash, roughly 7:1). Dark mode has two distinct risks:

1. **Text:** `oklch(0.62 0.13 264)` on `oklch(0.145 0 0)` plus a 10% self-wash lands near
   5.5:1 — probably passes, but "probably" is not an audit. Measure it.
2. **The wash itself may vanish.** 10% of a mid-lightness accent over a near-black
   background is a barely-perceptible lift. If the selected-state affordance disappears,
   that is a failure no *text*-contrast ratio detects — the text still passes while the
   selection is invisible. The `border-primary/30` boundary is the SC 1.4.11 3:1 case and
   the more likely of the two to fail.

**How verified:** compute the composited wash colour (10% primary over `--background`)
and check it against `--background` at 3:1 for the boundary, plus the text ratio. Then
look at it — this is one of the places where the number and the perception can disagree.
Expect to raise the dark-mode wash to `/15` or `/20`.

### 4.3 Chrome borders in dark

`--border: oklch(1 0 0 / 10%)` (globals.css:63) over `--background: oklch(0.145 0 0)`
composites to roughly L 0.22. Against `--card: oklch(0.205 0 0)` that is **nearly
invisible** — and borders are doing structural work everywhere: the sidebar `border-r`
(`AppShell.tsx:12`), the mobile header `border-b` (line 28), `BottomNav`'s `border-t`
(`BottomNav.tsx:18`), every `Card`, and the dashboard table's row separators. Row
separators in a dense data table are a meaningful graphical boundary under SC 1.4.11.

**Expected outcome:** raise dark `--border` to roughly `oklch(1 0 0 / 16–20%)` and
`--input` proportionally. Verify by measuring border-vs-card and border-vs-background
at 3:1, and by looking at `JobsTable` at full row count.

### 4.4 Status dots — user data, outside any token audit

`job_statuses.color` is a **database column the user edits** in
`src/components/settings/StatusConfigSection.tsx` (line 28, `useState("#6b7280")`;
line 129, `style={{ backgroundColor: status.color }}`). It is rendered as an inline style
at `JobStatusSelect.tsx:10` and `JobStatusSheet.tsx:14`, and fed to
`StatusBreakdownChart`'s `Cell` fills. The seeded defaults are Tailwind-100-family
pastels chosen against a white page: `#DCFCE7`, `#DBEAFE`, `#E5E7EB`.

**No token audit can control these, and no CSS variable will ever reach them.**

Position: **accept and document.** The rendering is an 8 px `rounded-full` dot
(`size-2`), and a pale pastel is *more* visible on a dark page than on a light one, not
less. Do not add a per-theme colour column, a contrast-correcting shim, or a colour
validator to `StatusConfigSection` — that is a data-model change for a decorative dot.
Record it as a residual in `design/limitations.md` §10.

**One real fix in scope:** `SupabaseMatchedJobsRepository.ts:138` hardcodes
`color: "#E5E7EB"` for the synthetic "New" bucket. That is *our* value, not the user's,
and it should reference a token (or be `null` with the chart falling back to `--muted`).

### 4.5 Non-token surfaces that will simply look broken

Two categories, both found by grep, both small and bounded:

**Charts** — `src/features/insights/ui/AnalyticsCharts.tsx` mostly does this right:
`AXIS_STYLE` (line 43) uses `fill: "var(--muted-foreground)"` and every `CartesianGrid`
uses `stroke="var(--border)"`, so axes and grids follow the theme for free. Two gaps:

- **`<Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />`, at seven call sites.**
  Recharts' default tooltip is an opaque **white** panel with dark text and no theme
  awareness. In dark mode every chart tooltip is a white slab. Needs
  `backgroundColor: "var(--popover)"`, `color: "var(--popover-foreground)"`,
  `border: "1px solid var(--border)"`.
- Series fills are literal hex — `#6366f1` (lines 66, 91), `#10b981` (114, 156),
  `#f59e0b` (173), `#8b5cf6` (198), `#ec4899` (226). These are saturated mid-tones and
  read acceptably on both grounds. **Lower priority**; note but do not gate on it.

**Health tables** — `ScrapeRunHealthTable.tsx:9–11,54` and `SourceHealthTable.tsx:4–6`
use raw Tailwind palette classes (`bg-green-100 text-green-800`, `bg-yellow-100
text-yellow-800`, `bg-red-100 text-red-800`, `bg-orange-100 text-orange-800`) with no
`dark:` variant. **These are the only two files in all of `src/` using literal palette
colours.** On a dark page they become light pastel pills — legible, but glaring and
obviously unthemed. Fix by moving them onto `Badge`'s existing `success` / `warning` /
`destructive` variants, which is where they always belonged; do not paper over it with
`dark:` variants.

Everything else in the app is token-driven and needs no change. The route-level
`loading.tsx` skeletons currently on this branch use `bg-muted` + `animate-pulse` and
are already correct.

---

## 5 — Testing

The repo gained a jsdom + testing-library layer: `vitest.config.ts` keeps
`environment: "node"` as the default (line 19) so the ~1000 domain tests keep their
speed, and component tests opt in per file with a `// @vitest-environment jsdom`
docblock — see `src/components/dashboard/FilterBar.test.tsx:1`. `jsdom`,
`@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom`
are all installed.

### 5.1 What is genuinely testable

**Design the script to be testable, then test it.** Write the no-flash logic as a real,
typed, exported function in `src/lib/theme.ts` and serialize it into the `<script>` tag
with `String(fn)` / a template. The same code that ships is then the code under test.
Constraint this imposes: the function must be **entirely self-contained** — no imports,
no closures over module scope, no TypeScript-only syntax that survives into the emitted
string. Say so in a comment, because it is not obvious and it breaks silently.

| Test | Environment | Asserts |
|---|---|---|
| `applyStoredTheme` — stored `"dark"` | node | adds `dark` to the passed element's `classList` |
| `applyStoredTheme` — stored `"light"` | node | removes it, even when the OS prefers dark |
| `applyStoredTheme` — nothing stored, OS prefers dark | node | adds `dark` |
| `applyStoredTheme` — nothing stored, OS prefers light | node | does not add it |
| **`applyStoredTheme` preserves existing classes** | node | the `next/font` variable class survives — the §3.3 regression guard |
| `ThemeToggle` — click | jsdom | `document.documentElement.classList` flips |
| `ThemeToggle` — click | jsdom | `localStorage.getItem("theme")` is written |
| `ThemeToggle` — pre-seeded storage | jsdom | honoured on mount |
| `AppShell` placement | jsdom | the toggle renders in the sidebar footer and the mobile header (guards a shell refactor silently dropping it) |

**Two concrete gotchas** that will cost an hour if not written down now:

- **jsdom does not implement `window.matchMedia`.** The OS-preference branch throws
  unless it is stubbed: `vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))`.
  This is why `applyStoredTheme` should take `prefersDark: boolean` as a **parameter**
  rather than calling `matchMedia` internally — it makes the pure cases node-testable
  with no stubbing at all.
- **jsdom's `localStorage` persists across tests within a file.** Clear it in `beforeEach`
  or test 3 will read test 2's write.

### 5.2 What is not testable, stated plainly

**No test in this repo can tell you whether dark mode looks right.**

- There is no compiled stylesheet in the test environment. Tailwind v4 resolves
  `@theme inline` at build time; jsdom's `getComputedStyle` will not resolve
  `var(--card)` through it. A "contrast test" would have to hardcode the token values
  into the test file — at which point it asserts the test's own copy of the table, not
  the app's. That is a test that passes forever while the app drifts.
- The failures that actually matter in §4 are **perceptual**: the sidebar border
  dissolving into the card, the selected-role wash becoming invisible, seven white
  tooltip slabs. Every one of those passes a class-name assertion.
- FOUC is unobservable in jsdom, which never paints.

**So the audit is a checklist, not a suite**, and the plan says so rather than pretending
otherwise:

1. A one-off ratio computation over the 52 token literals in `globals.css`, its output
   checked into `design/tech-stack.md` §8 as a table.
2. A manual visual pass over all 15 routes (`src/app/**/page.tsx`) in both themes.

Both are one-time costs at ship, re-run only when a token changes.

---

## 6 — Phased plan

| Phase | Work | Effort |
|---|---|---|
| **0 — Decide** | Write AD-60 (§2.3). Rewrite `design/tech-stack.md:273–277`. **Blocks everything else.** | ~0.5 h |
| **1 — Mechanism** | `src/lib/theme.ts` (self-contained `applyStoredTheme` + the serialized script constant). `layout.tsx`: explicit `<head>`, inline script, `suppressHydrationWarning`. `globals.css`: `color-scheme` in `:root` and `.dark`. `ThemeToggle` client component with CSS-driven icons. Wire into `AppShell` sidebar footer + mobile header. Tests per §5.1. | ~2 h |
| **2 — Token corrections** | Fix `--success` / `--info` / `--destructive` foregrounds in **both** sets (§4.1). Raise dark `--border` / `--input` (§4.3). Measure the accent washes (§4.2). Compute and check in the ratio table. | ~2 h |
| **3 — Non-token surfaces** | Recharts `Tooltip` `contentStyle` × 7 (§4.5). `ScrapeRunHealthTable` + `SourceHealthTable` onto `Badge` variants. `SupabaseMatchedJobsRepository.ts:138` `#E5E7EB` → token. | ~2 h |
| **4 — Visual pass + docs** | 15 routes × 2 themes. Then `design/tech-stack.md` §8, `design/architecture.md` §12, `design/user-guide.md` (the toggle is a user-visible workflow change), `design/limitations.md` §10 (the §4.4 status-colour residual). | ~1.5 h |

**Total ≈ 8 hours.** Phases 1–3 are one commit's worth of coupled work; splitting them
across PRs ships a visibly broken intermediate state (§7, risk 1).

**Phase 2 is worth doing on its own,** with or without dark mode. It fixes a live
light-mode AA failure on the dashboard's primary badge.

---

## 7 — What could go wrong

1. **Half-done dark mode is worse than none.** Two hardcoded-palette health tables and
   seven white tooltip slabs are enough to make the whole feature read as broken — and
   once the toggle exists it *will* get used and those *will* be hit within a minute.
   **Phases 2 and 3 are not polish; they are the feature.** Do not ship Phase 1 alone.
2. **The script overwrites `className` and silently kills the font.** §3.3. It presents
   as a typography bug on an unrelated branch. Guarded by a named test in §5.1.
3. **`suppressHydrationWarning` masking a genuine mismatch.** Its scope is one element's
   own attributes, so the blast radius is small — but the standing rule it creates
   (never branch server-rendered output on theme; branch in CSS) has to be written into
   AD-60, or a future component will read the theme in a server component and diverge.
4. **The token corrections change light mode too.** Fixing `--success-foreground` alters
   the appearance of the score pill on every existing screen. That is the *correct*
   outcome — it is a live AA failure — but it is a visible change to a surface nobody
   asked to change, and it needs to be called out in the AD rather than discovered.
5. **`--primary` drift.** AD-54 already had to change `--primary` in both `:root` and
   `.dark`. Once dark mode is live, any future accent change must be made twice and
   verified twice, and getting it wrong is now *visible* rather than dormant. Cheap
   mitigation: a comment in `globals.css` above `.dark` saying so.
6. **The `next/font` class and the theme class now share `<html>`.** A future migration to
   `next-themes` would have both writing to the same element. Note the ordering
   requirement in AD-60's consequences.
7. **Recharts tooltips are easy to miss** because they only appear on hover, and a
   route-by-route visual pass that does not hover every chart will not catch them.
   Put "hover one point on every chart" in the Phase 4 checklist explicitly.
8. **Scope creep straight back into AD-54.** The moment a theme toggle exists, "and an
   accent picker while we're here" is one PR away — and the accent picker was rejected
   for reasons that remain entirely valid. AD-60 must re-affirm AD-54 on the other three
   axes in its own text, not merely leave them unmentioned.

---

## 8 — Recommendation

**Build it — as the two-state, no-settings-surface version in §3, and only in a change
that ships Phases 2 and 3 alongside it.**

The single-user objection is the strongest argument against, and on inspection it points
the other way. A personal tool has no support burden, no second user to confuse, no
settings screen to design, and no A/B question about what people want — the one user is
the one asking. AD-54's actual objection was **configuration sprawl**, and the design
above creates none: no new persisted setting the user has to reason about, no settings
surface, no `app_settings` row, no server involvement, no dependency. One `localStorage`
key that the OS supplies a default for, and one button in chrome that already holds a
button. Meanwhile the parallel token set is already written, already shipping in every
stylesheet, and currently exists only as something `design/tech-stack.md` has to apologise
for. Activating it is the cheapest way this codebase has to convert dead configuration
into a working feature — which is the exact inversion of AD-54's *"variables nothing
writes to are dead configuration that reads as an unfinished feature."*

**But the sharper finding is that the audit is worth more than the feature.** §4.1 is not
a dark-mode problem. `Badge variant="success"` — the pill that means "this job would have
triggered a notification", the thing the dashboard is *read through* — is at roughly
3.2:1 against a 4.5:1 requirement, **in light mode, today, shipped.** Dark mode is what
caused anyone to measure it.

So, if effort has to be capped:

- **Do Phase 2 regardless.** It is two hours, it is a real accessibility fix on the most
  important component in the app, and it is independent of whether a toggle ever exists.
- **Then do Phases 0, 1, 3, 4 together** as one commit. Eight hours all-in for a feature
  the owner will use every evening of an active job hunt.
- **Do not ship Phase 1 by itself under any circumstances.** A toggle that reveals two
  glaring pastel tables and seven white tooltips is a worse outcome than the current
  honest "one fixed theme".
