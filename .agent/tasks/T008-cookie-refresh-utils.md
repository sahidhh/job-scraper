---
id: T008
title: Cookie refresh utilities for laptop Chrome/SCP and phone Termux/SSH
status: pending
gate_level: 1
priority: medium
agent: {role: generalist, tier: jr, fallback: agent_default}
dependencies: [T006]
requirements: [REQ-F007, REQ-I001]
---
# Objective
Create two lightweight cookie-refresh utilities for the DietPi box cookie store: (1) a laptop sync script that exports Naukri/NaukriGulf cookies from Chrome CDP or a `cookies.json` file and SCPs them to the box over Tailnet/LAN, and (2) a phone Termux/SSH shortcut script that reads a `Cookie` header (or clipboard) over Tailnet SSH and updates the box cookie store.

# Context
- T006 defines the box cookie store path (`NAUKRI_COOKIE_FILE` / `NAUKRIGULF_COOKIE_FILE` or `COOKIES_DIR`).
- Spec §3: keep `scripts/outreach/cdp_helper.py` intact; cookie-refresh utilities are standalone CLI helpers.

# Inputs
- `src/features/sources/infrastructure/cookieStore.ts` (from T006)
- `scripts/outreach/cdp_helper.py` (reference only — do not modify)

# Scope
Included: Laptop cookie sync script (e.g., `scripts/cookies/sync-cookies.ps1` or `sync_cookies.py`), phone Termux/SSH refresh script (`scripts/cookies/termux-refresh.sh`), and usage notes in `scripts/cookies/README.md`.
Excluded: Modifying `scripts/outreach/cdp_helper.py` or building a web UI cookie editor.

# Implementation guidance
1. Laptop script: accept `--source naukri|naukrigulf|all`, `--cookies-file <path>` OR `--cdp-port 9222`, validate non-empty cookie payload, and `scp` to `${DIETPI_HOST:-dietpi}:${DIETPI_COOKIES_DIR}/<source>.json` with `chmod 600`.
2. Termux/SSH script: prompt or read `termux-clipboard-get` (with stdin fallback), validate non-empty `Cookie` header, and pipe over `ssh ${DIETPI_HOST:-worker}` into the box cookie store with `chmod 600`.
3. Never hardcode hostnames/passwords/cookies; use env vars with sensible defaults (`dietpi` / `worker`).

# Expected outputs
- `scripts/cookies/sync_cookies.py` (or `.ps1`)
- `scripts/cookies/termux-refresh.sh`
- `scripts/cookies/README.md`

# Acceptance criteria
Blocking:
- [ ] AC-008-1: Laptop script supports both `cookies.json` input and Chrome CDP extraction, validates non-empty cookies, and targets the exact cookie store format read by T006 `cookieStore.ts`.
- [ ] AC-008-2: Termux script supports clipboard/stdin `Cookie` header update over SSH and sets `chmod 600`.
- [ ] AC-008-3: No real cookies or credentials exist in any committed file; `scripts/outreach/cdp_helper.py` is untouched.
Quality:
- [ ] Clear `--help` / usage message on both scripts.
Compatibility:
- [ ] Output format matches T006 `cookieStore.ts` parser.

# Verification
- Syntax check (`python -m py_compile` / `bash -n`) and `--help` dry-run.
- Verify `git status` / `git diff` leaves `scripts/outreach/cdp_helper.py` untouched.

# Constraints
- Do not execute `scp`/`ssh` to live box during planning/CI tests.

# Handoff
Return: status, summary, created files, syntax check output.

# Failure handling
- If `cookieStore.ts` format changed in T006, update script output format to match.
