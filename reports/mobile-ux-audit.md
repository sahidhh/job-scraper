# Mobile UX Audit — Job Intelligence Platform

**Scope:** Read-only review of Dashboard, Settings, Roles, Resume, and the app shell/navigation, focused on the "feels cramped" report at ~375px viewport width (e.g. iPhone SE / standard small Android).

**Method:** Static review of Tailwind classes, layout primitives (`flex`/`grid`), fixed widths, and responsive breakpoints (`sm:`/`md:`/`lg:`) in the actual component source. No code was modified.

---

## Summary

The app is built almost entirely "desktop-first" with very few mobile-specific adjustments. The most severe problems are:

1. **Every data table (Dashboard jobs, Settings companies/notifications/scrape runs) renders a full multi-column `<table>` with no responsive column-hiding, stacking, or card-fallback for small screens.** The `Table` wrapper does add `overflow-x-auto`, so tables won't hard-break the layout, but the practical result on a 375px screen is horizontal scrolling through 4-6 columns of `whitespace-nowrap` cells — which is the single biggest contributor to the "cramped" feeling.
2. **`FilterBar` packs two `Select` triggers (`w-40` = 160px each) and a `w-32` (128px) number input into a `flex flex-wrap gap-2` row.** Two 160px selects already exceed 320px (more than a 375px viewport minus padding), so the row wraps awkwardly and/or the selects get visually squeezed.
3. **Several "feature" rows pack multiple interactive controls (icon + label, edit/delete buttons, badges) into single-line flex rows with no `flex-col` mobile fallback**, e.g. `CompaniesTable` action cell (`flex justify-end gap-2` with two buttons inside a `<td>` that's part of a wide table).
4. **Touch targets are mostly fine where shadcn defaults are used** (`Button` default height is `h-9` = 36px, `size="sm"` is `h-8` = 32px — both under the 44px guideline but consistent with shadcn defaults), but several **custom interactive elements have no padding at all**: the `JobRow` expand toggle (a bare `<button>` wrapping text), the `SkillsEditor` remove-skill `<button>` (just wraps a `h-3 w-3` icon, ~12px hit area), and the `ExpandedRolesCard` role-toggle buttons (inherit `Badge`'s `px-2 py-0.5` — quite small for a tap target).
5. **Padding is uniform and small on mobile**: `AppShell`'s `<main>` uses `p-4` (16px) with no reduction, and `CardContent`/`CardHeader` use a flat `px-6` (24px) at all breakpoints — combined with `space-y-6`/`space-y-4` stacks, this isn't necessarily "too tight," but combined with full-width tables and selects, the net effect is overflow rather than breathing room.
6. **No screen defines a distinct mobile layout** — `mx-auto max-w-2xl` / `max-w-4xl` containers just shrink to 100% width on small screens with the same internal structure, so cramped desktop layouts (especially tables) are inherited as-is rather than redesigned.

---

## Dashboard

### `src/app/(protected)/dashboard/page.tsx`
- Lines 44-63: Root container is `space-y-6`, header `text-2xl font-semibold` + `text-sm` subtitle — no responsive type scaling. On 375px this is fine for the heading itself, but it sets the pattern (no `sm:`/`md:` variants anywhere on this page).
- Lines 77-104: `DashboardJobs` wraps `FilterBar` and `JobsTable` in `space-y-4` with no max-width constraint — the table is allowed to be the full content width, which on mobile is ~343px (375px − 2×16px `p-4` from `AppShell`).
- Lines 79-88 and 89-99: The "no companies" / "no jobs" notice boxes use `rounded-md border ... p-3 text-sm` — reasonable, but the inline `<Link>`/`<Button size="sm">` inside (line 84-86) sits directly under body text with only `mt-2` (8px) gap — workable but tight.

### `src/components/dashboard/JobsTable.tsx`
- Lines 7-17: `TableHeader`/`TableRow` render **6 columns** (Title, Company, Location, Source, Score, Link) with no `hidden`/`md:table-cell` responsive classes on any `TableHead`. Every column ships to every breakpoint.
- The base `Table` component (`src/components/ui/table.tsx` line 7-20) wraps the `<table>` in `overflow-x-auto`, so the table won't break the page layout, but on 375px it becomes a horizontally scrollable strip.
- **Why cramped:** `TableCell` defaults to `whitespace-nowrap` (table.tsx line 86) and `TableHead` too (line 73). With 6 columns each needing room for "Title" (longest job titles), "Company", a location badge, a source badge, a percentage score, and a "View" link, the table's natural width is easily 700-900px+. On a 343px content area, this means the user must scroll horizontally to see "Score" and "Link" — the two most decision-relevant columns — after scrolling past Title/Company/Location/Source.
- **375px feel:** User sees "Title" and part of "Company" on first paint, with a faint horizontal scrollbar/visual cue (if any) at the bottom of the table. They must swipe right to find the AI score and the "View" link for each row — a core workflow action becomes a two-step (scroll table, then tap) interaction repeated per row.

### `src/components/dashboard/JobRow.tsx`
- Line 19: `<TableCell className="max-w-xs">` constrains the Title column to `max-w-xs` (20rem/320px) — on a table that's already overflowing, this just makes Title itself slightly more reasonable but doesn't help the other 5 columns.
- Lines 20-27: The expand/collapse toggle is a bare `<button type="button">` with `flex items-center gap-1` and **no padding** (`p-*`) — its tap target is exactly the size of the chevron icon (`h-4 w-4` = 16px) plus the text height. This is well under the 44px touch-target guideline, and on mobile (where precision tapping is harder) mis-taps are likely.
- Line 26: `<span className="truncate">{job.title}</span>` — combined with `max-w-xs`, long titles truncate with no tooltip/affordance to see the full text except by tapping to expand (which shows `aiReasoning`, not the full title).
- Lines 30-35: Location column renders one `<Badge variant="outline">` per tag with `space-x-1` — if a job has 2-3 location tags, this adds more horizontal width to an already-overflowing row.
- Lines 47-53: The expanded reasoning row uses `colSpan={6}` with `whitespace-normal text-sm` — this row does wrap correctly, but because the table is horizontally scrollable, the expanded content's effective width is also the scrolled table width, not the viewport width, so a user might have the reasoning text appear off to the side if they expand while scrolled right.

### `src/components/dashboard/FilterBar.tsx`
- Line 23: `<div className="flex flex-wrap gap-2">` — no `flex-col` on mobile, just wrapping.
- Lines 25, 39: Both `<SelectTrigger className="w-40">` are fixed at 160px (10rem) regardless of viewport. Two of these = 320px + `gap-2` (8px) = 328px, which on a 343px content area leaves only 15px before wrapping — the third element (`Input` at `w-32` = 128px, line 60) is guaranteed to wrap to its own line.
- Line 52-61: `<Input className="w-32">` (128px) for "Min AI score" — fixed width, will wrap below the two selects.
- **Why cramped:** None of the three filter controls use `w-full`/`flex-1` on small screens, so instead of stacking cleanly into a column of full-width controls (which would look intentional), they wrap mid-row, leaving the second select and/or the number input orphaned on a line by themselves with leftover empty space alongside.
- **375px feel:** Row 1 shows "Location ▾" and "Source ▾" selects nearly touching (8px gap), each showing truncated placeholder text in a 160px box; row 2 shows just the "Min AI score" number input (128px) with ~215px of empty space to its right. The filter bar looks unbalanced and the empty space reinforces a "things don't fit" feeling even though nothing is technically broken.

---

## Settings

### `src/app/(protected)/settings/page.tsx`
- Line 30: `<div className="mx-auto max-w-4xl space-y-6">` — on mobile this just becomes 100% width; no issue by itself, but everything inside inherits desktop-shaped children (tables, dialogs).
- Lines 36-48: "Companies" card — `CardHeader` uses `flex flex-row items-center justify-between` (line 37) to place the "Companies" title and "Add company" button on the same line with **no `flex-col` fallback for small screens**. `CardTitle` is `leading-none font-semibold` (from `card.tsx` line 35) with no explicit size — combined with a `<Button size="sm">`, this is a single dense row.
  - **375px feel:** "Companies" heading and an "Add company" button sit on the same line inside the card's `px-6` padding (24px each side from `card.tsx` line 23), leaving roughly 343px − 48px = ~295px for both the title text and the button — workable for short titles but a tight row, and if the button text or title were ever longer this would wrap awkwardly since there's no `gap` defined for the wrap case.
- Lines 57-69: The pipeline explanation box is a `rounded-md border ... p-3 text-sm text-muted-foreground` block with an inline link — wraps fine as block text, not a major issue.

### `src/components/settings/CompaniesTable.tsx`
- Lines 11-18: **5-column table** (Name, Source, Board token, Status, Actions) with no responsive hiding.
- Line 17: `<TableHead className="text-right">Actions</TableHead>` and line 31 `<TableCell className="flex justify-end gap-2">` — the Actions cell uses `flex` inside a `<td>`, containing an "Edit" button (`CompanyFormDialog` trigger, `<Button variant="outline" size="sm">`) and a "Delete" button (`DeleteCompanyButton`, also `size="sm"`). Two `size="sm"` buttons (`h-8` = 32px tall) side by side with `gap-2` (8px) — each button's horizontal padding is `px-3` (12px) per `button.tsx` line 26, so "Edit" + "Delete" together are roughly 130-150px wide minimum.
- **Why cramped:** Combined with Name, Source, Board token (can be a long string like a Greenhouse board slug), and a Status badge, the natural table width is well over 500px. On 343px content width, only "Name" and part of "Source" are visible before the user must scroll horizontally to reach the Edit/Delete actions — meaning **every company management action requires a horizontal scroll first**.
- **375px feel:** User sees company names and source badges, but the Edit/Delete buttons (the primary actions on this screen) are off-screen to the right, discoverable only via horizontal swipe — easy to miss entirely, especially since there's no visual scroll affordance beyond the native scrollbar.

### `src/components/settings/CompanyFormDialog.tsx`
- Line 64: `<DialogContent>` uses the shadcn default (`dialog.tsx` line 64): `w-full max-w-[calc(100%-2rem)] ... sm:max-w-lg`. On 375px, `max-w-[calc(100%-2rem)]` = 343px, so the dialog itself is reasonably sized with 16px margins on each side — **this is one of the better-behaved components**.
- Lines 70-102: Form fields use `grid gap-4 py-4` with full-width `Input`/`Select` — these stack vertically and are fine on mobile.
- Line 78: `<SelectTrigger id="source" className="w-full">` — correctly full-width, unlike `FilterBar`'s fixed-width selects.
- **Overall:** This dialog is comparatively mobile-friendly; no significant issues found beyond general dialog padding (`p-6` = 24px on `dialog.tsx` line 64, giving ~295px usable width for labels/inputs inside the 343px dialog — acceptable).

### `src/components/settings/DeleteCompanyButton.tsx`
- Lines 22-26: `<Button variant="outline" size="sm">` — 32px tall (`h-8`), `gap-1.5 px-3` (button.tsx line 26). Sits inside the cramped Actions cell described above. No mobile-specific issue beyond inheriting the table overflow problem.

### `src/components/settings/NotificationsLogList.tsx`
- Lines 7-14: **4-column table** (Job, Company, Source, Sent at).
- Line 24: `{new Date(entry.sentAt).toLocaleString()}` renders a full locale datetime string (e.g. "6/15/2026, 10:18:32 PM") inside a `whitespace-nowrap` cell (table.tsx line 86) — this alone is often 130-180px wide.
- **Why cramped:** Job title + Company name + Source badge + a ~150px timestamp easily exceeds 500-600px. No `max-w-*`/`truncate` on the Job or Company cells (unlike `JobRow`'s Title column), so long job titles or company names expand the table further.
- **375px feel:** User sees the start of the job title and has to scroll right to see which company it's from, what source it came from, and when it was sent — the four pieces of information that make this log useful are spread across a wide horizontal strip.

### `src/components/settings/ScrapeRunsList.tsx`
- Lines 14-21: **5-column table** (Source, Status, Jobs found, Run at, Error).
- Line 32: `<TableCell className="max-w-xs truncate">{run.error ?? "—"}</TableCell>` — Error column is truncated to `max-w-xs` (320px!), which is itself almost the entire mobile viewport width. Combined with Source/Status/Jobs found/Run at columns before it, this guarantees significant horizontal overflow — a single column's max-width allowance is nearly as wide as the whole screen.
- **375px feel:** Similar to NotificationsLogList — Source and Status badge visible first, "Jobs found" count, the run timestamp, and any error message all require horizontal scrolling, and the error message column alone could occupy the full scrolled width.

### `src/components/settings/ThresholdsCard.tsx`
- Lines 16-23: Two `flex justify-between` rows showing label/value pairs — this is one of the **best-behaved mobile patterns in the codebase** (stacks naturally, no fixed widths, `text-sm`). No issues.

---

## Roles

### `src/app/(protected)/roles/page.tsx`
- Line 11: `<div className="mx-auto max-w-2xl space-y-6">` — shrinks to full width on mobile, fine.
- No table usage on this page — generally more mobile-friendly than Dashboard/Settings.

### `src/components/roles/RoleSelectorForm.tsx`
- Lines 71-83: `<div className="flex gap-2">` containing an `<Input>` (no width class, defaults to `w-full min-w-0` from `input.tsx` line 11 — good) and a `<Button>` ("Expand"). Since `Input` has `min-w-0`, it can shrink, and the row should generally fit on 375px (Button is `h-9 px-4` ≈ 70-90px wide depending on text, leaving ~250px for the input) — **this is reasonably mobile-friendly**, though the Input+Button on one row does mean the input itself gets fairly narrow (around 250px) for typing a role title like "Senior Full Stack Developer".
- Lines 96-103: The "Saved!" confirmation box is `flex items-center gap-2` containing a `<p>` of body text AND a `<Button asChild size="sm" variant="outline">` **on the same row** with no wrap/`flex-col` fallback.
  - **Why cramped:** `items-center` + `gap-2` on a flex row with a paragraph of text ("Saved! This is now your active role selection.") and a button ("View matching jobs →") — on 343px available width, this text alone could be 200px+, leaving very little room for the button, which may wrap its own text or cause the row to overflow/squish.
  - **375px feel:** The confirmation message and the "View matching jobs →" button are crammed onto one line; depending on font rendering, the button text may wrap to two lines while still inline with the paragraph, or the whole row may overflow the card's padding.

### `src/components/roles/ExpandedRolesCard.tsx`
- Lines 34-55: `CardContent` uses `flex flex-wrap gap-2` — each related role renders as a `Badge asChild` wrapping a `<button>`. `Badge`'s base classes (`badge.tsx` line 8) are `px-2 py-0.5` — i.e., **8px horizontal / 2px vertical padding**, with `text-xs` (12px font). 
  - **Why cramped (touch target):** A `py-0.5` (2px) vertical padding on a `text-xs` badge gives a tap target of roughly 12px (text) + 4px (padding) = ~16px tall — far below the 44px guideline. These are meant to be tappable toggles (`aria-pressed`, `onClick`), so on mobile, tapping a specific role badge among several wrapped badges is a high-precision, error-prone action.
  - **375px feel:** A wall of small rounded pills (~16px tall) wrapping across 2-4 lines depending on how many related roles are returned — visually busy and fiddly to tap accurately, especially for roles with short labels (badges shrink-to-fit content, `w-fit` in `badge.tsx` line 8, so short role names produce very small badges).
- Lines 56-60: `CardFooter` (default `flex items-center px-6` from `card.tsx` line 78) contains a single full-default-size `<Button>` — no issue, this is fine.

---

## Resume Upload

### `src/app/(protected)/resume/page.tsx`
- Line 13: `<div className="mx-auto max-w-2xl space-y-6">` — fine on mobile.
- No tables; generally one of the more mobile-friendly pages.

### `src/components/resume/ResumeUploadCard.tsx`
- Line 36: `<form ... className="flex flex-col gap-4 sm:flex-row sm:items-end">` — **this is the only place in the entire codebase using a mobile-first `flex-col` → `sm:flex-row` pattern**, i.e., on mobile (`<640px`) the file input and "Upload" button stack vertically (good), and only become a row at `sm:` (640px+).
- Lines 37-40: File input wrapped in `flex-1 space-y-2` with a `<Label>` above an `<Input type="file">` — stacks cleanly.
- Line 41-43: `<Button type="submit">` — full default size, sits below the file input on mobile (since the form is `flex-col` by default) — reasonable width given `Button` doesn't have `w-full`, so the button will be only as wide as its label ("Upload"/"Uploading...") plus padding, left-aligned under the full-width file input. Minor visual inconsistency (file input spans full width, button doesn't) but not a functional cramped issue.
- **Overall:** This is the single component in the codebase that correctly implements a "stack on mobile, row on desktop" pattern — it should be used as the template for fixing `FilterBar` and other flex rows.

### `src/components/resume/SkillsEditor.tsx`
- Lines 46-61: `<div className="flex flex-wrap gap-2">` of `Badge variant="secondary" className="gap-1"` — each skill badge contains the skill text plus an `<X className="h-3 w-3" />` remove button.
  - Line 51-58: The remove `<button type="button">` has **no padding classes at all** — its tap target is exactly the rendered size of `h-3 w-3` (12px × 12px) icon. This is the smallest interactive element found in the entire review — at 12px square, it is roughly 1/4 the recommended 44px touch target area in each dimension, making it very difficult to tap precisely on a touchscreen without accidentally tapping the badge itself or an adjacent skill's remove button.
  - **375px feel:** A wrapped row of small pill-shaped skill badges, each with a tiny "x" at roughly 1/3 the size of the badge itself — users will likely mis-tap adjacent skills or the badge body (which has no `onClick`) when trying to remove a skill.
- Lines 62-78: `<div className="flex gap-2">` containing `<Input>` (full-width via `min-w-0`, good) and `<Button type="button">` "Add" — same pattern as `RoleSelectorForm`'s Expand row; on 375px, input shrinks to accommodate the "Add" button, which is acceptable but means the "Add a skill" input is narrower than the full card width.

---

## Navigation / Shell

### `src/components/layout/AppShell.tsx`
- Line 10: `<div className="flex min-h-screen flex-col md:flex-row">` — correct mobile-first stacking: column on mobile, row (sidebar + content) at `md:` (768px+). Good baseline.
- Line 11: `<aside className="hidden w-56 flex-col border-r p-4 md:flex">` — sidebar is `hidden` until `md:`, so it doesn't affect mobile layout at all. Good.
- Line 31: `<header className="flex items-center justify-between border-b p-4 md:hidden">` — mobile header with `p-4` (16px) padding, shown only below `md:`. Contains the app name (`font-semibold`) and `<MobileNav />`. This is a reasonable, standard mobile header pattern.
- Line 35: `<main className="flex-1 p-4 md:p-6">{children}</main>` — **`p-4` (16px) on mobile vs `p-6` (24px) on desktop**. This is the *opposite* of what's usually needed: mobile content (especially the wide tables described above) would benefit from *less* side padding to maximize usable width, but 16px is already fairly tight, and it's the only padding budget the cramped tables have to work with — every pixel of `p-4` padding directly subtracts from the ~16px of table real estate that's already overflowing.
- **No major issues** with the shell itself beyond it not helping mitigate the table-overflow problems elsewhere.

### `src/components/layout/MobileNav.tsx`
- Line 17: `<Button variant="ghost" size="icon" aria-label="Open menu">` — `size="icon"` is `size-9` (36px × 36px, per `button.tsx` line 28) — below the 44px guideline but a standard/acceptable shadcn icon button size, and it's the trigger for the whole nav, so it's an important tap target to get right. At 36px it's reasonably tappable but not ideal.
- Line 21: `<SheetContent side="left">` — uses shadcn defaults from `sheet.tsx` line 67: `w-3/4 ... sm:max-w-sm`. On 375px, `w-3/4` = ~281px wide drawer — workable.
- Lines 25-34: Nav items are `<Button variant="ghost" asChild className="justify-start gap-2">` — default button height `h-9` (36px) with `px-4 py-2` (button.tsx line 24) — each nav link is a 36px-tall tappable row, slightly under 44px but reasonable for a list of links with adequate vertical `gap-1` (4px) between them (line 25) — 4px gap between 36px targets is fairly tight; mis-taps between adjacent nav items (Dashboard/Roles/Resume/Settings) are plausible.
- Lines 35-40: Logout button at the bottom, `w-full justify-start gap-2`, same `h-9` height — consistent with nav items, fine.

### `src/app/(protected)/layout.tsx`
- Pure auth-check wrapper around `AppShell` — no layout/styling concerns.

### `src/components/layout/navItems.ts`
- Just a data array (4 nav items) — no layout concerns.

---

## Common Patterns

These issues recur across multiple screens and represent the systemic root causes of the "cramped" feeling:

1. **No responsive column management for tables.** `JobsTable` (6 cols), `CompaniesTable` (5 cols), `NotificationsLogList` (4 cols), and `ScrapeRunsList` (5 cols) all use the shared `Table`/`TableHead`/`TableCell` primitives with `whitespace-nowrap` (table.tsx lines 73, 86) and **zero `hidden md:table-cell`-style responsive classes**. Every one of these tables relies solely on the wrapper's `overflow-x-auto` (table.tsx line 11) to avoid breaking the page — meaning every data table on mobile is a horizontally-scrolling strip, and in every case the most important columns (actions, score, link, status/error) are pushed furthest right and off-screen first.

2. **Fixed pixel/rem widths on form controls that don't shrink for mobile.** `FilterBar`'s two `SelectTrigger className="w-40"` (160px each) plus `Input className="w-32"` (128px) — total 448px of fixed-width controls — vs. a ~343px mobile content area. Contrast with `CompanyFormDialog`'s `SelectTrigger className="w-full"` (line 78), which is correctly responsive. The fixed-width pattern in `FilterBar` is the only place this specific problem occurs, but it's one of the first things a mobile user interacts with on the Dashboard.

3. **Undersized custom tap targets on icon-only/text-only interactive elements**, none of which add padding for touch:
   - `JobRow.tsx` lines 20-27: expand/collapse `<button>` with no padding, ~16-20px effective height.
   - `SkillsEditor.tsx` lines 51-58: remove-skill `<button>` wrapping a bare `h-3 w-3` (12px) icon, no padding.
   - `ExpandedRolesCard.tsx` lines 38-52: role-toggle `Badge`-as-`<button>` using `badge.tsx`'s `px-2 py-0.5` (~16px tall).
   
   All three are functionally important (expand details, remove a skill, toggle a role selection) but are the smallest interactive elements in their respective screens.

4. **Single mobile-first exception proves the pattern is solvable but unused elsewhere**: `ResumeUploadCard.tsx` line 36 (`flex flex-col gap-4 sm:flex-row sm:items-end`) is the *only* `flex-col → sm:/md:flex-row` responsive flex pattern in any of the audited components. Every other multi-element row (`FilterBar`, `CompaniesTable` Actions cell, Settings "Companies" `CardHeader` title+button row, `RoleSelectorForm`'s "Saved!" confirmation row) uses a plain `flex` (or `flex flex-wrap`) with no breakpoint-based stacking, so they either overflow, wrap unpredictably, or compress on narrow screens.

5. **Uniform `p-4`/`px-6` padding regardless of viewport.** `AppShell`'s `<main>` (`p-4 md:p-6`) and every `Card`'s `CardHeader`/`CardContent` (`px-6` flat, from `card.tsx` lines 23 and 68) don't reduce on mobile. This isn't independently "too cramped," but it shrinks the already-insufficient space available to the overflowing tables and fixed-width controls described above — e.g., a `CompaniesTable` inside a `Card` has `343px (viewport) - 32px (main p-4) - 48px (card px-6 ×2)` ≈ **263px** of usable width for a 5-column table that needs 500px+.

6. **No `text-sm`/`text-base` responsive scaling anywhere** — headings are flat `text-2xl`, body/description text is flat `text-sm`, table text is the `Table`'s default `text-sm` (table.tsx line 15). This isn't a major legibility problem at typical mobile zoom levels, but it means dense table rows (`text-sm` + `p-2` per `TableCell`, table.tsx line 86) read as visually dense "spreadsheet" rows on a small screen with no compensating breathing room.

---

## Suggested Priority (informational only — no changes made)

If addressed, the highest-impact fixes (by how directly they map to the "cramped" complaint) would likely be, in order:
1. Responsive column hiding/reflow for the 4 data tables (Dashboard `JobsTable` and the 3 Settings list tables) — this is the dominant source of horizontal overflow.
2. `FilterBar`'s fixed-width `Select`/`Input` controls — switch to `flex-col sm:flex-row` with `w-full`/`flex-1`, mirroring `ResumeUploadCard`'s existing pattern.
3. Touch-target padding for `JobRow`'s expand button, `SkillsEditor`'s remove-skill button, and `ExpandedRolesCard`'s role-toggle badges.
4. `flex-col`/`flex-wrap` fallbacks for the Settings "Companies" card header and `RoleSelectorForm`'s "Saved!" confirmation row.
