# Review Process

Defines the audit, regression-review, merge-readiness, and architecture-drift-detection processes that govern every change made under `docs/agent-workflow.md` by the agents in `docs/agent-profiles.md`.

**Scope note:** every process below is a *review* process. Review agents (Architecture Review Agent always; Security/Performance Agents when operating in audit mode rather than fix mode) operate **read-only** against `src/**` and `supabase/**`. A review never modifies code — it produces or updates a file under `reports/`. Code fixes are separate work items carried out by the owning implementation agent and merged per `docs/agent-workflow.md`.

---

## 1. Audit Process

### 1.1 Audit categories and owners

Each of the eight existing audit categories has one owning agent (per `docs/agent-profiles.md`):

| Report | Owning agent |
|---|---|
| `reports/architecture-audit.md` | Architecture Review Agent |
| `reports/database-audit.md` | Database Agent |
| `reports/dependency-audit.md` | Architecture Review Agent (dependency rules are part of `docs/architecture.md` §5) |
| `reports/maintainability-audit.md` | Cleanup Agent (low-severity items) / owning feature agent (High items, e.g. Notification Agent for #1) |
| `reports/performance-audit.md` | Performance Agent |
| `reports/scraper-audit.md` | Pipeline Agent (orchestration findings) / Performance Agent (query-shape findings, e.g. #2) |
| `reports/security-audit.md` | Security Agent |
| `reports/cost-audit.md` | Performance Agent |

### 1.2 When audits run

- **On-demand**, when explicitly requested.
- **After any merge** that touches a category's "Allowed Files" (per `agent-profiles.md`) — the owning agent re-checks only the findings relevant to the changed files (see §2 Regression Review).
- **At phase boundaries** — Phase 1 exit and Phase 4 exit in `docs/agent-workflow.md` each trigger a **full** re-audit by Architecture Review Agent (and Security/Performance Agents in Phase 4).

### 1.3 Report format

All `reports/*-audit.md` files follow the existing format (do not introduce a new format):

```
# <Category> Audit

Scope: <what was reviewed, against what reference docs>

---

### N. <Finding title>

- **Severity:** Critical | High | Medium | Low
- **File:** <path:line>
- **Location:** <symbol/snippet>
- **Description:** <what's wrong>
- **Why it matters:** <impact>
- **Recommended fix:** <concrete fix>

---

## Summary of Compliant Areas (no action needed)

- <thing that was checked and is correct>
```

New findings are **appended** with the next sequential number. Findings are never silently deleted — once a finding is fixed, it gets a **Resolution** subsection (§2) rather than being removed, preserving the audit trail.

---

## 2. Regression Review Process

When an implementation agent fixes a specific finding (e.g. "fixes `security-audit.md` Finding #2"):

1. The fixing agent's PR description references the finding by report + number.
2. After merge, the **owning agent** of that report re-checks **only that finding** — not a full re-audit — and appends a `**Resolution:**` line directly under the original finding's `**Recommended fix:**`:

   ```
   - **Recommended fix:** Escape Telegram Markdown special characters ...

   - **Resolution:** Fixed in <commit/PR ref>, <date>. `formatMatchMessage.ts` now escapes
     `_*[]()~`>#+-=|{}.!` before interpolation; regression test added in
     `formatMatchMessage.test.ts`. Verified: re-ran the escaping check against the
     original failing input (`"Senior_Engineer"` title).
   ```

3. Full re-audits (re-checking *every* finding in a report, including previously-resolved ones, to catch regressions) happen **only** at phase boundaries (§1.2), not per-fix — this keeps regression review cheap and avoids audit churn mid-phase.
4. If a fix turns out to be incomplete or introduces a new issue, that's a **new finding** (next sequential number), not a reopening of the old one — the old finding keeps its Resolution note plus a cross-reference (`see also Finding #N+k`).

---

## 3. Merge Readiness Process

Before any PR merges, the following checklist must pass (maps directly to `CLAUDE.md` and `docs/architecture.md` §5):

1. **Tests pass** — `vitest` suite green, including any new tests the change requires.
2. **No forbidden patterns** — grep-clean for `any`/`<any>`/`as any`, no duplicated DTOs/types (reuse via `@/shared/domain/enums` or the relevant feature's `domain/types.ts`), no `prisma`/`drizzle`/`zustand`/`redux`/`react-query` introduced.
3. **Layering rules hold** (per `dependency-audit.md`'s verification method — exhaustive import grep):
   - `domain/` has zero outward dependencies.
   - `application/` depends only on `domain/` (+ injected interfaces).
   - `infrastructure/` implements `domain/` interfaces; only place Supabase/OpenRouter/Telegram/`pdfjs-dist` clients are imported.
   - `presentation` (`app/`, `actions.ts`, `scripts/*.ts`) is the sole composition root.
4. **Architecture changes have sign-off and docs.** If the change adds/removes a table, repository, feature boundary, or dependency: an **architect** sign-off exists (per `docs/agent-workflow.md` Escalation Rules), and `docs/architecture.md`/`docs/decisions.md`/`docs/database.md`/`docs/repositories.md` are updated in the **same PR** — `CLAUDE.md`: "Always update docs when architecture changes."
5. **Reviewer sign-off recorded.** No unresolved Critical/High finding from a **reviewer** pass. Medium/Low findings may be deferred with an explicit note.
6. **Report updated.** Either a new entry in the owning agent's `reports/<agent>/<date>-report.md`, or — for fixes to existing audit findings — a Resolution note per §2.

A PR failing any of 1–6 does not merge, regardless of which agent authored it.

---

## 4. Architecture Drift Detection

"Drift" = `docs/*` and `src/`/`supabase/*` disagreeing about either (a) what exists, or (b) why a decision was made.

### 4.1 Detection method

Architecture Review Agent reproduces the method already used in `reports/architecture-audit.md`:

- **Existence drift:** for each component described in `docs/architecture.md` §2–§3 (component diagram, data flows), confirm a corresponding file/module exists in `src/`/`scripts/`/`.github/`. (This method is exactly how `architecture-audit.md` Finding #1 — missing `scripts/*.ts` — was found.)
- **Naming/shape drift:** for each function/type/path named in `docs/*`, grep `src/` for that exact name; flag mismatches (this is how Findings #3, #4, #5, #6 in `architecture-audit.md` were found — e.g. `refineWithAI` vs. `scoreJob`, `features/<feature>/application/actions.ts` vs. `features/<feature>/actions.ts`).
- **Dependency-rule drift:** exhaustive import grep across `src/features/*/{domain,application,infrastructure}` and `src/app`, `src/components`, checking against `docs/architecture.md` §5's five ordered rules (this is `dependency-audit.md`'s method).
- **Decision drift:** for each ADR in `docs/decisions.md`, confirm the "Decision" still matches current code/config (e.g. AD-12's RLS policy shape, AD-09's RPC-based atomic swap).

### 4.2 Severity classification

| Severity | Meaning | Example | Action |
|---|---|---|---|
| **Low** | Doc wording/path/signature stale, no behavioral implication | `architecture-audit.md` #3–#6 | Owning doc-agent fixes in next pass; doesn't block other work. |
| **Medium/High** | Code diverges from an ADR's stated rationale (decision was made but not honored, or honored differently than documented) | e.g. if a future change made `score.ts` call AI for every job, contradicting AD-07 | Escalate per `docs/agent-workflow.md` Escalation Rules — `docs/decisions.md` must be updated *or* the code fixed, not left silently divergent. |
| **Critical** | A documented core capability is entirely unimplemented | `architecture-audit.md` #1 — `scripts/*.ts` and `.github/workflows/*` don't exist | Blocks "feature complete" status for the whole system. Either implement (Pipeline/Deployment Agents, per `agent-workflow.md`) or formally descope via a new/updated ADR — not both left ambiguous. |

### 4.3 Reporting

- Every drift-detection pass updates `reports/architecture-audit.md`, **even when no new drift is found** — record "No new drift detected as of <date>" explicitly, so the absence of findings is itself auditable.
- A Critical existence-drift finding (like #1) remains open — and continues blocking Phase 4 of `docs/agent-workflow.md` — until either resolved by Pipeline Agent's implementation or formally descoped via an ADR update that Architecture Review Agent records in `docs/decisions.md`.
