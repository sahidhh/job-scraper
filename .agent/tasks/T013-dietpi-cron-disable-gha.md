---
id: T013
title: DietPi 08:30 IST cron/systemd timer and disable GitHub Actions scrape.yml schedule
status: pending
gate_level: 1
priority: high
agent: {role: generalist, tier: jr, fallback: agent_default}
dependencies: [T007, T010]
requirements: [REQ-F013, REQ-C001]
---
# Objective
Disable the scheduled `cron` trigger in `.github/workflows/scrape.yml` (keeping manual `workflow_dispatch` only) and add DietPi box cron/systemd timer configuration + runbook for the **08:30 IST** daily `scrape → score → notify` pipeline.

# Context
- `.github/workflows/scrape.yml` currently runs `cron: "0 6,14 * * *"`.
- Moving daily scraping to the DietPi box at 08:30 IST (03:00 UTC) uses the residential IP for Naukri/NaukriGulf.

# Inputs
- `.github/workflows/scrape.yml`
- `package.json` (`scrape`, `score`, `notify` scripts)

# Scope
Included: `.github/workflows/scrape.yml` (remove/comment out `schedule:` trigger with clear explanation), DietPi systemd service + timer (or crontab snippet) and setup doc under `deploy/` (e.g., `deploy/job-scraper.service`, `deploy/job-scraper.timer`, `deploy/README.md`).
Excluded: SSHing into DietPi or modifying box state directly during this task.

# Implementation guidance
1. In `.github/workflows/scrape.yml`, remove/comment the `schedule:` block so GitHub Actions never runs automated scrapes, while keeping `workflow_dispatch: {}` for emergency manual runs.
2. Create `deploy/job-scraper.service` and `deploy/job-scraper.timer` (with `OnCalendar=*-*-* 03:00:00 UTC` = 08:30 IST, or `TZ=Asia/Kolkata` cron `30 8 * * *`), running `npm run scrape && npm run score && npm run notify` sequentially with `set -e` / `&&` so `score`/`notify` only run if `scrape` succeeds (or explicit error logging).
3. Document required `.env` variables and installation commands in `deploy/README.md`.

# Expected outputs
- Updated `.github/workflows/scrape.yml`
- `deploy/job-scraper.service`, `deploy/job-scraper.timer`, `deploy/README.md`

# Acceptance criteria
Blocking:
- [ ] AC-013-1: `.github/workflows/scrape.yml` has no active `schedule:` trigger.
- [ ] AC-013-2: DietPi timer/cron configuration targets 08:30 IST (03:00 UTC) daily and chains `scrape` → `score` → `notify`.
Quality:
- [ ] Valid YAML in `.github/workflows/scrape.yml` and valid systemd unit syntax.
Compatibility:
- [ ] Other GitHub workflows (`ci.yml`, `migrate.yml`, `verify-production.yml`, etc.) remain untouched.

# Verification
- Inspect `.github/workflows/scrape.yml` YAML structure and `deploy/` files.

# Constraints
- Do not re-enable `scrape.yml` schedule (Out of Scope).

# Handoff
Return: status, summary, changed/created files, and DietPi install command for the user.

# Failure handling
- If `workflow_dispatch` needs inputs or env adjustments, keep minimal and valid YAML.
