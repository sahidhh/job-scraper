# Theme 3 — Job Metadata

**Date:** 2026-07-04 (continuous-improvement session)
**Scope:** Deterministic extraction quality; investigate benefits, bonus, equity, stock options,
certifications, travel requirement, shift work, languages, domain classification, company size,
industry, startup detection, public/private company detection.

## Investigation Summary

A dedicated research pass (via a read-only exploration agent) confirmed: **all ten candidate fields have
zero existing groundwork** — no schema column, no extractor function, no partial implementation anywhere
in the codebase. This is a genuinely blank slate, unlike every other theme in this session where at least
partial infrastructure already existed.

The existing extraction pattern (`extractSalary.ts`, `extractContactEmail.ts`) is deliberately narrow and
disciplined: both are pure functions that require an explicit, unambiguous signal (a currency symbol/code,
an "hr@"/"recruiting@"-style local part) before accepting a match, specifically to avoid false positives.
`design/limitations.md` already documents the real, accepted false-negative tradeoffs that discipline
produces (formats that don't match return `null` rather than a wrong guess).

## Decision: Skip This Theme

None of the ten candidate fields were implemented. Evaluated against the session's decision framework
(Value / Complexity / Maintenance Cost / Risk):

| Field | Why it doesn't clear the bar |
|---|---|
| Company size, industry, startup vs. established, public/private | These are properties of the **company**, not the job posting text. A job description rarely states its own employer's headcount/industry/ownership structure in a reliably parseable way — any regex heuristic here would be a guess dressed up as a deterministic extraction, undermining the "deterministic, no AI, fail-safe-not-silently-wrong" standard this codebase has consistently held to (`docs/decisions.md` AD-20/AD-22). This is qualitatively different from salary/contact-email, where the posting itself is the authoritative source. |
| Certifications, travel requirement, shift work, languages | Regex-detectable in principle (e.g. "PMP", "travel up to 25%", "night shift", "fluent in Mandarin") with real signal words, similar in shape to the existing extractors. But no ranking, filtering, or notification feature in this session (or the existing product) consumes any of these — adding a column with nothing reading it would be a "half-finished implementation" per CLAUDE.md's explicit prohibition, and each one adds its own schema migration + `design/erd.md`/`design/use-cases.md`/`design/scope.md` update per the project's doc-maintenance rules. Four single-purpose fields' documentation and maintenance cost was judged disproportionate to a "nice to know, filters on nothing" payoff for a single-user tool. |
| Benefits, bonus, equity, stock options | The closest candidate to being worth it — genuinely useful signal for a job seeker, and keyword-detectable ("equity", "RSU", "stock options", "401k match", "unlimited PTO"). But a single combined flag risks being noisy (generic boilerplate mentions "equity" without it being a real offer for the role vs. a company-wide perks page copy-pasted into every posting), and — critically — nothing in this session's Theme 1 (ranking) or Theme 4 (filtering) work was scoped to consume it. Adding an unused signal now would again violate "no half-finished implementations" and pre-empt a ranking-weight decision that should be made together with the field, not before it. |

**Conclusion:** this theme has no worthwhile improvement that clears "high value, low/medium complexity,
low risk" once the "nothing consumes it yet" and "not reliably derivable from posting text alone" problems
are accounted for. Per the mission's explicit instruction ("If a phase has no worthwhile improvements,
explicitly document why and move on"), no code changes were made for this theme.

## If Revisited Later

The two most promising candidates, in priority order, if a future session pairs them with a consuming
feature:
1. **Benefits/equity/bonus keyword tags** — paired with a Theme-1-style ranking bonus (e.g. "+ equity
   mentioned") or a Theme-4-style filter ("show only jobs mentioning equity"), following the exact
   `extractSalary.ts` pattern (pure function, confidence tiers, colocated tests).
2. **Certifications/travel/shift/languages** — only if a specific, stated filtering or notification need
   for them emerges (e.g. "mute jobs requiring travel"), at which point they'd be added one at a time,
   each wired to its consuming feature in the same change, not speculatively ahead of it.

Company size / industry / startup / public-private detection from job-posting text alone is not
recommended at any point without a structured external data source (e.g. a company-directory API) — see
"Out-of-Scope" reasoning above; this is a data-availability problem, not a complexity one, and no such
external integration exists in scope (`design/scope.md` §4 lists the platform as intentionally
single-source-of-truth on job boards only).

## Files Changed

None (investigation-only; this report is the deliverable for this theme).
