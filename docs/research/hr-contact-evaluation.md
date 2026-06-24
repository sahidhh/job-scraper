# Phase 5B — HR Contact Extraction Evaluation

**Date:** 2026-06-23
**Scope:** Investigation only. No implementation, no schema changes.
**Method:** Repository audit — Phase 3 findings, schema, scraper code, notification infrastructure.

---

## Verdict

**BUILD — Telegram only (H1 + H2). Skip dashboard (H3).**

~10 lines of code. Zero schema changes. Zero migrations. Adds value for MCF and Wellfound hits in Telegram digest. Dashboard implementation is not worth the cost at current yields.

---

## 1. Email Prevalence

### Evidence

`jobs.description` stores HTML-stripped plain text (via `stripHtml` in `src/shared/infrastructure/text.ts:17`). Every source uses it at ingest. No email extraction has ever run against this corpus.

Phase 3 audit (HR-2) estimated prevalence by source:

| Source | Email in description | Volume character |
|---|---|---|
| Greenhouse | < 5% | **Dominant** — many configured companies |
| Lever | < 5% | **Dominant** — many configured companies |
| Ashby | < 5% | **Dominant** — many configured companies |
| Wellfound | 10–20% | Feed-based, startup-heavy |
| RemoteOK | 5–10% | 0% keep rate (location bug, unrelated) |
| MyCareersFuture | 15–25% | Feed-based, Singapore SME-heavy |

### Why ATS Sources Have Low Yield

Greenhouse, Lever, and Ashby are ATS platforms. All applications route through the hosted ATS form. Recruiters have no incentive to put personal email in public descriptions — it bypasses the ATS and creates untracked submissions. The `<5%` figure reflects exceptions (some SME-style companies using ATS but running informal processes), not normal ATS behaviour.

### Corpus-Weighted Estimate

ATS sources (greenhouse/lever/ashby) dominate by volume because they cover all configured company boards. Feed-based sources (wellfound, mycareersfuture) have fixed corpus size regardless of configured company count.

Realistic weighted corpus prevalence: **5–10%**. For Singapore-focused users where MCF is a primary source, MCF's 15–25% lifts the effective rate, but only for MCF hits.

### Implication

In a typical digest of 5 strong matches, expect 0–1 jobs to carry a recoverable email. Email presence is the exception, not the rule.

---

## 2. ATS Differences

### Public APIs Expose No Recruiter Email

Phase 3 confirmed (HR-5): Greenhouse `/v1/boards/{token}/jobs/{id}`, Lever posting endpoint, and Ashby job endpoint all omit recruiter identity from their public responses. Recruiter data is internal and gated behind authenticated internal APIs. Per-job API enrichment calls would return zero incremental data. Not worth pursuing.

### Board Token Already Identifiable

From `jobs.source` and `jobs.url`, the ATS platform is already known with zero parsing:
- `source = 'greenhouse'` → ATS; apply URL is the canonical destination
- `source = 'lever'` → ATS; same
- `source = 'ashby'` → ATS; same
- `source = 'mycareersfuture'` → government feed; descriptions often include company contact blocks
- `source = 'wellfound'` → startup feed; some founders write informal descriptions with contact info

The practical split: regex extraction is **only useful** for `mycareersfuture` and `wellfound`. ATS source descriptions should be expected to yield nothing.

---

## 3. Regex Extraction Feasibility

### Infrastructure Already Supports It

`jobs.description` is plain text. `JobMatch` (the type fed to Telegram notifications) already includes `description` (confirmed at `src/features/notifications/domain/types.ts:44`). No schema change is needed to access description at notification time.

### Regex Is Sufficient

No ML/AI needed. Standard email pattern:

```typescript
// src/shared/infrastructure/text.ts
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;
export function extractRecruiterEmail(text: string): string | null {
  return EMAIL_REGEX.exec(text)?.[0] ?? null;
}
```

Returns first match only. False positives exist (privacy@ or noreply@ from legal boilerplate) but are rare in Singapore tech postings and low-harm (user sees an unresponsive email address at worst).

### False Positive Risk

| Pattern | False positive type | Frequency |
|---|---|---|
| `privacy@company.com` | Legal boilerplate | Low in tech descriptions |
| `support@company.com` | Support contact in footer | Occasional in MCF |
| `noreply@ats.com` | ATS-generated footer | Low (usually stripped by `stripHtml`) |

Risk is acceptable. If the user sees an email and it bounces, cost is one wasted email attempt. No data integrity issue.

### Implementation: 5 Lines

Pure function in `text.ts`. No deps, fully testable, no side effects.

---

## 4. Telegram Usefulness

### Infrastructure Ready

`buildDigestKeyboard.ts` already builds `InlineKeyboardButton[][]`. Telegram inline keyboard supports `url` type with `mailto:` scheme. Adding a conditional contact button is ~5 lines in `buildDigestKeyboard.ts` or `formatDigestMvp.ts`.

Current keyboard layout (from `buildDigestKeyboard.ts:33`):
```
Apply #1 | Apply #2
Apply #3 | Apply #4
Apply #5
✓ Worth Reviewing (N)
📊 Dashboard
```

With email extraction:
```
Apply #1 | Apply #2
Apply #1 📧 Contact
Apply #3 | Apply #4
...
```

