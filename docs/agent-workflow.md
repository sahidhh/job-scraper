# Agent Workflow

Defines how the eight agent profiles in `docs/agent-profiles.md` execute against the current backlog (`reports/*-audit.md`), in what order their output merges, how file conflicts are resolved, when work escalates beyond the agent layer, and what triggers a re-review.

This workflow is itself subject to `docs/review-process.md`'s merge-readiness checklist and `CLAUDE.md`'s approval rules.

## Phase Overview

| Phase | Theme | Can start when |
|---|---|---|
| Phase 1 | Foundation fixes — isolated, non-overlapping files | Immediately |
| Phase 2 | Cross-cutting fixes — depend on Phase 1 contracts | Phase 1's relevant items merged |
| Phase 3 | Pipeline build — depends on Phase 1/2 data-access contracts | Phase 1 (Database Agent) + Phase 2 (Performance Agent) merged |
| Phase 4 | Integration, re-audit, cost validation, go-live | Phase 3 merged |

---

## Phase 1 — Foundation Fixes (parallel)

These agents touch disjoint file sets (per `agent-profiles.md` "Allowed Files") and can run **in parallel**:

| Agent | Work item(s) |
|---|---|
| **Architecture Review Agent** | Baseline re-audit (read-only) — establishes the "current state" snapshot the other Phase 1 agents' reports will diff against. |
| **Database Agent** | `database-audit.md` #1 (RPC return-type fix), #2/#3 doc-drift (`docs/database.md`, `docs/repositories.md`), `architecture-audit.md` #5/#6. |
| **Security Agent** | `security-audit.md` #1 (resume upload path). |
| **Notification Agent** | `maintainability-audit.md` #1 + `security-audit.md` #2 (error isolation + Markdown escaping) — isolated to `src/features/notifications/**`. |
| **Cleanup Agent** | `maintainability-audit.md` #2 (`RoleSelectorForm`), `dependency-audit.md` #1 (`ThresholdsCard`), `architecture-audit.md` #3/#4 doc-drift. Dead-code items (#3–#5) **deferred** — see Phase 4. |

**Parallel execution strategy:** Phase 1 agents are assigned by the file-ownership table in `agent-profiles.md`. No two Phase 1 agents share an "Allowed Files" entry, so they may be dispatched simultaneously without lock coordination. The only shared artifact is `docs/decisions.md`, which only Architecture Review Agent writes — other agents *propose* ADR changes but don't edit it directly.

**Exit criteria:** all Phase 1 PRs merged; Architecture Review Agent's baseline audit recorded in `reports/architecture-audit.md`.

---

## Phase 2 — Cross-Cutting Fixes

| Agent | Work item(s) | Depends on |
|---|---|---|
| **Performance Agent** | `performance-audit.md` #1–#4, `scraper-audit.md` #2, `cost-audit.md` #3/#4 (anti-join views/RPCs, `upsertMany` cleanup, server-side `minAiScore` filter) | Database Agent's Phase 1 RPC-shape fix (Finding #1) — Performance Agent's new views must follow the corrected return-shape convention. |

Phase 2 has a single agent, so "parallel execution" within the phase is not applicable — but Phase 2 may **overlap** with the tail of Phase 1 once Database Agent's specific Finding #1 PR (not the whole Phase 1 batch) has merged, since Performance Agent's new views/RPCs are additive migrations independent of the other Phase 1 agents' work.

**Exit criteria:** new views/RPCs merged (with Database Agent + Architecture Review Agent sign-off per the **architect** escalation rule), `docs/repositories.md` updated to reflect the new query patterns.

---

## Phase 3 — Pipeline Build

| Agent | Work item(s) | Depends on |
|---|---|---|
| **Pipeline Agent** | `architecture-audit.md` #1/#2 (`scripts/scrape.ts`/`score.ts`/`notify.ts`, `scrape_runs` status aggregation), `scraper-audit.md` #1 (sanitize `findUnscored` role filter), `architecture-audit.md` #3 (doc naming for `scoreJob`). | Database Agent's RPC fixes (Phase 1) and Performance Agent's anti-join views (Phase 2) — `score.ts`/`notify.ts` should be written against the *final* repository query shapes, not the pre-Phase-2 ones, to avoid rework. |
| **Deployment Agent** | `.github/workflows/*.yml` skeleton, secret documentation. | Can start once Pipeline Agent has settled on script **file names and npm script names** (early in Phase 3) — does not need to wait for script *logic* to be complete, since the workflow only invokes `npm run scrape`/`score`/`notify`. |

**Parallel execution strategy:** Pipeline Agent and Deployment Agent touch disjoint files (`scripts/**` vs `.github/workflows/**`) except `package.json`'s scripts section, which both read/write. Pipeline Agent adds the npm scripts first; Deployment Agent's workflow PR rebases onto that. This is the one designated **shared-file conflict point** in the whole workflow (see "Conflict Resolution" below).

**Exit criteria:** all three scripts implemented and passing their own test suites; `package.json` scripts section stable; Deployment Agent's workflow file references the final script names. Pipeline does **not** go live yet (cron schedule stays disabled/commented) — that's a Phase 4 gate.

---

## Phase 4 — Integration, Re-Audit, Go-Live

