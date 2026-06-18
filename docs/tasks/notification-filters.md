# Notification Filters — Phase 1

## Problem

Any job scoring above `NOTIFY_THRESHOLD` generates a Telegram notification.
Users need finer control: only notify for specific roles, skills, locations,
experience levels, or job sources. Without filters, high-volume scrapers can
flood the notification channel with irrelevant jobs even when the AI score
is high.

---

## Existing Notification Flow (before this change)

```
scripts/notify.ts
  └─ sendNotification(roleSelectionId, { notificationRepository, telegramSender, notifyThreshold })
       └─ notificationRepository.findUnnotifiedMatches(roleSelectionId, threshold)
            SQL: jobs
              INNER JOIN job_scores  (role_selection_id = active, ai_score >= threshold)
              LEFT JOIN notifications_log WHERE job_id IS NULL
            → JobMatch[]
       └─ for each match:
            formatMatchMessage(match)  →  Telegram text
            telegramSender.sendMessage(text)
            notificationRepository.markNotified(match.jobId)
```

---

## New Notification Flow (after this change)

```
scripts/notify.ts
  └─ preferencesRepository.getPreferences()  →  NotificationPreferences | null
  └─ sendNotification(roleSelectionId, { ..., preferences })
       └─ notificationRepository.findUnnotifiedMatches(roleSelectionId, threshold)
            SQL: same query + description, min_years columns added
            → JobMatch[]  (now includes description, minYears)
       └─ if preferences: filterMatches(rawMatches, preferences)  →  filtered JobMatch[]
       └─ for each match (filtered):
            formatMatchMessage(match)
            telegramSender.sendMessage(text)
            notificationRepository.markNotified(match.jobId)
```

The filter runs **after** candidate selection and **before** Telegram delivery.
Jobs filtered out are NOT marked as notified, so they can still appear on the
dashboard and will be re-evaluated on future notify runs (in case preferences
change).

---

## Design Decisions

### 1. Filter point: application layer, not SQL

Filtering in `sendNotification` rather than in the SQL query keeps the change
minimal and leaves `findUnnotifiedMatches` unchanged in semantics. The trade-off
is that all candidates are fetched from the DB and then filtered in memory; at
typical volumes (tens of jobs per run) this is negligible.

### 2. Backwards compatible defaults

`preferences` is optional in `SendNotificationDeps`. When absent or `null`, all
matches pass through unchanged — existing behaviour is preserved exactly.
`getPreferences()` returns `null` when no row exists in `app_settings`, which
also leaves behaviour unchanged.

### 3. Storage: app_settings key/value table

Preferences are stored as a JSON blob under key `notification_preferences` in
the existing `app_settings` table. No new migration is required. This is the
same pattern used by `desired_experience_years`.

### 4. Include-only filters (no exclusion rules)

All filters are include lists: a job passes only if it matches at least one
entry in each specified filter. Empty or absent filter fields are skipped
("no filter" semantics). This keeps the logic simple with no rule engine, and
future expansion can add more filter types without architectural change.

### 5. Skill resolution via dictionary

User-supplied skill names (e.g., `"ASP.NET"`) are resolved to their canonical
form in `SKILLS_DICTIONARY` (→ `".NET"`) before comparison with skills
extracted from the job description. This means aliases like `"asp.net"`,
`"dotnet"`, or `".net"` all match the same canonical entry.

### 6. null minYears always passes

If a job did not specify experience requirements (`min_years IS NULL`), it
passes the experience filter regardless of `minExperience`/`maxExperience`.
This avoids silently dropping jobs that simply don't state a level.

### 7. Filtered jobs are NOT marked as notified

A filtered-out job remains in the `unnotified` pool. If the user later widens
or removes preferences, those jobs will be re-evaluated and notified. This is
the correct behaviour: filtering is a delivery gate, not a permanent skip.

---

## Files Changed

