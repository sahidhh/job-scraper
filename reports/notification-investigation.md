# Notification Pipeline Investigation

## Files inspected
- `scripts/notify.ts`
- `src/features/notifications/application/sendNotification.ts`
- `src/features/notifications/domain/NotificationRepository.ts`
- `src/features/notifications/domain/types.ts`
- `src/features/notifications/domain/validation.ts`
- `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts`
- `src/features/notifications/infrastructure/TelegramBotSender.ts`
- `src/shared/domain/validation.ts`, `src/shared/infrastructure/env.ts`
- `supabase/migrations/20260612000002_tables.sql` (jobs / job_scores / notifications_log / role_selections)
- `docs/decisions.md` (AD-08), `docs/scoring.md` §4
- `scripts/score.ts` (only to confirm `role_selection_id` scoping, per task scope)

---

## 1. Exact notification selection query

`SupabaseNotificationRepository.findUnnotifiedMatches(roleSelectionId, threshold)`:

```sql
select id, title, company_name, location_tags, source, url,
       job_scores!inner(ai_score, ai_reasoning),
       notifications_log(id)
from jobs
where job_scores.role_selection_id = :roleSelectionId
  and job_scores.ai_score >= :threshold
```
then **client-side**: `.filter(row => row.notifications_log.length === 0)`.

So a job qualifies iff:
1. it has a `job_scores` row for the **active** `role_selection_id` (inner join — jobs without a score row are excluded entirely),
2. that row's `ai_score >= NOTIFY_THRESHOLD` (`ai_score IS NULL` never qualifies — null comparison is false), **and**
3. it has **zero** rows in `notifications_log`.

---

## 2. Scope: all qualifying jobs, newly-scored, or non-notified-only?

**Non-notified-only**, evaluated over the **entire** `job_scores` set for the active role selection — not just newly-scored rows.

- H1 (newly-scored only) — **FALSE**. No `scored_at` / recency filter anywhere in the query.
- H2 (excludes already-scored records) — **FALSE**. `job_scores!inner` *requires* a score row; it doesn't exclude scored jobs, it requires them.
- The only exclusion is condition 3: presence in `notifications_log`.

---

## 3. Would lowering `NOTIFY_THRESHOLD` to 0.2 produce notifications?

- H4 (scale mismatch) — **FALSE**. `job_scores.ai_score` is `numeric(5,4)` constrained to `[0,1]`, `assertUnitInterval` enforces `NOTIFY_THRESHOLD ∈ [0,1]`, and the dashboard's 75/66/50/43/42/40% are the same `0.75…0.40` values ×100 for display. `0.2 <= 0.40` for all 6 rows, so on scale alone all 6 should pass condition 2.
- `[score] scoring 0 unscored job(s)` proves `job_scores` rows for these 6 jobs **already existed before this run**, scoped to the **currently active** `role_selection_id` (`findUnscored(roleSelection.id, …)` in `scripts/score.ts` — same id `notify.ts` queries with). So role-selection mismatch is not the issue either.
- Therefore: lowering the threshold *should* surface all 6 rows **unless they are already present in `notifications_log`**.

---

## 4. Can existing scored jobs ever be re-notified?

**No — never, by design (AD-08).**

```sql
create table notifications_log (
  id      uuid primary key default gen_random_uuid(),
  job_id  uuid not null references jobs(id) on delete cascade,
  sent_at timestamptz not null default now(),
  constraint notifications_log_job_id_uq unique (job_id)
);
```

- Keyed by `job_id` **only** — no `role_selection_id`.
- `markNotified(jobId)` is a permanent, role-selection-agnostic "spent" mark.
- `decisions.md` AD-08 explicitly states this is intentional: *"A job is notified at most once, ever"* and rejects re-notification on score change/threshold change as "a case that doesn't arise."
- Consequence: once a `job_id` lands in `notifications_log` — for **any** reason, at **any** past threshold — `findUnnotifiedMatches` excludes it forever, regardless of future `NOTIFY_THRESHOLD` changes, re-scoring, or role-selection changes.

---

## 5. Does notification history block re-sending? — ROOT CAUSE

**YES. This is the root cause of `[notify] sent 0 notification(s)`.**

Sequence consistent with all observed evidence:
1. `job_scores` for these 6 jobs were created in an **earlier** cron run (proven by `scoring 0 unscored job(s)` in the current run).
2. That earlier run's `notify.ts` ran with the **default** `NOTIFY_THRESHOLD=0.75` (the GitHub Actions variable was only set to `0.2` afterward — `optionalEnv` falls back to `"0.75"` when the var is unset/empty).
3. At `>= 0.75`, only the job scoring exactly `0.75` qualified, was sent (or attempted), and `markNotified` wrote a permanent `notifications_log` row for it.
4. `NOTIFY_THRESHOLD` was then lowered to `0.2` to surface the other 5 jobs (0.66 → 0.40).
5. On the next run, `findUnnotifiedMatches` re-evaluates **all 6** rows against `>= 0.2` — all 6 pass condition 2 — but condition 3 (`notifications_log.length === 0`) is the gate that determines the final `sent` count.

