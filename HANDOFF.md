# Handoff #225 (#197 follow-up), 2026-11-25

## Next action (<2 min)
- Open `/settings` in `job-scraper`, disable `naukri` and `naukrigulf`, and enable working sources (`remotive`, `himalayas`, ATS boards, or `jsearch`/`adzuna` after adding keys to `worker:/opt/job-scraper/.env`).

## State
- **Repo `main` (`3fe4480` + doc commits):** `verified` (`npm run verify` 143/143 files / 1,207 tests passed at `3fe4480`; `check:service-role-boundary` + GitHub `CI` + `Database migrations` green).
- **DietPi `/opt/job-scraper` (`3fe4480`):** `verified` (`job-scraper.timer` enabled for `08:30 IST` daily; `doctor`, anon RLS `0` rows, Telegram card ping, OpenRouter probe, and `cleanup-bloat --execute` `2,266` deleted / `44` archived passed).
- **OpenRouter scoring model:** `verified` (`mistralai/mistral-small-3.2-24b-instruct`, `$0.075/$0.200`, `67-116` out tokens at `OPENROUTER_MAX_TOKENS=300`).
- **Naukri / NaukriGulf:** `verified blocked` (`jobapi/v3/search` returns HTTP `406 recaptcha required` from residential DietPi IP with 20 valid Chrome cookies in `/home/dietpi/.cookies/naukri.json`; `naukrigulf` is stubbed).
- **Docs & KB:** `verified` (`docs/operations/dietpi-deployment-and-model-eval.md`, `design/*.md`, `PROJECT_STATE.md`, `OPERATIONS.md`, `kb/projects/job-scraper-overview.md`, `kb/projects/dietpi-manual.md`, `worker:/srv/work/MANUAL.md`).

## Open
1. Switch `enabled_sources` in `/settings` away from `naukri`/`naukrigulf` (`#225`) — verify next `08:30 IST` run via `ssh worker "journalctl -u job-scraper.service -n 50 --no-pager"` (`inserted > 0`).
2. Migrate Vercel & GitHub Actions secrets to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` and check depleted Google AI Studio BYOK quota for `google/gemini-2.5-flash` (`#225`) — verify via `npm run doctor`.
3. Decision awaiting user: push local `job-scraper` `main` doc commits to `origin/main`, and confirm deleting gitignored `.agent/` (backup at `C:\Users\sahid\backups\job-scraper-agent-2026-11-20`).

## Gotchas
- `OPENROUTER_MAX_TOKENS=300` breaks hybrid reasoning models (`ling-3.0-flash`, `hy4-flash`, `inkling-2-mini` -> `malformed_response`) and `:free` shared pools (`429`); keep pure non-reasoning instruct models unless raising the token cap.
- `supabase/setup-cli@v1` v3 defaults `supabase db push` to local unless `--remote --yes` is passed (`.github/workflows/migrate.yml`).
- `naukri.com/jobapi/v3/search` requires real-browser JS/reCAPTCHA clearance that cookie replay via `fetch` does not satisfy.
- `ssh worker` lands in `fish` shell; wrap multi-statement remote commands in `bash -s` (stdin/base64).

## Uncommitted/leftovers
- `C:\Users\sahid\repos\GitHub\job-scraper`: `scripts/outreach/apply_copilot.py` (pre-existing untracked, leave untouched), `.agent/` (gitignored Tier 3 plan), local `main` ahead of `origin/main`.
- `worker:/opt/job-scraper`: clean at `3fe4480` (no stray files).
