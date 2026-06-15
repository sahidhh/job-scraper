# Notification Pipeline — Fix Analysis (Phase 2) & Bug Classification (Phase 4)

Builds on `notification-validation-report.md`. Live evidence: `notifications_log` = 0 rows; all 18 `job_scores` rows for the active role selection have `ai_score = NULL`.

---

## Phase 2 — Option Evaluation

### OPTION A — Data-only fix (delete `notifications_log` rows, re-run notify)

- **Applicability today:** None. `notifications_log` already has **0 rows** — there is nothing to delete. Running this "fix" is a no-op; `findUnnotifiedMatches` would still return `[]` because the blocker is `job_scores!inner ... ai_score >= threshold`, evaluated *before* the `notifications_log` filter ever matters.
- **Complexity:** Trivial (single `DELETE`).
- **Risk:** Low, but zero benefit here — risk/reward is moot since it doesn't touch the actual failure point.
- **Architectural impact:** None — pure data operation, no schema/code change.
- **AD-08 alignment:** N/A — AD-08 governs `notifications_log` semantics, which aren't implicated in today's failure.

### OPTION B — Schema change (`unique(job_id)` → `unique(job_id, role_selection_id)`)

- **Applicability today:** None. This changes how `notifications_log` scopes "already notified" across role selections. It does not touch `job_scores.ai_score`, which is the actual blocker. Even with this change, `job_scores!inner ... ai_score >= threshold` still matches 0 rows for all 18 jobs.
- **Complexity:** Moderate — new migration, FK column, updated unique constraint, `markNotified(jobId, roleSelectionId)` signature change, updated embed filter in `findUnnotifiedMatches`, updated `sendNotification` call site (4 files + 1 migration, per prior plan).
- **Risk:** Low-medium — touches a core idempotency guarantee (AD-08). Needs care that the unique constraint change doesn't allow duplicate sends for the *same* job+role combo across retries.
- **Architectural impact:** Changes a deliberate, documented design decision (AD-08 "at most once, ever" → "at most once per job per role selection"). Per `decisions.md`, this exact alternative ("allow re-notification if score improves on a later run") was **considered and explicitly rejected** as "a case that doesn't arise."
- **AD-08 alignment:** Directly reverses part of AD-08. Should not be done incidentally as a side-effect of fixing an unrelated bug — it's a deliberate architecture decision requiring its own sign-off, exactly as the original investigation flagged.

---

## Phase 2 — Answers

1. **Which option solves today's issue?** — **Neither.** Today's `[notify] sent 0]` is caused by `ai_score IS NULL` on all 18 `job_scores` rows (see validation report Q6), not by `notifications_log` state. Both options operate on `notifications_log`, which is already empty and was never the blocker.
2. **Which option solves future role-selection issues?** — **Option B**, in principle — it would let a job be re-notified under a *new* role selection even if it was logged under an old one. But this is a **hypothetical future scenario**: `notifications_log` is currently empty, so no job has ever been "locked out." There is no live evidence this problem has occurred or will occur soon.
3. **Which option should be implemented now?** — **Neither.** No change to `notifications_log`, its schema, or the notification code is warranted by current evidence. The real next step is outside this investigation's scope: determine why `ai_score` is null for all 18 `job_scores` rows (3 of which have `keyword_score >= 0.5` and per `scoring.md`'s cost-bound rule should have triggered an AI call). That is a **scoring-pipeline** question (`scoreJob` / `OpenRouterAiScoreProvider` / `OPENROUTER_*` config) — separate investigation.
4. **Which option should be deferred?** — **Both.** Option A is currently a no-op (nothing to delete). Option B is a deliberate AD-08 reversal that should only be undertaken if/when a real cross-role-selection re-notification need is observed — premature now.

---

## Phase 4 — Bug Classification

**Does the notification pipeline itself contain a bug?**

**NOT A BUG — EXPECTED BEHAVIOR.**

`scoring.md` §4 states explicitly: *"The query condition `ai_score >= $threshold` naturally excludes rows where `ai_score is null`... only jobs that passed both stages can ever be notified."* `decisions.md` AD-08: *"`ai_score is null` never qualifies, regardless of `keyword_score`."*

Live data shows exactly this: 18/18 `job_scores` rows have `ai_score = NULL`, `findUnnotifiedMatches` correctly returns `[]`, `sendNotification` correctly sends 0 messages, `notifications_log` correctly remains untouched. **`notify.ts`, `sendNotification`, and `SupabaseNotificationRepository` are all behaving exactly as documented and designed.** No code change to the notification feature is recommended.

The user-visible symptom ("0 notifications despite dashboard showing 40-75% matches") is explained by:
1. The dashboard displaying `keyword_score` (stage 1) as the match percentage, which the user reasonably read as "AI score."
2. `ai_score` (stage 2, the actual notification gate) being null for every job — a **scoring pipeline** state, not a notification pipeline defect.

**Recommendation:** Close this notification-pipeline investigation as **expected behavior, working as designed**. Open a separate, scoped investigation into why stage-2 AI scoring (`scoreJob`/`OpenRouterAiScoreProvider`) is producing `ai_score = NULL` for jobs that qualify for it (`keyword_score >= KEYWORD_THRESHOLD`).