**Confidence: Medium-High.**
- The architectural finding in §4 (permanent, threshold-independent idempotency via `unique(job_id)`, no `role_selection_id`) is **High confidence** — directly from schema + AD-08, and it is the only mechanism in this codebase that can make a row with `ai_score >= threshold` produce zero sends.
- The exact count of currently-blocked jobs (1 vs. all 6) is **not verifiable from code alone** — it depends on `notifications_log` row contents, which Phase 1 scope excludes querying. If **all 6** are already in `notifications_log` (e.g. from earlier ad-hoc/manual testing of the Telegram path during this session's notification-UI work), `sent 0` is explained directly. If only the `0.75` job is logged, the current run's `sent` count should be `5`, not `0` — in that case `sent 0` would mean the run that produced this log line still used the old default `0.75` threshold (i.e. the GH Actions variable change hadn't taken effect for that run yet).
- **One query would resolve this**: `select job_id, sent_at from notifications_log` — row count of 1 vs 6 distinguishes the two scenarios. This is outside the file-only scope given for Phase 1.

---

## Summary table

| Hypothesis | Verdict |
|---|---|
| H1 — only newly-scored jobs evaluated | False — whole `job_scores` set for active role selection is evaluated every run |
| H2 — already-scored records excluded | False — `job_scores!inner` requires a score row, doesn't exclude it |
| H3 — notification history blocks re-sending | **True — root cause** (`notifications_log` is a permanent, role-selection-agnostic "sent once ever" ledger per AD-08) |
| H4 — threshold scale mismatch | False — both `ai_score` and `NOTIFY_THRESHOLD` are `[0,1]`, dashboard % is just ×100 display |
| H5 — Telegram send path never reached | True as a *symptom* — query returns 0 candidates, so `TelegramBotSender.sendMessage` is never called for any of the 6 |

---

# Phase 2 — Minimal Implementation Plan

Two independent fixes, not mutually exclusive. **No refactor of architecture; `findUnnotifiedMatches`/`sendNotification`/AD-08's "once per job" intent stays intact** unless option B is chosen.

### Option A — Data fix only (zero code change)
If the 6 jobs are stuck purely because of stale `notifications_log` rows written during prior testing (not real Telegram sends the user wants to keep):
- `delete from notifications_log where job_id in (<the 6 job ids>)`
- Re-run `scripts/notify.ts` with `NOTIFY_THRESHOLD=0.2` — `findUnnotifiedMatches` will now return all 6 and send them.
- Risk: if the `0.75` job's earlier send *did* succeed but the user missed it, this re-sends that one message. Acceptable one-time duplicate given AD-08's "at most once" intent was never meant to survive manual log tampering during dev.

### Option B — Scope idempotency to `role_selection_id` (schema + 3 call sites)
Only needed if the actual requirement is "a job can be re-notified when it becomes relevant to a *new* role selection" (current schema permanently forbids this, per AD-08 §"Consequences"). Smallest version:
1. **Migration**: add `role_selection_id uuid not null references role_selections(id) on delete cascade` to `notifications_log`; change `unique(job_id)` → `unique(job_id, role_selection_id)`.
2. **`NotificationRepository.markNotified`**: add `roleSelectionId` param.
3. **`SupabaseNotificationRepository.markNotified`**: include `role_selection_id` in the upsert; update `onConflict` to `"job_id,role_selection_id"`.
4. **`findUnnotifiedMatches`**: change the `notifications_log(id)` embed to filter on `role_selection_id` too (`notifications_log(id).eq(role_selection_id, ...)` or equivalent embedded filter), so a job notified under an old role selection is eligible again under a new one.
5. **`sendNotification.ts`**: pass `roleSelectionId` through to `markNotified`.

This does **not** fix the immediate `sent 0` (the active role selection is the same one already logged) — it only prevents *future* permanent lockouts across role changes. Combine with Option A to unblock the current 6 jobs.

### Recommendation
Run the one diagnostic query (`select job_id, sent_at from notifications_log`) to confirm scope, then apply **Option A** to unblock the 6 jobs now. Treat **Option B** as a separate, deliberate decision (it touches AD-08, which was an explicit, reasoned tradeoff) — not bundled into this fix.
