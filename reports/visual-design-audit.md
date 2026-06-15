# Visual Design Audit — Job Intelligence Platform

**Scope:** Read-only visual review of the dashboard, settings, roles, and resume areas. No code changes made.
**Stack:** Next.js App Router + shadcn/ui + Tailwind CSS v4 (CSS-variable theme via `@theme inline` in `src/app/globals.css`).
**Goal:** Diagnose why the UI feels "bland" and why score/status indicators are unclear, and propose *incremental* tweaks only — same shadcn primitives, same theme system, no new design language.

---

## Summary

The app is functionally complete but visually monochrome. The root cause is structural, not cosmetic:

1. **The theme has zero color hue anywhere.** Every CSS variable in `src/app/globals.css` (lines 6-49) is defined with `oklch(L C H)` where chroma `C = 0` — i.e. pure grayscale — except `--destructive` (a red). There is no success/warning/info color, and no `chart-*` tokens exist in this theme at all. So "use an existing chart token" isn't an option yet — there's nothing to point to. The recommendations below add the *minimum* set of new tokens needed.
2. **The score column has no visual encoding at all.** `JobRow.tsx:40` renders the score as plain table text (`{formatScore(...)}`), with no badge, no color, and no distinction between "low score," "high score," and "not scored yet" — all three look identical (plain gray digits or an em-dash).
3. **Badge variants exist but are underused.** `badge.tsx` defines 6 variants (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`), but only `default`/`secondary`/`destructive`/`outline` are used anywhere, and only for source tags, location tags, and scrape-run status — never for scores.
4. **Empty states are inconsistent.** Some are well-handled (`JobsTable`, `NotificationsLogList`, `ScrapeRunsList` all have a one-line gray message), others are missing entirely (`SkillsEditor` has one, but `CompaniesTable` wasn't checked here and dashboard's "no companies" banner duplicates styling ad hoc rather than via a shared pattern).
5. **Hierarchy is present but minimal** — page titles use `text-2xl font-semibold` consistently, descriptions use `text-sm text-muted-foreground`, which is good. But within cards/tables there's very little secondary/tertiary distinction (e.g., company name and location tag look the same "weight" as the job title).

None of this requires a redesign — it requires: (a) adding 3-4 new semantic color tokens to `globals.css` following the exact pattern already used for `--destructive`, (b) adding 2-3 new badge variants using those tokens, and (c) applying those badges to the score column and status columns that currently render as plain text.

---

## Current State

### Color usage

- `src/app/globals.css:6-27` (`:root`) and `:29-49` (`.dark`) define the entire palette. Every token except `--destructive` (line 22: `oklch(0.577 0.245 27.325)`, a red) and `--ring`/`--destructive-foreground` has **chroma = 0** — i.e., black/white/gray only.
- There are **no `--chart-1`..`--chart-5` tokens**, no `--success`, `--warning`, `--info` tokens — common additions in shadcn themes are absent here.
- `@theme inline` (globals.css:51-75) maps CSS vars to Tailwind color utilities (`--color-primary`, `--color-destructive`, etc.) but again, only the grayscale + destructive set.
- Across the reviewed components, the **only non-gray color in the entire UI is red**, used for:
  - `text-destructive` on form error messages (`RoleSelectorForm.tsx:84`, `ResumeUploadCard.tsx:45`, `SkillsEditor.tsx:79`)
  - `Badge variant="destructive"` for `ScrapeRunsList` status = `"failed"` (`ScrapeRunsList.tsx:8,28`)
- Everything else — badges for source (`secondary`), location tags (`outline`), scrape status `"success"`/`"partial"` (`default`/`secondary`) — renders in black/white/gray, so **"success" and "partial" scrape statuses are visually indistinguishable from a "secondary" tag like a job source**. There is no consistent meaning mapped to color; gray badges are used for both neutral metadata (job source, location) and for a "good" status (`success` → `default` = solid black/white badge), which doesn't read as "success" to a user at a glance.

### Hierarchy

- Page-level: consistent `text-2xl font-semibold` for `<h1>` + `text-sm text-muted-foreground` for subtitle, in both `dashboard/page.tsx:46-51` and `settings/page.tsx:32-34`. This part is fine and should be preserved.
- Card-level: `CardTitle` (`card.tsx:31-39`) is `font-semibold` with `leading-none`; `CardDescription` is `text-sm text-muted-foreground` (card.tsx:41-49). Good, consistent.
- **Within JobRow**, there is almost no hierarchy:
  - Job title: `font-medium` (JobRow.tsx:23) — only slightly heavier than body text.
  - Company name: plain text, same size/weight as title (JobRow.tsx:29).
  - Score: plain text, same size/weight (JobRow.tsx:40).
  - The expanded AI-reasoning row uses `text-sm text-muted-foreground` (JobRow.tsx:49) — this is the only place secondary styling is applied, and it's for the *most* important qualitative content (why the AI scored the job this way), which seems backwards — reasoning text disappears into low-contrast gray.
- `ThresholdsCard.tsx:16-23` uses a nice micro-pattern (`text-muted-foreground` label + `font-medium` value in a `flex justify-between` row) — this hierarchy idea isn't reused anywhere else but could be.

### Empty states

| Location | Empty state present? | Implementation |
|---|---|---|
| `JobsTable.tsx:22-28` | Yes | `<TableCell colSpan={6} className="text-center text-muted-foreground">No jobs match the current filters.</TableCell>` |
| `dashboard/page.tsx:89-99` | Yes (3 variants) | `rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground` banner — handles "no jobs scraped yet", "no matches for role", and "scraped but not scored yet" |
| `dashboard/page.tsx:79-88` | Yes | Same banner pattern, "no companies configured" + CTA button |
| `ScrapeRunsList.tsx:35-41` | Yes | `<TableCell colSpan={5} className="text-center text-muted-foreground">No scrape runs yet.</TableCell>` |
| `NotificationsLogList.tsx:27-33` | Yes | Same pattern, "No notifications sent yet." |
| `SkillsEditor.tsx:47` | Yes | `<p className="text-sm text-muted-foreground">No skills extracted yet.</p>` |
| `RoleSelectorForm.tsx` | N/A (no list to be empty) | — |

**Observation:** Two different empty-state idioms are used inconsistently:
1. Table-row em-dash style (`text-center text-muted-foreground` inside a `<TableCell>`) — used in `JobsTable`, `ScrapeRunsList`, `NotificationsLogList`.
2. Bordered banner style (`rounded-md border border-border bg-muted/50 p-3 text-sm`) — used in `dashboard/page.tsx` for the "no companies" and "no jobs/not scored" cases.

Both are reasonable and minimal, but having two patterns for conceptually the same "nothing here yet" message adds visual inconsistency. They're also both purely gray — no icon, no illustration, which is appropriate for "minimal" but currently reads as a bit cold/empty (contributing to "bland" feedback) since there's zero visual anchor.

### Badges

`src/components/ui/badge.tsx:11-21` defines:
- `default` — solid `bg-primary` (black in light mode / white in dark mode)
- `secondary` — `bg-secondary` (light gray)
- `destructive` — `bg-destructive` (red)
- `outline` — bordered, transparent background
- `ghost` — no background, hover only
- `link` — text-style, underline on hover

**Actual usage found:**
- `JobRow.tsx:32-34` — `variant="outline"` for location tags
- `JobRow.tsx:38` — `variant="secondary"` for job source
- `ScrapeRunsList.tsx:5-9,28` — `STATUS_VARIANT` map: `success → "default"`, `partial → "secondary"`, `failed → "destructive"`
- `NotificationsLogList.tsx:22` — `variant="secondary"` for notification source
- `ExpandedRolesCard.tsx:38-43` — `variant={isSelected ? "secondary" : "outline"}` for toggleable role chips
- `SkillsEditor.tsx:49` — `variant="secondary"` for skill chips

**Not used anywhere:** `ghost`, `link` variants; and **no badge is ever used for the job score**, despite score being the single most important triage signal on the dashboard.

### Score indicators

- `JobRow.tsx:9-11`:
  ```tsx
  function formatScore(score: number | null): string {
    return score === null ? "—" : `${Math.round(score * 100)}%`;
  }
  ```
- `JobRow.tsx:40`: `<TableCell>{formatScore(job.aiScore ?? job.keywordScore)}</TableCell>` — plain text cell, no badge, no color, no icon.
- Because `aiScore` is only populated when `keywordScore >= KEYWORD_THRESHOLD` (per `src/features/scoring/domain/types.ts:7` comment and `ThresholdsCard.tsx` description), **a large fraction of jobs will have `aiScore = null`** and fall back to `keywordScore` — but the displayed `%` looks identical whether it's an AI score or a keyword score, and identical again whether it's 5% or 95%. There is no way to tell at a glance:
  - "this is a strong match" vs "this is a weak match" vs "this hasn't been scored yet" (only the `—` em-dash covers the last case, and only if *both* scores are null).
- `JobRow.tsx:50`: `{job.aiReasoning ?? "No AI reasoning available yet."}` — this is the "No AI response available yet" text the user is seeing. It appears whenever `aiReasoning` is null, which (per the scoring pipeline) happens for **every job that didn't clear `KEYWORD_THRESHOLD`** — i.e., potentially most jobs. Currently this renders in `text-sm text-muted-foreground` (line 49) with no visual distinction from a row that *does* have AI reasoning — a user has to expand every row to discover whether AI reasoning exists, and when it doesn't, the message is presented in the same low-key gray as the actual reasoning text would be, giving no signal that "not yet AI-scored" is an expected/normal state vs. an error.
- `dashboard/page.tsx:95-98` does have a page-level banner for "all jobs unscored" (`jobs.every((job) => job.aiScore === null)`), which is good — but it's an all-or-nothing check; if *some* jobs have `aiScore` and others don't, there's no per-row signal at all.

### Visual density

- Page wrapper: `space-y-6` (dashboard/page.tsx:44, settings/page.tsx:30) — consistent.
- Card default padding: `py-6` + `px-6` on header/content/footer (card.tsx:10,23,68,78) — standard shadcn, consistent, fine.
- Table cells: `p-2` (table.tsx:86) — fairly tight, which is appropriate for a dense data table, but combined with zero color/weight variation it makes every row feel like an undifferentiated wall of text.
- `FilterBar.tsx:23`: `flex flex-wrap gap-2` — consistent gap usage with badges/chips elsewhere (`gap-2` used in `ExpandedRolesCard.tsx:34`, `SkillsEditor.tsx:46`).
- Banners (`bg-muted/50 p-3`) appear 4 times with identical classes (`dashboard/page.tsx:80,90,96`, `RoleSelectorForm.tsx:97`, `settings/page.tsx:57`) — good consistency, candidate for extraction into a shared component (not required for this audit, but worth noting since it's already a de facto pattern).

Overall density is fine; the "bland" perception is driven by color/hierarchy, not spacing.

---

## Recommendations

All recommendations preserve the existing shadcn component API (`Badge`, `Card`, `Progress`, etc.) and Tailwind v4 `@theme inline` token pattern. No new components, no new design system — only new CSS variables (following the exact pattern of `--destructive`), new `cva` variants on existing components, and class-name changes in the listed files.

### 1. Color (new theme tokens)

Add a small set of semantic tokens to `src/app/globals.css`, mirroring exactly how `--destructive` / `--destructive-foreground` are already defined (lines 22-23, 44-45) and wired into `@theme inline` (lines 66-67). Suggested additions to `:root` (and dark-mode equivalents in `.dark`):

```css
/* :root, alongside --destructive (line 22-23) */
--success: oklch(0.62 0.17 145);          /* green, similar lightness/chroma to destructive's red */
--success-foreground: oklch(0.985 0 0);
--warning: oklch(0.77 0.16 75);           /* amber */
--warning-foreground: oklch(0.205 0 0);
--info: oklch(0.6 0.14 250);              /* blue, optional — for "in progress/partial" */
--info-foreground: oklch(0.985 0 0);
```

```css
/* .dark, alongside dark --destructive (line 44-45) */
--success: oklch(0.7 0.15 145);
--success-foreground: oklch(0.985 0 0);
--warning: oklch(0.75 0.15 75);
--warning-foreground: oklch(0.145 0 0);
--info: oklch(0.65 0.13 250);
--info-foreground: oklch(0.985 0 0);
```

And register them in `@theme inline` (globals.css:51-75), next to the `--color-destructive*` lines (66-67):

```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
--color-info: var(--info);
--color-info-foreground: var(--info-foreground);
```

This is the **only** new-token addition needed — it gives the app exactly 3 new hues (green/amber/blue) used consistently for meaning, on top of the existing grayscale + red. That's a deliberate, minimal palette: still feels "minimal/professional" (matches the muted, low-chroma feel of the existing `--destructive`), but finally gives the UI a way to differentiate good/neutral/warning/bad at a glance.

### 2. Status colors (scrape runs, notifications)

`ScrapeRunsList.tsx:5-9` currently maps:
```ts
const STATUS_VARIANT = {
  success: "default",   // solid black/white — doesn't read as "success"
  partial: "secondary", // light gray — doesn't read as "in-between"
  failed: "destructive",// red — correct
} as const;
```

Once the `success`/`warning` tokens above exist, add matching `badgeVariants` entries in `badge.tsx` (alongside the existing `destructive` variant at lines 15-16):

```ts
success:
  "bg-success text-success-foreground [a&]:hover:bg-success/90",
warning:
  "bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
```

Then update `ScrapeRunsList.tsx:5-9`:

```ts
const STATUS_VARIANT = {
  success: "success",
  partial: "warning",
  failed: "destructive",
} as const;
```

Result: scrape run status badges become green/amber/red — a 1-line map change plus the 2 new variants, no layout change. Apply the same `success`/`warning`/`destructive` vocabulary anywhere else a tri-state status appears (none currently found in `NotificationsLogList.tsx`, which only shows source — no change needed there).

### 3. Score color system

This is the highest-impact change for the "unclear scores" complaint. Proposal — a small helper + badge, used at `JobRow.tsx:40`:

**Buckets** (using `aiScore ?? keywordScore` as today, but now color-coded):

| Condition | Label | Badge variant | Rationale |
|---|---|---|---|
| `aiScore === null && keywordScore === null` (shouldn't happen per schema, but keep as fallback) | `—` | `outline` (current default) | unchanged fallback |
| `aiScore === null` (keyword-only, not yet AI-scored) | `Pending` or the keyword `%` + "Pending AI review" | `outline` with `text-muted-foreground` (i.e. visually muted/neutral) | Signals "not an error, just not processed yet" — addresses the "No AI response available yet" confusion by making the *pending* state visually distinct from a *scored* state, right in the score column, without needing to expand the row |
| `aiScore !== null && aiScore >= NOTIFY_THRESHOLD` (default 0.75, from `ThresholdsCard.tsx:22`/`settings/page.tsx:27`) | `{pct}% ` | `success` | "High match" — green |
| `aiScore !== null && aiScore >= KEYWORD_THRESHOLD` (default 0.5) but `< NOTIFY_THRESHOLD` | `{pct}%` | `warning` | "Moderate match" — amber |
| `aiScore !== null && aiScore < KEYWORD_THRESHOLD` | `{pct}%` | `outline` (muted) | "Low match" — stays neutral gray, doesn't need alarm color |

Concretely, in `JobRow.tsx`, replace the plain-text `formatScore` call (line 40) with a small badge-returning helper. Thresholds should be passed down (they're already loaded server-side in `settings/page.tsx:26-27` via `optionalEnv`; the dashboard page would need to load+pass the same two env values as props through `JobsTable` → `JobRow`, which is a small prop-threading change, not new architecture).

Example markup for the cell:

```tsx
<TableCell>
  {job.aiScore === null ? (
    <Badge variant="outline" className="text-muted-foreground">
      Pending
    </Badge>
  ) : (
    <Badge variant={scoreVariant(job.aiScore, thresholds)}>
      {Math.round(job.aiScore * 100)}%
    </Badge>
  )}
</TableCell>
```

where `scoreVariant` is a small pure function (fits the "prefer pure functions" rule) co-located with `formatScore` in `JobRow.tsx` or moved to a shared `features/jobs` helper:

```ts
function scoreVariant(aiScore: number, t: { notify: number; keyword: number }): "success" | "warning" | "outline" {
  if (aiScore >= t.notify) return "success";
  if (aiScore >= t.keyword) return "warning";
  return "outline";
}
```

This directly fixes the "many jobs show no score" complaint by giving the *no-score-yet* state its own clearly-labeled, muted "Pending" badge instead of a bare `%` or `—`, and fixes "unclear status" by color-coding scored jobs green/amber/gray by tier — using only the new `success`/`warning` variants from recommendation #1/#2 plus the existing `outline` variant.

**Also update `JobRow.tsx:50`** — when `aiReasoning` is null, instead of rendering `"No AI reasoning available yet."` in the same `text-sm text-muted-foreground` as real reasoning text would be, pair it with a small inline `Badge variant="outline"` reading "Pending AI review" so the expanded-row state matches the score-column state visually (same vocabulary, same muted-outline treatment) — e.g.:

```tsx
{job.aiReasoning ?? (
  <span className="flex items-center gap-2">
    <Badge variant="outline" className="text-muted-foreground">Pending AI review</Badge>
    <span>This job matched on keywords; AI scoring runs after the keyword threshold is met.</span>
  </span>
)}
```

(Wording TBD — point is to pair the existing muted message with the same "Pending" badge used in the score column, so the two "not yet AI-scored" signals are visually consistent.)

### 4. Card improvements

These are minimal layout/copy tweaks, not structural changes:

- **`dashboard/page.tsx:89-99`** — the three empty-state banners (no jobs scraped / no matches / not scored) and the "no companies" banner (lines 79-88) all reuse the exact class string `rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground`. Since this string is now repeated 4+ times across the codebase (also `RoleSelectorForm.tsx:97`, `settings/page.tsx:57`), consider extracting a tiny `InfoBanner`/`EmptyState` presentational component in `src/components/ui/` (still shadcn-style, just a styled `div` wrapper) — purely a DRY cleanup, no new visual language. Optionally add a small `lucide-react` icon (e.g. `Info` or `Inbox`) at 16px (`size-4`) before the text for these banners to give "empty" states a slight visual anchor — addresses some of the "bland" feeling cheaply, still minimal.
- **`JobsTable.tsx:22-28` and `ScrapeRunsList.tsx:35-41` / `NotificationsLogList.tsx:27-33`** — unify these three table-empty-states (currently `text-center text-muted-foreground` table cells) to optionally include the same small icon + slightly larger text (`text-sm` → keep, but add `py-6` instead of relying on the table's default `p-2`, so empty states get a bit of breathing room rather than looking like a cramped single row).
- **`JobRow.tsx`** — once the score badge (recommendation #3) is added, consider giving the job title slightly more visual weight relative to company/location to reinforce hierarchy: bump title from `font-medium` (line 23) to `font-semibold`, and keep company name (line 29) and location badges as-is (already de-emphasized via `outline`/plain text). This is a 1-class change.
- **`ThresholdsCard.tsx`** — already a good micro-pattern (label/value row); no changes needed, but its `flex justify-between` + `text-muted-foreground` label / `font-medium` value pattern could be reused for any future "key stat" rows (e.g., could show "Jobs pending AI review: N" using the same row style — optional, not required).
- **`ExpandedRolesCard.tsx:38-43`** — selected vs. unselected role chips currently differ only by `secondary` vs `outline` + `text-muted-foreground`. This is fine and consistent with the "minimal" goal; no change needed, but note it's the one place `secondary` badges are used for an *active/selected* meaning rather than purely "metadata" — worth keeping in mind if/when the new `success` token is introduced, so "selected" doesn't get accidentally confused with "success" in future work.

---

## Net effect of these changes

- **New CSS**: ~12 lines added to `globals.css` (6 light-mode vars + 6 dark-mode vars + 6 `@theme inline` mappings — really ~18 lines total, all copy-pasted from the existing `--destructive` pattern).
- **New badge variants**: 2 (`success`, `warning`) added to `badge.tsx`'s existing `cva` config — same pattern as `destructive`.
- **Component changes**: `JobRow.tsx` (score cell + reasoning fallback), `ScrapeRunsList.tsx` (1-line status map), optionally `JobsTable.tsx`/`NotificationsLogList.tsx`/`dashboard/page.tsx` for empty-state polish.
- **No new dependencies, no new files required** (an optional `EmptyState` helper component is a nice-to-have, not required).
- **Result**: the dashboard gains a green/amber/gray score system that immediately answers "is this a good match, an okay match, or not yet AI-scored" — directly addressing both reported issues (bland palette, unclear scores) — while staying within the existing shadcn/Tailwind v4 token + variant system.
