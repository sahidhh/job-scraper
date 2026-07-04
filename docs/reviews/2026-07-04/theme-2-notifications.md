# Theme 2 — Notifications

**Date:** 2026-07-04 (continuous-improvement session)
**Scope:** Reduce notification noise, increase usefulness; implement only high-value, low/medium-complexity, low-risk items.

## Investigation Summary

`NotificationPreferences` (roles/skills/locations/experience/sources include-filters) and their
`filterMatches.ts` application logic were already fully built and tested — but had **zero UI**.
`setNotificationPreferencesAction`/`getNotificationPreferencesAction` existed in
`src/features/notifications/actions.ts` with no component anywhere calling them. This was the single
highest-value, lowest-complexity gap in the entire session: a complete, tested feature was unreachable by
the user it was built for.

Company mute and keyword mute did not exist at all (confirmed by repo-wide grep). "Why this job matched"
already exists in individual-notification mode (`aiReasoning` in `formatMatchMessage.ts`) but was
explicitly deferred for the digest formats in `docs/design/telegram-digest-mvp-design.md` ("orthogonal UX
enhancement") — that decision stands; not re-litigated here. Notification statistics beyond a flat recent-
sends log, snooze/reminders, and richer digest formatting were all evaluated and are documented as skipped
below with reasons distinct from "already decided elsewhere."

## Implemented

1. **Notification preferences settings UI** (`NotificationPreferencesCard.tsx`, wired into
   `/settings` → Notifications) — exposes every existing filter (roles/skills/locations/sources/min-max
   experience) as comma-separated/number inputs, calling the pre-existing server actions. No backend
   changes needed beyond validation (see below) — this was pure UI wiring to already-built, already-tested
   logic.
2. **Domain validation** (`validateNotificationPreferences`, `src/features/notifications/domain/
   validation.ts`, +7 tests) — rejects unknown locations/sources and inverted/negative experience bounds
   with a specific error message, so the new UI surfaces typos instead of silently no-op-ing.
3. **Company mute** (`NotificationPreferences.excludeCompanies`) — case-insensitive substring match against
   `companyName`; applied in `filterMatches.ts` (+2 tests). Deliberately **shared** with Theme 4's dashboard
   company-blacklist ask: the same setting also hides matching jobs from the dashboard job list
   (`JobFilters.excludeCompanies`, merged in `dashboard/page.tsx` from the same `app_settings` row) — one
   implementation serves both themes' "mute a company" requests, avoiding duplicated preference storage.
4. **Keyword mute** (`NotificationPreferences.excludeKeywords`) — case-insensitive substring match against
   `title`; applied in `filterMatches.ts` (+2 tests).

## Skipped (with rationale)

- **"Why this job?" in digest formats** — already evaluated and explicitly deferred in
  `docs/design/telegram-digest-mvp-design.md` as an "orthogonal UX enhancement"; not re-proposed.
- **Notification statistics (delivery rate, counts over time)** — `notifications_log` is
  `(id, job_id, sent_at)` only; a stats feature would need either a new aggregation table or scanning the
  log at read time. Given this is a single-user tool sending at most a few dozen notifications a day, the
  existing flat "recent sends" list (`NotificationsLogList.tsx`) already answers "did this get sent," and a
  dedicated stats dashboard for a low-volume personal channel was judged low value relative to its schema
  footprint.
- **Snooze/reminder support** — no existing groundwork (confirmed absent by grep). Snoozing implies
  re-surfacing a job later, which would need a new scheduled mechanism (a snooze-until timestamp plus
  something to check it) — a bigger, new piece of architecture for a "personal digest" tool whose entire
  premise is that the cron pipeline already re-evaluates on every run. Job statuses (Interested/Applied/
  Rejected/Archived) already give the user a workflow-based way to defer/dismiss a job; a parallel
  time-based snooze mechanism would duplicate that without a clear incremental benefit.
- **Cross-source/reposted-job dedup in notifications** — pre-existing, already-documented limitation
  (`docs/features/notifications.md`, `phase3-match-quality-review.md`); not re-investigated here since it's
  an ingestion-pipeline concern (fingerprinting), not a notification-formatting one, and reopening it was
  out of scope for this pass.
- **Richer digest formatting / verbosity levels** — the existing MVP digest (banded Strong Match / Worth
  Reviewing, top-5 with inline buttons) and legacy digest (grouped by band with a "New Companies" section)
  already cover the two ends of the verbosity spectrum documented in `docs/design/telegram-digest-mvp-
  design.md`; no gap was found that isn't either already shipped or already deferred by name.

## Files Changed

- `src/features/notifications/domain/types.ts` (+`excludeCompanies`/`excludeKeywords`), `validation.ts`
  (new function, +test file), `application/filterMatches.ts` (+test)
- `src/components/settings/NotificationPreferencesCard.tsx` (new)
- `src/app/(protected)/settings/page.tsx`, `src/app/(protected)/dashboard/page.tsx` (shared mute wiring)
- `src/features/jobs/domain/types.ts`, `src/features/jobs/infrastructure/SupabaseJobRepository.ts` (+test) —
  dashboard-side enforcement of `excludeCompanies`

## Testing

`npx tsc --noEmit`, `npx vitest run` (23 `filterMatches` tests including 4 new mute cases, 9 new
`validateNotificationPreferences` tests), `npm run build` — all pass.

## Impact

- **User experience**: a fully-built preference system is now actually usable — arguably the single
  biggest UX win in this session, since it required almost no new logic, only exposing what already
  existed.
- **Reduces maintenance**: no new storage mechanism — mutes reuse the exact `app_settings` JSON pattern
  already established for `notification_preferences`/`ranking_preferences`.

## Remaining Opportunities

- If usage reveals the need for per-job snooze, revisit with real usage data rather than speculatively
  building it now.
