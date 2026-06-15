# UI Improvement Plan — Job Intelligence Platform

Synthesized from `performance-audit.md`, `mobile-ux-audit.md`, `visual-design-audit.md`,
and `product-ux-audit.md`. Read-only audits; no code changed.

## Summary

The dashboard is functionally complete but communicates pipeline/scoring state poorly,
is desktop-first to the point of being unusable on small screens for its core tables,
and reads as visually flat because score/status signals have no color or hierarchy.
None of this requires a redesign — the fixes are targeted copy, query, and class-name
changes within the existing shadcn/Tailwind component set.

---

## P0 — Critical usability issues

Issues that actively confuse/mislead users or block core understanding of the product.

1. **"No AI reasoning available yet." reads as an error/per-job issue, not a platform-wide pending state.**
   Reword the fallback so it doesn't imply imminent completion and ties back to the visible
   keyword score (e.g., "AI review pending — keyword match score shown above.").
   `src/components/dashboard/JobRow.tsx:50`
   *Source: product-ux-audit.md (Deep Dive + Recommendation 3)*
   Effort: **S**

2. **Score column is visually ambiguous and conflates AI score with keyword-score fallback.**
   `formatScore(job.aiScore ?? job.keywordScore)` renders an unlabeled plain-text `%` with
   no badge/color, and no way to tell "high match" vs "low match" vs "not yet AI-scored" vs
   "this is a keyword score, not an AI judgment." Introduce a score badge with a "Pending"
   state (when `aiScore === null`) and success/warning/outline color tiers (when scored),
   plus a visible AI/Keyword provenance label.
   `src/components/dashboard/JobRow.tsx:9-11, 40, 50`
   *Sources: visual-design-audit.md (§"Score indicators", Recommendation 3) and
   product-ux-audit.md (Step 3b, Recommendations 3-4) — merged into one item*
   Effort: **M**

3. **"Jobs scraped but not scored yet" banner uses an all-or-nothing condition (`jobs.every(...)`).**
   The moment a single job gets an `ai_score`, the banner disappears even though most jobs
   remain unscored — the most likely real-world state (partially scored) gets zero status
   messaging. Replace with a count-based message ("N of M jobs pending AI review") shown
   whenever `N > 0`.
   `src/app/(protected)/dashboard/page.tsx:95-98`
   *Source: product-ux-audit.md (Summary, Recommendation 2) and visual-design-audit.md
   (§"Score indicators", final bullet) — same finding from two angles*
   Effort: **S**

4. **No persistent pipeline/status summary on the dashboard.** Users have no "last scraped: X,
   N jobs matched, M scored by AI, K pending" line — only buried inline banners. Add a status
   line above the existing banners using data already fetched (`jobs`, `scrapeRuns`).
   `src/app/(protected)/dashboard/page.tsx:89-99` (insertion point); data already loaded at
   `src/app/(protected)/dashboard/page.tsx:71-75`
   *Source: product-ux-audit.md (Summary, Recommendation 1)*
   Effort: **M**

5. **Jobs table has no pagination/limit — unbounded result set causes slow/degrading loads.**
   `findForDashboard` fetches every matching row with no `.limit()`, and `JobsTable` renders
   one hydrated `JobRow` client component per row with no virtualization. This is the highest-
   leverage performance fix and gets worse over time as the scraper ingests continuously.
   Add `.limit(N)` (~50-100) plus a "load more"/page control.
   `src/features/jobs/infrastructure/SupabaseJobRepository.ts:171-198`,
   `src/app/(protected)/dashboard/page.tsx:71-75`, `src/components/dashboard/JobsTable.tsx:18-29`
   *Source: performance-audit.md (Finding 2, also underlies Finding 6)*
   Effort: **L**

6. **"Min AI score" filter silently returns zero results while AI scoring is globally pending,
   with no explanation.** A user setting any threshold while `ai_score` is null for all jobs
   sees the generic "No jobs match the current filters." and reasonably concludes "no good
   matches" rather than "AI scoring hasn't run yet." Disable/hide the filter (or show a
   tooltip) when zero jobs in the current result set have a non-null `aiScore`.
   `src/components/dashboard/FilterBar.tsx:52-61`,
   `src/features/jobs/infrastructure/SupabaseJobRepository.ts:193-196`,
   `src/components/dashboard/JobsTable.tsx:25`
   *Source: product-ux-audit.md (Step 3, Recommendation 5)*
   Effort: **S**

---

## P1 — High value improvements