| File | Change |
|------|--------|
| `src/features/notifications/domain/types.ts` | Added `description`, `minYears` to `JobMatch`; added `NotificationPreferences` type |
| `src/features/notifications/domain/NotificationPreferencesRepository.ts` | **New** — repository interface |
| `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` | Added `description`, `min_years` to SELECT and row mapping |
| `src/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository.ts` | **New** — reads/writes preferences from `app_settings` |
| `src/features/notifications/application/filterMatches.ts` | **New** — pure filter function |
| `src/features/notifications/application/filterMatches.test.ts` | **New** — filter tests |
| `src/features/notifications/application/sendNotification.ts` | Wired in `filterMatches`; added `preferences` to deps |
| `src/features/notifications/application/sendNotification.test.ts` | Updated `makeMatch`; added filter coverage tests |
| `src/features/notifications/application/formatMatchMessage.test.ts` | Updated `makeMatch` for new `JobMatch` fields |
| `src/features/notifications/infrastructure/SupabaseNotificationRepository.test.ts` | Updated mock data and expected results |
| `src/features/notifications/actions.ts` | **New** — server actions for get/set preferences |
| `scripts/notify.ts` | Loads preferences and passes to `sendNotification` |

---

## DB Changes

**None.** Preferences are stored in the existing `app_settings` key/value table
as a JSON blob. The `findUnnotifiedMatches` query now selects two additional
columns (`description`, `min_years`) from the `jobs` table — these columns
already exist (added in `20260616000002_experience.sql`).

---

## Setting Preferences

Use the server actions exported from `src/features/notifications/actions.ts`:

```typescript
// Read
const result = await getNotificationPreferencesAction();
// result.ok === true → result.data: NotificationPreferences | null

// Write
await setNotificationPreferencesAction({
  roles: ["Backend Engineer"],
  skills: ["ASP.NET", "C#"],
  locations: ["remote"],
  minExperience: 2,
  maxExperience: 5,
});

// Clear (revert to notify-all)
await setNotificationPreferencesAction(null);
```

Or directly via `SupabaseNotificationPreferencesRepository` in cron scripts.

---

## Example Preferences

```json
{
  "roles": ["Backend Engineer"],
  "skills": ["ASP.NET"],
  "locations": ["remote"],
  "minExperience": 2,
  "maxExperience": 5,
  "sources": ["greenhouse", "lever"]
}
```

A job must pass **all** specified filters (AND logic). Within each filter,
matching **any one** entry is sufficient (OR logic).

---

## Testing

```
node_modules/.bin/vitest run src/features/notifications
```

Coverage:
- `filterMatches.test.ts` — 12 cases: empty prefs, each filter type individually, combined AND logic
- `sendNotification.test.ts` — 2 new cases: filter applied, null preferences passes all
- `formatMatchMessage.test.ts` — updated to include new `JobMatch` fields (no behaviour change)
- `SupabaseNotificationRepository.test.ts` — updated mock rows and expected output

Pre-existing `bucketScores` test failures are unrelated to this change.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Preferences misconfigured → zero notifications | Low-medium | Preferences are opt-in; absent row means notify-all. Users must explicitly set preferences. |
| Skill name not in dictionary → always filtered out | Low | `resolveSkillToCanonical` falls back to the supplied string if not found; test coverage verifies alias resolution. |
| Filtered jobs never notified if preferences persist | Intended | Filtering is a delivery gate; filtered jobs stay un-notified and re-evaluate on each run. |
| `description` large → memory pressure | Very low | Job descriptions are short strings; filtering happens in memory at low volume. |

---

## Rollback Plan

1. Revert `scripts/notify.ts` to remove `preferencesRepository` and the `preferences` field passed to `sendNotification`.
2. The `preferences` field in `SendNotificationDeps` is optional — reverting the script alone restores previous behaviour without touching any other file.
3. The `app_settings` row (if created) is harmless; no migration rollback needed.
