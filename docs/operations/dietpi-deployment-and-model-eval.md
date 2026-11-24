# DietPi Deployment & Model Evaluation Findings (2026-11-24)

Operational record from deploying `#197` (`naukri-box-pipeline`), fixing CI regressions, migrating Supabase key names, benchmarking OpenRouter models against `OPENROUTER_MAX_TOKENS=300`, and running the first live end-to-end DietPi timer execution.

## 1. CI, Migration & Key Migration Fixes

| Change | Commit | Result |
|---|---|---|
| Repaired `#197` service-role boundary, `webhook` `.eq("label")`, `NaukriGulfScraper`, test fixtures | `d505b8b` | Local `verify` 141/141 files (1,200 tests); GH `CI` `45408295879` passed |
| Fixed Supabase CLI v3 local-default in `migrate.yml` (`supabase db push --remote --yes`) | `62f5416` | `Database migrations` `45411819127` applied `20261119000001_naukri_box_pipeline.sql` to `production` |
| Added `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` with legacy fallback | `3fe4480` | Local `verify` 143/143 files (1,207 tests); `check:service-role-boundary` guards both keys; `CI` `45428943067` passed |

## 2. DietPi Deployment (`/opt/job-scraper`)

- Host: `dietpi-worker` (SSH alias `worker` over Tailscale, `/opt/job-scraper` at commit `3fe4480`, `npm ci` installed 623 packages).
- Units: `deploy/job-scraper.service` and `deploy/job-scraper.timer` installed in `/etc/systemd/system/`, enabled and started (next scheduled run `08:30:00 IST` daily).
- Environment: `/opt/job-scraper/.env` (`chmod 600`) configured with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, dedicated `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=mistralai/mistral-small-3.2-24b-instruct`, `NOTIFY_MODE=cards`, `COOKIES_DIR=/home/dietpi/.cookies`, `REMOTEOK_DISABLED=true`, `WELLFOUND_DISABLED=true`.
- Probes on DietPi passed: `npm run doctor` (0 failing), anon RLS check (`rows=0`), Telegram send (`OK`), OpenRouter probe (`OK`, 30 output tokens).
- Bloat cleanup (`npx tsx scripts/cleanup-bloat.ts --execute`): `total=4105`, `preserved=1076`, `deleted=2266`, `archived=44` (unscored queue `203` → `31`).

## 3. OpenRouter Model Evaluation (`OPENROUTER_MAX_TOKENS=300`)

Scoring requests use strict `json_schema` output with `DEFAULT_MAX_TOKENS=300` (`src/shared/infrastructure/openrouterClient.ts`).

| Model | Behaviour at `max_tokens=300` | Outcome | Notes |
|---|---|---|---|
| `google/gemini-2.5-flash` | Routed to depleted Google AI Studio BYOK | Failed (`402 RESOURCE_EXHAUSTED`) | Account OpenRouter balance `$8.79` left, but BYOK key exhausted |
| `gemma-4-31b-it:free`, `ling-3.2-flash:free` | Upstream shared free pool | Failed (`429`) | Rate-limited |
| `nemotron-3.5-super-vl:free` | Reasoning tokens consumed cap | Failed (`malformed_response`) | Truncated before JSON |
| Hybrid reasoning instruct models (`ling-3.0-flash`, `hy4-flash`, `inkling-2-mini`) | Reasoning enabled on OpenRouter (`298–300` completion tokens) | Failed (`malformed_response`) | `deepseek-v4.1-flash`, `granite-4.2-8b`, `lfm-2.5-24b-a2b`, `lfm-3-1.7b` also expose OpenRouter `reasoning` |
| 5 pure non-reasoning `structured_outputs` instruct models (including `mistralai/mistral-small-3.2-24b-instruct`) | `67–116` completion tokens | **Passed** (`SG_silent <= 0.40`, `Java_stack <= 0.50`, `Remote_fit >= 0.90`) | Selected `mistralai/mistral-small-3.2-24b-instruct` (`$0.075/$0.200` per 1M tokens) |

Rule for future model swaps: choose a non-reasoning instruct model supporting `structured_outputs`, or raise `OPENROUTER_MAX_TOKENS` before enabling any reasoning model.

## 4. Naukri & NaukriGulf Runtime Findings

- Synced 20 Naukri Chrome cookies to `worker:/home/dietpi/.cookies/naukri.json` (`3,902` bytes, `chmod 600`).
- Live run (`systemctl start job-scraper.service`) exited `0`:
  - `scrape`: skipped 10 disabled sources; `naukri` failed with HTTP `406` (`{"message":"recaptcha required","statusCode":406,"validationErrors":[],"data":null}`); `naukrigulf` failed as expected (`stubbed`); deactivated `247` expired jobs (`7+` days unseen).
  - `score`: `0/0` (`0` awaiting, `0` stuck).
  - `notify`: `0 card(s)`.
- Why real Chrome works while `NaukriScraper` fails: Akamai WAF + invisible JS/reCAPTCHA challenges pass transparently in an interactive Chrome session, but direct `fetch` calls to `naukri.com/jobapi/v3/search` trigger a `406 recaptcha required` block even from a residential IP with valid cookies.
- Project boundary note: automated CAPTCHA bypass or unattended stealth scraping is not supported; recovering Naukri would require an interactive user-attended browser session or disabling `naukri`/`naukrigulf` in `/settings` (`enabled_sources`) in favor of working API/ATS sources (`jsearch`, `adzuna`, `remotive`, `himalayas`, `greenhouse`, `lever`, `ashby`, `mycareersfuture`).
