#!/usr/bin/env bash
set -euo pipefail

HOST="${DIETPI_HOST:-worker}"
COOKIES_DIR="${COOKIES_DIR:-/home/dietpi/.cookies}"
SOURCE=""
USE_STDIN=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: termux-refresh.sh --source <naukri|naukrigulf> [options]

Reads a Cookie header from Termux clipboard (termux-clipboard-get) or stdin,
validates it, and writes it to the DietPi cookie store over SSH with chmod 600.

Options:
  -s, --source <name>       Target source: naukri or naukrigulf (required)
  -H, --host <host>         Remote SSH host (default: $DIETPI_HOST or 'worker')
  -d, --cookies-dir <dir>   Remote cookie directory (default: $COOKIES_DIR or '/home/dietpi/.cookies')
      --stdin               Read Cookie header from stdin instead of termux-clipboard-get
      --dry-run             Validate input and print target without running ssh
  -h, --help                Show this help message and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--source)
      SOURCE="${2:-}"
      shift 2
      ;;
    -H|--host)
      HOST="${2:-}"
      shift 2
      ;;
    -d|--cookies-dir)
      COOKIES_DIR="${2:-}"
      shift 2
      ;;
    --stdin)
      USE_STDIN=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$SOURCE" != "naukri" && "$SOURCE" != "naukrigulf" ]]; then
  echo "Error: --source must be 'naukri' or 'naukrigulf'." >&2
  usage >&2
  exit 1
fi

RAW_COOKIE=""
if [[ "$USE_STDIN" -eq 0 ]] && command -v termux-clipboard-get >/dev/null 2>&1; then
  RAW_COOKIE="$(termux-clipboard-get)"
else
  if [[ -t 0 ]]; then
    echo "Paste Cookie header and press Ctrl-D:" >&2
  fi
  RAW_COOKIE="$(cat)"
fi

# Strip optional "Cookie:" prefix and trim surrounding whitespace/newlines.
COOKIE_HEADER="$(printf '%s' "$RAW_COOKIE" | sed -E 's/^[Cc]ookie:[[:space:]]*//' | tr -d '\r\n' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"

if [[ -z "$COOKIE_HEADER" ]]; then
  echo "Error: Cookie header is empty." >&2
  exit 1
fi

if [[ "$COOKIE_HEADER" != *"="* ]]; then
  echo "Error: Cookie header does not appear to contain any name=value pairs." >&2
  exit 1
fi

REMOTE_PATH="${COOKIES_DIR%/}/${SOURCE}.json"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] Would write ${#COOKIE_HEADER} bytes for '${SOURCE}' -> ${HOST}:${REMOTE_PATH} (chmod 600)"
  exit 0
fi

printf '%s' "$COOKIE_HEADER" | ssh "$HOST" "mkdir -p '${COOKIES_DIR}' && chmod 700 '${COOKIES_DIR}' && cat > '${REMOTE_PATH}' && chmod 600 '${REMOTE_PATH}'"
echo "Updated ${HOST}:${REMOTE_PATH} (chmod 600)"