1. **Every data table (Dashboard, Companies, Notifications, Scrape Runs) is a 4-6 column
   `<table>` with no responsive column-hiding/stacking — the dominant cause of "cramped"
   mobile feel.** Add `hidden md:table-cell`-style responsive classes to push secondary
   columns (Location, Source, error text, timestamps) off small screens, prioritizing the
   columns users act on (Score, Link/Actions).
   `src/components/dashboard/JobsTable.tsx:7-17`,
   `src/components/settings/CompaniesTable.tsx:11-18`,
   `src/components/settings/NotificationsLogList.tsx:7-14`,
   `src/components/settings/ScrapeRunsList.tsx:14-21, 32`
   *Source: mobile-ux-audit.md (Summary point 1, Common Patterns #1, Suggested Priority #1)*
   Effort: **L**

2. **FilterBar's fixed-width controls overflow on mobile and also drive a full-page refetch
   on every change.** Two `w-40` selects + `w-32` input (448px total) exceed a ~343px mobile
   content area and wrap awkwardly. Separately, each change triggers `router.push` which
   re-runs the entire `DashboardPage`/`DashboardJobs` server tree (re-fetching companies and
   scrape-runs unnecessarily). Fix the layout with `flex-col sm:flex-row` + `w-full`/`flex-1`
   (mirroring `ResumeUploadCard`'s existing mobile-first pattern), and wrap `<JobsTable>` in
   its own `Suspense` boundary so filter changes don't re-resolve the page shell/banners.
   `src/components/dashboard/FilterBar.tsx:12-20, 23-25, 39, 52-61`,
   `src/app/(protected)/dashboard/page.tsx:37-63, 65-104`
   *Sources: mobile-ux-audit.md (Summary point 2, Common Patterns #2, Suggested Priority #2)
   and performance-audit.md (Finding 1) — same component, two angles, merged*
   Effort: **M**

3. **Theme has zero color hue — add success/warning/info tokens and wire up status badges.**
   `globals.css` defines only grayscale + `--destructive` (red). Add `--success`/`--warning`/
   `--info` tokens (and dark-mode equivalents) following the existing `--destructive` pattern,
   register them in `@theme inline`, and add matching `badgeVariants`. Apply to
   `ScrapeRunsList`'s status map (`success`/`partial`/`failed` currently render as
   black/gray/red, where "success" doesn't read as success) and to the score badge from P0 #2.
   `src/app/globals.css:6-49, 51-75`, `src/components/ui/badge.tsx:11-21`,
   `src/components/settings/ScrapeRunsList.tsx:5-9, 28`
   *Source: visual-design-audit.md (Summary points 1/3, Recommendations 1-3)*
   Effort: **M**

4. **No pagination/limit on jobs query + over-fetched `description` field bloats RSC payload.**
   `findForDashboard` selects `*` (including the full `description` text, never rendered by
   `JobRow`) for an unbounded row set. Select only the columns the dashboard uses; combine
   with P0 #5's `.limit()` for compounding payload reduction.
   `src/features/jobs/infrastructure/SupabaseJobRepository.ts:172-174`,
   `src/features/jobs/domain/types.ts:4-18, 49-53`,
   `src/components/dashboard/JobRow.tsx:1, 13, 50`
   *Source: performance-audit.md (Finding 3)*
   Effort: **M**

5. **"Min AI score" filter applies in application code after fetching the full result set**,
   so it doesn't reduce query size — push it into the Supabase query as a `.gte()` on
   `job_scores.ai_score`. Compounds with P0 #5/P1 #4.
   `src/features/jobs/infrastructure/SupabaseJobRepository.ts:171-198`,
   `src/features/jobs/domain/types.ts:42-46`
   *Source: performance-audit.md (Finding 4)*
   Effort: **S**

6. **Settings "Companies" card header and `RoleSelectorForm`'s "Saved!" confirmation row
   lack `flex-col` mobile fallbacks**, causing cramped/overflowing single-line rows on
   small screens. Apply `flex-col sm:flex-row` (same pattern as P1 #2).
   `src/app/(protected)/settings/page.tsx:36-48`,
   `src/components/roles/RoleSelectorForm.tsx:96-103`
   *Source: mobile-ux-audit.md (Common Patterns #4, Suggested Priority #4)*
   Effort: **S**

---

## P2 — Nice-to-have

1. **Two inconsistent empty-state idioms** (table-row em-dash style vs. bordered banner
   style) used for conceptually the same "nothing here yet" message. Unify into one pattern;
   optionally add a small `lucide-react` icon for visual anchor. Candidate for extracting a
   shared `EmptyState`/`InfoBanner` component (the `bg-muted/50 p-3` banner class string is
   already repeated 4+ times).
   `src/components/dashboard/JobsTable.tsx:22-28`,
   `src/app/(protected)/dashboard/page.tsx:79-99`,
   `src/components/settings/ScrapeRunsList.tsx:35-41`,
   `src/components/settings/NotificationsLogList.tsx:27-33`,
   `src/components/roles/RoleSelectorForm.tsx:97`,
   `src/app/(protected)/settings/page.tsx:57`
   *Source: visual-design-audit.md (§"Empty states", Recommendation 4)*
   Effort: **M**

2. **Minor hierarchy/spacing tweaks within `JobRow`**: bump job title from `font-medium` to
   `font-semibold` to better separate it from company/location text (1-class change).
   `src/components/dashboard/JobRow.tsx:23, 29`
   *Source: visual-design-audit.md (§"Hierarchy", Recommendation 4)*
   Effort: **S**

3. **Undersized tap targets on secondary controls**: `JobRow` expand/collapse button (no
   padding, ~16-20px), `SkillsEditor` remove-skill button (12px icon, no padding), and
   `ExpandedRolesCard` role-toggle badges (`px-2 py-0.5`, ~16px tall). Add padding to bring
   these closer to the 44px guideline.
   `src/components/dashboard/JobRow.tsx:20-27`,
   `src/components/resume/SkillsEditor.tsx:51-58`,
   `src/components/roles/ExpandedRolesCard.tsx:38-52`
   *Source: mobile-ux-audit.md (Common Patterns #3, Suggested Priority #3)*
   Effort: **S**

4. **Resume upload has no success confirmation or "next step" link.** After a successful
   upload, show an inline confirmation ("Resume uploaded — skills extracted below.") and a
   "Next: select your target roles →" link to `/roles`; consider auto-revalidating so
   `SkillsEditor` appears without a manual reload.
   `src/components/resume/ResumeUploadCard.tsx:21-26`
   *Source: product-ux-audit.md (Recommendation 6)*
   Effort: **M**

5. **"Recent notifications: No notifications sent yet." doesn't explain that this is expected**
   while AI scoring is globally pending. Append a contextual note when relevant.
   `src/components/settings/NotificationsLogList.tsx:30-31`
   *Source: product-ux-audit.md (Recommendation 8)*
   Effort: **S**

6. **De-jargon the Settings pipeline-trigger explanation** ("workflow_dispatch", direct
   GitHub Actions link) for non-technical users — add a plainer one-line summary with the
   GitHub link as secondary detail.
   `src/app/(protected)/settings/page.tsx:57-69`
   *Source: product-ux-audit.md (Recommendation 9)*
   Effort: **S**

7. **Small sequential waterfall before parallel data fetch** (auth check → active-selection
   lookup → parallel jobs/companies/scrape-runs). Listed for completeness; auth check is
   deliberate and step 2→3 is a genuine dependency, so this is largely unfixable without
   backend restructuring (out of scope). Net improvement if ever addressed: tens of ms.
   `src/app/(protected)/layout.tsx:7-12`, `src/app/(protected)/dashboard/page.tsx:38-41, 66-75`
   *Source: performance-audit.md (Finding 5)*
   Effort: **S** (low priority — minimal payoff)

---

## Out of scope / explicitly deferred

- **Backend `ai_score` NULL population issue.** All four audits note that `ai_score`/
  `ai_reasoning` are currently `NULL` for ~all jobs, which drives several of the P0 findings
  above (the "Pending AI review" messaging, the all-or-nothing banner, the disabled Min AI
  score filter). The UI-side fixes in this plan make the *current* null state communicate
  clearly to users, but do not address *why* scoring isn't populating `ai_score` — that is a
  backend/scoring-pipeline issue tracked separately.
- **Onboarding checklist / first-time-user flow** (product-ux-audit Recommendation 7) and
  **"scoring run" status table in Settings** (product-ux-audit Recommendation 10) — both are
  larger, net-new UI surfaces rather than fixes to existing screens; flagged as possible
  future work but not part of this incremental plan.
- **Nav order re-sequencing** (Dashboard-first vs. onboarding-order Resume→Roles→Dashboard→
  Settings) — a structural navigation change, not included here.
- **Backend repository query-pattern performance** (upsert overhead, anti-join filtering,
  indexes) — noted in performance-audit.md as a separate prior backend-focused review; not
  part of this UI-layer plan.
