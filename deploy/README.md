# DietPi Deployment (08:30 IST Daily Pipeline)

This directory contains the systemd service and timer to run the daily `scrape -> score -> notify` pipeline on a DietPi box at **08:30 IST (03:00 UTC)** using a residential IP.

GitHub Actions scheduled scraping in `.github/workflows/scrape.yml` is disabled (`workflow_dispatch: {}` remains active for emergency manual runs).

## Prerequisites

1. Clone the repository to `/opt/job-scraper` (or update `WorkingDirectory` and `EnvironmentFile` in `job-scraper.service` to match your path).
2. Install Node.js (v20+) and dependencies:
   ```bash
   cd /opt/job-scraper
   npm ci
   ```
3. Create `/opt/job-scraper/.env` with the required environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - Any enabled source credentials/cookies (e.g., Naukri / NaukriGulf cookies)

## Installation

```bash
sudo cp deploy/job-scraper.service /etc/systemd/system/job-scraper.service
sudo cp deploy/job-scraper.timer /etc/systemd/system/job-scraper.timer
sudo systemctl daemon-reload
sudo systemctl enable --now job-scraper.timer
```

## Verification

Check the timer schedule:
```bash
systemctl list-timers job-scraper.timer
```

Run the pipeline manually once to verify:
```bash
sudo systemctl start job-scraper.service
journalctl -u job-scraper.service -n 100 --no-pager
```
