---
id: T009
title: 24h freshness boost in computeOverallScore and unnotified match ordering
status: pending
gate_level: 2
priority: high
agent: {role: backend, tier: sr, fallback: agent_default}
dependencies: [T002]
requirements: [REQ-F012]
---
# Objective
Add a `< 24h` freshness boost to scoring/ranking (`computeOverallScore` and `SupabaseNotificationRepository.findUnnotifiedMatches`) so postings published within the last 24 hours rank ahead of older listings when selecting the daily top 8 Telegram cards.

# Context
- `computeOverallScore.ts` currently computes `aiScore` + additive bonuses (`companyBonus`, `remoteBonus`, `sponsorshipBonus`, `salaryBonus`), clamped to `1`.
- `SupabaseNotificationRepository.findUnnotifiedMatches` currently queries `jobs` joined with `job_scores` (`ai_score >= threshold`) and does not include `posted_at` or `overall_score` in `JobMatch` or sort by freshness/overall score.

# Inputs
- `src/features/scoring/application/computeOverallScore.ts` & `computeOverallScore.test.ts`
- `src/features/scoring/domain/types.ts`
- `src/features/notifications/domain/types.ts`
- `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts`

# Scope
Included: Freshness boost in `computeOverallScore.ts` (`postedAt` within 24h of `now`), `postedAt` & `overallScore` fields on `JobMatch`, sorting unnotified matches by `overallScore` (or `aiScore` + `< 24h` boost) descending, and unit tests.
Excluded: Changing Telegram message formatting or sending logic (T010).

# Implementation guidance
1. Update `computeOverallScore` to accept `postedAt` (and optional `now` for deterministic testing, defaulting to `new Date()`) and apply a configurable `freshnessBonus` (e.g., `+0.06` when `postedAt` is `< 24h` old, adding `"posted <24h"` to `reasons`). Update `RankableJob` type and callers (`scoreJob.ts`, `rescore.ts` if any).
2. Add `postedAt: string | null` and `overallScore: number | null` to `JobMatch` (`notifications/domain/types.ts`) and select `posted_at` + `job_scores.overall_score` in `SupabaseNotificationRepository.findUnnotifiedMatches`.
3. Sort returned `JobMatch[]` by effective score (`overallScore ?? aiScore` + `< 24h` tiebreak/boost) descending so fresh Naukri/NaukriGulf jobs rank at the top of the 8-job daily queue.

# Expected outputs
- Updated `src/features/scoring/application/computeOverallScore.ts` & `.test.ts`
- Updated `src/features/notifications/domain/types.ts`
- Updated `src/features/notifications/infrastructure/SupabaseNotificationRepository.ts` & `.test.ts`

# Acceptance criteria
Blocking:
- [ ] AC-009-1: `computeOverallScore` applies the `< 24h` freshness boost when `postedAt` is within 24 hours and does not apply it when `postedAt` is older or `null`.
- [ ] AC-009-2: `findUnnotifiedMatches` populates `postedAt` and `overallScore` and orders matches so `< 24h` fresh jobs outrank equal-`aiScore` older jobs.
Quality:
- [ ] Uses injectable `now` parameter in `computeOverallScore` so tests have zero wall-clock flakiness.
Compatibility:
- [ ] Existing `scoreJob.test.ts` and `SupabaseNotificationRepository.test.ts` pass.

# Verification
- `npx vitest run src/features/scoring src/features/notifications`
- `npm run typecheck`

# Constraints
- Keep `overallScore` clamped to `[0, 1]`.

# Handoff
Return: status, summary, changed files, test results.

# Failure handling
- If `SupabaseNotificationRepository.test.ts` uses select-string assertions, update expected select columns cleanly.
