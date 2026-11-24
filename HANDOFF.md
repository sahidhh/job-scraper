# Job Scraper — Session Handoff (2026-11-24)

## State
- Repo `main` at `3fe4480` + documentation updates in this session (`design/`, `README.md`, `AI_HANDOFF.md`, `docs/operations/dietpi-deployment-and-model-eval.md`); CI and `Database migrations` green on GitHub.
- DietPi worker `/opt/job-scraper` running `3fe4480` with `job-scraper.timer` enabled for `08:30 IST` daily (`NOTIFY_MODE=cards`, `OPENROUTER_MODEL=mistralai/mistral-small-3.2-24b-instruct`).
- Pre-existing untracked files kept untouched: `scripts/outreach/apply_copilot.py` and gitignored `.agent/` (backup at `C:\Users\sahid\backups\job-scraper-agent-2026-11-20`).

## Last done
- Fixed `#197` CI failures (`d505b8b`) and Supabase CLI v3 `--remote --yes` migration push (`62f5416`); migration `20261119000001_naukri_box_pipeline.sql` applied to production.
- Migrated app, scripts, and workflows to prefer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` with legacy fallback (`3fe4480`).
- Deployed DietPi `/opt/job-scraper`, ran `cleanup-bloat --execute` (`2,266` deleted, `44` archived, queue `203` -> `31`), verified `doctor`, anon RLS, Telegram card send, and OpenRouter probe.
- Benchmarked OpenRouter models at `OPENROUTER_MAX_TOKENS=300`; selected non-reasoning `mistralai/mistral-small-3.2-24b-instruct` (`$0.075/$0.200`, `67-116` out tokens).

## Open tests/checks
- Production `enabled_sources` still contains only `['naukri', 'naukrigulf']`.
- Live run on DietPi (`exit 0`) proved `naukri.com/jobapi/v3/search` returns HTTP `406 recaptcha required` even from residential IP with 20 valid Chrome cookies (`/home/dietpi/.cookies/naukri.json`), and `naukrigulf` is stubbed (`TODO`).
- Next `08:30 IST` DietPi timer run will produce `0` new jobs until `enabled_sources` is switched in `/settings`.

## Gotchas
- **OpenRouter `max_tokens=300`:** Hybrid reasoning instruct models (`ling-3.0-flash`, `hy4-flash`, `inkling-2-mini`) exhaust `300` tokens before JSON (`malformed_response`); `google/gemini-2.5-flash` routes to depleted Google AI Studio BYOK (`402`); `:free` shared pools hit `429`.
- **Naukri WAF:** Real Chrome clears invisible JS/reCAPTCHA challenges, so cookie replay in plain `fetch` fails with `406`.
- **DietPi SSH:** Use `ssh worker` (Tailscale) with base64-encoded bash scripts because the remote login shell is `fish`.

## Next 2-min action
- Open `/settings` in the deployed app (`job-scraper`), disable `naukri`/`naukrigulf`, enable `jsearch` / `adzuna` / `remotive` / `himalayas` / ATS boards (and add `RAPIDAPI_KEY` or `ADZUNA_*` to `/opt/job-scraper/.env` if using JSearch/Adzuna).

## Files & refs
- [dietpi-deployment-and-model-eval.md](docs/operations/dietpi-deployment-and-model-eval.md)
- [design/tech-stack.md](design/tech-stack.md), [design/limitations.md](design/limitations.md), [design/security.md](design/security.md)
- `C:\Users\sahid\kb\projects\job-scraper-overview.md` and `C:\Users\sahid\kb\projects\dietpi-manual.md`
