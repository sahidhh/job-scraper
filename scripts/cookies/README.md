# Cookie Refresh Utilities

Lightweight CLI helpers to refresh Naukri and NaukriGulf session cookies on the DietPi box (`${COOKIES_DIR:-/home/dietpi/.cookies}/<source>.json`) without modifying `scripts/outreach/cdp_helper.py`.

Both utilities produce payloads compatible with `src/features/sources/infrastructure/cookieStore.ts` (`[{ "name": string, "value": string }]` JSON array or raw `Cookie` header string) and enforce `chmod 600` on the remote file.

## Environment Variables

- `DIETPI_HOST`: SSH/SCP target host (defaults to `dietpi` in `sync_cookies.py`, `worker` in `termux-refresh.sh`).
- `COOKIES_DIR`: Remote cookie store directory (defaults to `/home/dietpi/.cookies`).

## 1. Laptop Sync (`sync_cookies.py`)

Exports cookies from Chrome CDP or a `cookies.json` file and SCPs them to the box.

```bash
# From a cookies.json export
python scripts/cookies/sync_cookies.py --source naukri --cookies-file ~/Downloads/cookies.json

# From Chrome running with --remote-debugging-port=9222
python scripts/cookies/sync_cookies.py --source all --cdp-port 9222

# Dry-run validation
python scripts/cookies/sync_cookies.py --source naukri --cookies-file ./cookies.json --dry-run
```

## 2. Phone Termux/SSH (`termux-refresh.sh`)

Reads a `Cookie` header from `termux-clipboard-get` (or stdin fallback) and pipes it over Tailnet SSH.

```bash
# Copy Cookie header on phone, then run in Termux:
bash scripts/cookies/termux-refresh.sh --source naukri

# Or pipe via stdin:
printf 'naukri_sid=...' | bash scripts/cookies/termux-refresh.sh --source naukri --stdin
```