| Agent | Work item(s) |
|---|---|
| **Architecture Review Agent** | Full re-audit. `architecture-audit.md` #1/#2 should now show "Resolved." Confirms no new drift introduced by Phases 1–3. |
| **Security Agent** | Re-run security audit against `scripts/**` — `security-audit.md` #3 (service-role key boundary) becomes live and must be checked now that `createSupabaseServiceClient` has real callers. |
| **Performance Agent** | Re-run `cost-audit.md` #1 against real "every 2h × 5 sources" volume now that the pipeline exists; confirm #2 (two-stage gate) still holds under real data. |
| **Cleanup Agent** | Resolve deferred dead-code findings (`maintainability-audit.md` #3–#5) now that callers exist or have been explicitly declined. |
| **Deployment Agent** | Enable the cron schedule (uncomment/activate `.github/workflows/*.yml`) — **only after** the above three re-audits report no new Critical/High findings. |

**Exit criteria:** all re-audits clean (or with explicitly accepted/documented residual findings), cron schedule enabled, all eight original report files (`reports/*-audit.md`) have "Resolved" notes for every Critical/High finding from the original backlog (or an explicit "accepted, descoped via ADR-XX" note).

---

## Merge Order

Within and across phases, merges land in this order (a strict dependency chain — later items may depend on earlier ones being live):

1. **Database Agent** — schema/RPC/type fixes (Phase 1). Foundation for everything else.
2. **Security Agent, Notification Agent, Cleanup Agent** (Phase 1, isolated features) — any order among themselves, all after #1 only if they happen to touch a migration (none currently do).
3. **Performance Agent** — new views/RPCs (Phase 2), built on #1's corrected RPC-shape convention.
4. **Pipeline Agent** — cron scripts (Phase 3), built on #1 and #3's final query shapes.
5. **Deployment Agent** — workflow file (Phase 3/4), built on #4's script/npm-script names.
6. **Architecture Review Agent, Security Agent, Performance Agent** — Phase 4 re-audits (read-only reports, no code).
7. **Cleanup Agent** — deferred dead-code resolution (Phase 4), after #4 confirms which "dead" code now has callers.
8. **Deployment Agent** — cron go-live (Phase 4), last, gated on #6.

---

## Conflict Resolution Process

1. **File-ownership is authoritative.** `agent-profiles.md`'s "Allowed Files" table is checked before any agent starts work. Two agents should never have overlapping write sets except the one designated shared-file point (`package.json` scripts section, Pipeline Agent ↔ Deployment Agent, Phase 3).
2. **At the shared-file point:** the agent earlier in Merge Order (Pipeline Agent) merges first; the later agent (Deployment Agent) rebases its change onto the merged result. This is a rebase, not a renegotiation — Deployment Agent does not change script names, only consumes them.
3. **If an unplanned overlap is discovered mid-work** (e.g. two agents both need to touch `docs/repositories.md`): the agent whose change is more "downstream" per Merge Order pauses, the upstream agent's change merges first, then the downstream agent rebases.
4. **If a conflict can't be resolved by reordering/rebasing** (e.g. two agents propose incompatible schema changes): escalate to **Architecture Review Agent** per the Escalation Rules below — this is an **architect**-level decision, not a merge mechanics problem.

---

## Escalation Rules

| Trigger | Escalates to | Required outcome |
|---|---|---|
| Any new table, column, enum value, RPC, view, repository method, or external dependency | **architect** (Architecture Review Agent / human) | Sign-off recorded before implementation; new/updated ADR in `docs/decisions.md` if the change alters a documented decision's rationale. |
| Any Critical/High finding in any `reports/*-audit.md` | **Security Agent** (if security-classified) or the owning audit agent, plus **reviewer** | Fix merges before any dependent Phase begins; finding gets a "Resolved" note. |
| A finding that, if fixed as recommended, would contradict an existing ADR in `docs/decisions.md` | **Architecture Review Agent** | ADR updated (with "Consequences" revised) *before* the fix merges — `CLAUDE.md`: "Always update docs when architecture changes." |
| Enabling the cron schedule (Phase 4 go-live) | Human (via Architecture Review Agent's Phase 4 report) | Explicit approval after `cost-audit.md` #1 re-run shows acceptable projected spend — this is the single highest-cost-impact action in the whole workflow. |
| Two agents propose incompatible changes to the same file/contract | **Architecture Review Agent** | Arbitration decision recorded in `reports/architecture-audit.md`. |

---

## Re-Review Requirements

- **Migrations, `src/shared/**`, or RLS policy changes** — regardless of which agent authored them, require **Architecture Review Agent + Database Agent** re-review before merge (these are the highest-blast-radius files in the repo).
- **Any fix for a Critical/High finding** — requires the *owning* audit agent (per `agent-profiles.md`) to re-check that specific finding post-merge and append a "Resolved" note to the relevant `reports/*-audit.md`. A full re-audit is not required for a single-finding fix — see `docs/review-process.md` "Regression review process."
- **Pipeline Agent's deliverable (Phase 3 exit)** — requires re-review from **Architecture Review Agent, Security Agent, and Performance Agent** (Phase 4) before Deployment Agent is permitted to enable the cron schedule.
- **Any PR touching the Phase 3 shared file (`package.json` scripts section)** — requires both Pipeline Agent and Deployment Agent to confirm the final script names match, even if only one of them authored the change.
