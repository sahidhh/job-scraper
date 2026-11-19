---
id: T014
title: Full repository verification and regression check
status: pending
gate_level: 2
priority: high
agent: {role: tester, tier: sr, fallback: agent_default}
dependencies: [T003, T008, T011, T012, T013]
requirements: [REQ-F001, REQ-F002, REQ-F003, REQ-F004, REQ-F005, REQ-F006, REQ-F007, REQ-F008, REQ-F009, REQ-F010, REQ-F011, REQ-F012, REQ-F013, REQ-F014, REQ-F015, REQ-N001, REQ-I001, REQ-S001, REQ-C001]
---
# Objective
Run the full repository verification suite (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check:service-role-boundary`) after all implementation tasks are accepted, verify no secrets or `claude_routine` references remain, and write `.agent/reports/verification.md`.

# Context
- `package.json` defines `"verify": "npm run typecheck && npm run lint && npm run test && npm run build"` and `"check:service-role-boundary"`.
- All feature tasks T001–T013 must be `accepted` before T014 runs.

# Inputs
- Entire `job-scraper` repository after T001–T013

# Scope
Included: Running verification commands, checking `claude_routine` absence in `src/` & `scripts/`, checking `scripts/outreach/cdp_helper.py` is unmodified, writing `.agent/reports/verification.md`.
Excluded: Implementing new features or running production DB migrations/cleanup.

# Implementation guidance
1. Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check:service-role-boundary`.
2. Verify `claude_routine` has 0 matches in `src/` and `scripts/`.
3. Verify `scripts/outreach/cdp_helper.py` has no diff against `HEAD`.
4. Record exact pass/fail counts and command outputs in `.agent/reports/verification.md`.

# Expected outputs
- `.agent/reports/verification.md`

# Acceptance criteria
Blocking:
- [ ] AC-014-1: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check:service-role-boundary` all exit 0 with zero skipped/relaxed assertions.
- [ ] AC-014-2: Zero `claude_routine` references in `src/` and `scripts/`, `scripts/outreach/cdp_helper.py` untouched, and no cookies/secrets staged or committed.
Quality:
- [ ] Verification report lists exact commands run and observed results.
Compatibility:
- [ ] No regressions in existing dashboard, scoring, or application features.

# Verification
- Direct inspection of command exit codes and `.agent/reports/verification.md`.

# Constraints
- Do not mask or skip failing tests.

# Handoff
Return: status, summary, exact command results, and `.agent/reports/verification.md` path.

# Failure handling
- If any check fails, report exact failing file/test and return FAIL so the responsible upstream task can be fixed.