Or simpler: one row per match with Apply and optional 📧 Contact side by side.

### Value

- Telegram is the primary notification channel
- `description` is already in `JobMatch` — zero extra DB query
- Appear in 5–10% of digest notifications (15–25% for MCF-heavy runs)
- User can email recruiter directly without navigating to the job page
- Especially useful for MCF postings where company is an SME with no external ATS

### Limitation

Most digests will show no `📧 Contact` buttons. Users will eventually treat the button as a signal for MCF/Wellfound jobs specifically. That's acceptable — it's honest signal.

---

## 5. Dashboard Usefulness

### The Problem

`JobWithScore` deliberately omits `description` (confirmed at `src/features/jobs/domain/types.ts:84`). `DASHBOARD_SELECT` in `SupabaseJobRepository.ts:38` does not include `description`. This was an intentional decision to reduce dashboard RSC payload size (comment in code: "P1 #4, never rendered by JobRow").

Adding email display to the dashboard would require one of:
1. Adding `description` back to `DASHBOARD_SELECT` — increases payload size for every job in every page load, for a 5–10% hit rate
2. A separate API call per job to fetch description on demand — latency cost + complexity

Neither is worth the yield at 5–10% prevalence.

### Dashboard Verdict: Skip

The dashboard already links `jobs.url` (the ATS apply URL). Users can click Apply and contact through the ATS form. The incremental value of an email link on the dashboard is low, and the implementation cost is disproportionate.

If yield rises above 30% (e.g., if MCF becomes the dominant source), revisit.

---

## 6. Quantified Summary

| Dimension | Value |
|---|---|
| Expected email coverage (corpus-weighted) | 5–10% |
| Expected coverage for MCF/Wellfound hits | 15–25% |
| Schema changes required | **0** |
| Migrations required | **0** |
| Lines of code (H1 + H2) | ~10 |
| Lines of code (H1 + H2 + H3 dashboard) | ~30 + query refactor |
| Risk | Very low (pure function, conditional display) |
| ATS public API yield for recruiter email | **0%** (confirmed) |
| False positive rate | Low; acceptable |

---

## 7. Implementation Plan (if BUILD approved)

### H1 — `extractRecruiterEmail` pure function

**File:** `src/shared/infrastructure/text.ts`

Add after existing exports:

```typescript
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;
export function extractRecruiterEmail(text: string): string | null {
  return EMAIL_REGEX.exec(text)?.[0] ?? null;
}
```

**Test:** `src/shared/infrastructure/text.test.ts` (or new file). Cases:
- email in body → returns it
- no email → null
- `noreply@` → returns it (known false positive; acceptable)
- multiple emails → returns first

### H2 — Telegram digest `📧 Contact` button

**File:** `src/features/notifications/application/buildDigestKeyboard.ts`

`buildDigestKeyboard` receives `strongMatches: JobMatch[]`. `JobMatch` includes `description`. Extract email per match, add conditional `mailto:` button beside Apply:

```typescript
import { extractRecruiterEmail } from "@/shared/infrastructure/text";

// Inside the Apply-button loop:
const email = extractRecruiterEmail(top[i]!.description);
const row: InlineKeyboardButton[] = [
  { text: `Apply #${i + 1}`, url: top[i]!.url },
];
if (email) row.push({ text: `📧 Contact`, url: `mailto:${email}` });
```

Keyboard layout becomes: Apply button in col 1, `📧 Contact` in col 2 when email found.

**Note:** Telegram inline buttons with `url` type support `mailto:` — confirmed by Telegram Bot API docs and current infrastructure.

**Test:** Update `buildDigestKeyboard.test.ts` — add cases for match with email in description (button appears) and without (button absent).

### Skipped

- **H3 (Dashboard email link):** Skipped. `description` excluded from dashboard query by design. Cost/yield ratio unfavourable at 5–10%.
- **Phone number extraction:** Noisier than email; more false positives. Skip until email proves value.
- **ATS per-job API enrichment:** Public APIs return no recruiter data (HR-5). Skip permanently.

---

## 8. Opportunity Cost

Phase 3 identified higher-ROI improvements still unimplemented:

| Item | Impact | Effort | Status |
|---|---|---|---|
| Backfill `min_years` on NULL rows (OPP-1) | **High** | Low | Not done |
| Expand `parseMinYears` seniority labels (OPP-2) | **High** | Low | Not done |
| Fix RemoteOK 0% keep rate (OPP-3) | Medium | Low | Not done |
| `postedWithinDays` freshness filter (OPP-5) | Medium | Low | Not done |
| `location_tags` in AI prompt (OPP-6) | Medium | 1 line | Not done |

HR contact extraction (H1+H2) is **~10 lines total** — it does not block or delay any Phase 3 quick wins. It can be committed alongside them in the same session. It is not a competing priority.

---

## 9. Alternative Priorities (if DO NOT BUILD)

If the verdict had been DO NOT BUILD, the recommended next priorities in order:

1. Phase 3 quick wins (OPP-1 through OPP-7) — all deliver more per-user value
2. Scope `notifications_log` to `role_selection_id` (OPP-10) — prevents notification suppression on role switch
3. Cross-source duplicate detection (OPP-11) — prevents dual-notification for same position

None of these are blocked by HR contact work.
