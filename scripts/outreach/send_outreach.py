#!/usr/bin/env python3
"""Standalone Gmail SMTP/IMAP and OAuth2 Gmail REST API outreach runner."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import imaplib
import json
from pathlib import Path
import random
import re
import secrets
import smtplib
import ssl
import sys
import time
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest
import webbrowser

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = REPO_ROOT / ".env.outreach"
DEFAULT_INPUT_PATH = REPO_ROOT / "reports" / "outreach" / "outreach-ready.json"
DEFAULT_LEDGER_PATH = REPO_ROOT / "reports" / "outreach" / "send-ledger.json"
DEFAULT_OAUTH_CLIENT_PATH = REPO_ROOT / "oauth-client.json"
DEFAULT_OAUTH_TOKEN_PATH = REPO_ROOT / ".oauth-token.json"
PLACEHOLDER_PASSWORD = "PUT_YOUR_16_CHAR_APP_PASSWORD_HERE"
PLACEHOLDER_CLIENT_PREFIX = "PUT_YOUR_"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_API_DRAFT_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"


def load_env_file(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def load_ledger(ledger_path: Path) -> dict[str, Any]:
    if not ledger_path.exists():
        return {"updatedAt": None, "entries": {}}
    return json.loads(ledger_path.read_text(encoding="utf-8"))


def save_ledger(ledger_path: Path, ledger: dict[str, Any]) -> None:
    ledger["updatedAt"] = datetime.now(timezone.utc).isoformat()
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")


def _is_set(val: str) -> bool:
    cleaned = val.strip()
    return bool(cleaned) and not cleaned.startswith(PLACEHOLDER_CLIENT_PREFIX)


def load_oauth_client_config(
    env_values: dict[str, str],
    client_path: Path,
) -> tuple[str, str, str] | None:
    env_id = env_values.get("GOOGLE_CLIENT_ID", "")
    env_secret = env_values.get("GOOGLE_CLIENT_SECRET", "")
    if _is_set(env_id) and _is_set(env_secret):
        return env_id.strip(), env_secret.strip(), GOOGLE_TOKEN_URL

    if client_path.exists():
        raw = json.loads(client_path.read_text(encoding="utf-8"))
        block = raw.get("installed") or raw.get("web") or raw
        cid = str(block.get("client_id", "")).strip()
        csec = str(block.get("client_secret", "")).strip()
        turi = str(block.get("token_uri", GOOGLE_TOKEN_URL)).strip() or GOOGLE_TOKEN_URL
        if cid:
            return cid, csec, turi

    return None


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _http_post_form(url: str, params: dict[str, str]) -> dict[str, Any]:
    body = urlparse.urlencode(params).encode("utf-8")
    req = urlrequest.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urlerror.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OAuth endpoint error {err.code}: {detail}") from err


def run_oauth_login(
    env_values: dict[str, str],
    client_path: Path,
    token_path: Path,
) -> int:
    cfg = load_oauth_client_config(env_values, client_path)
    if not cfg:
        print(
            "[outreach:oauth] Missing Desktop OAuth client credentials.\n"
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.outreach, OR save\n"
            f"a downloaded Desktop OAuth JSON from Google Cloud Console to {client_path}.",
            file=sys.stderr,
        )
        return 2

    client_id, client_secret, token_uri = cfg
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    auth_result: dict[str, str] = {}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse.urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            qs = urlparse.parse_qs(parsed.query)
            auth_result["code"] = (qs.get("code") or [""])[0]
            auth_result["state"] = (qs.get("state") or [""])[0]
            auth_result["error"] = (qs.get("error") or [""])[0]

            ok = bool(auth_result["code"]) and not auth_result["error"]
            msg = (
                "Authorization received. You can close this browser tab and return to the terminal."
                if ok
                else f"Authorization failed: {auth_result.get('error', 'unknown_error')}"
            )
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"<html><body><p>{msg}</p></body></html>".encode("utf-8"))

        def log_message(self, format: str, *args: object) -> None:
            return

    server: HTTPServer
    try:
        server = HTTPServer(("127.0.0.1", 8765), CallbackHandler)
    except OSError:
        server = HTTPServer(("127.0.0.1", 0), CallbackHandler)

    port = server.server_address[1]
    redirect_uri = f"http://127.0.0.1:{port}/callback"
    query = urlparse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": GMAIL_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    auth_url = f"{GOOGLE_AUTH_URL}?{query}"

    print("[outreach:oauth] Opening Google sign-in in your browser...")
    print(f"[outreach:oauth] If the browser did not open automatically, visit:\n{auth_url}")
    webbrowser.open(auth_url)

    server.timeout = 180
    deadline = time.time() + 180
    while "code" not in auth_result and "error" not in auth_result and time.time() < deadline:
        server.handle_request()
    server.server_close()

    if auth_result.get("error"):
        print(f"[outreach:oauth] Google sign-in returned error: {auth_result['error']}", file=sys.stderr)
        return 3
    if not auth_result.get("code"):
        print("[outreach:oauth] Timed out waiting for Google OAuth callback.", file=sys.stderr)
        return 3
    if auth_result.get("state") != state:
        print("[outreach:oauth] OAuth state mismatch; aborting.", file=sys.stderr)
        return 3

    token_params = {
        "code": auth_result["code"],
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }
    if client_secret:
        token_params["client_secret"] = client_secret

    token_resp = _http_post_form(token_uri, token_params)
    expires_in = int(token_resp.get("expires_in", 3600))
    stored = {
        "access_token": token_resp["access_token"],
        "refresh_token": token_resp.get("refresh_token", ""),
        "expires_at": int(time.time()) + expires_in,
        "scope": token_resp.get("scope", GMAIL_SCOPE),
        "token_uri": token_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    token_path.write_text(json.dumps(stored, indent=2) + "\n", encoding="utf-8")
    print(f"[outreach:oauth] Saved OAuth token to {token_path} (scope={GMAIL_SCOPE}).")
    return 0


def get_valid_oauth_access_token(
    token_path: Path,
    env_values: dict[str, str],
    client_path: Path,
) -> str:
    data = json.loads(token_path.read_text(encoding="utf-8"))
    if int(data.get("expires_at", 0)) > int(time.time()) + 60 and data.get("access_token"):
        return str(data["access_token"])

    refresh_token = str(data.get("refresh_token", "")).strip()
    if not refresh_token:
        raise RuntimeError(f"OAuth token in {token_path} expired without refresh_token; re-run --oauth-login.")

    client_id = str(data.get("client_id", "")).strip()
    client_secret = str(data.get("client_secret", "")).strip()
    token_uri = str(data.get("token_uri", GOOGLE_TOKEN_URL)).strip() or GOOGLE_TOKEN_URL
    if not client_id:
        cfg = load_oauth_client_config(env_values, client_path)
        if not cfg:
            raise RuntimeError("Missing OAuth client_id for token refresh.")
        client_id, client_secret, token_uri = cfg

    params = {
        "client_id": client_id,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    if client_secret:
        params["client_secret"] = client_secret

    refreshed = _http_post_form(token_uri, params)
    data["access_token"] = refreshed["access_token"]
    data["expires_at"] = int(time.time()) + int(refreshed.get("expires_in", 3600))
    token_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return str(data["access_token"])


def _gmail_api_post(url: str, access_token: str, raw_bytes: bytes, is_draft: bool) -> dict[str, Any]:
    raw_b64 = base64.urlsafe_b64encode(raw_bytes).decode("ascii")
    payload = {"message": {"raw": raw_b64}} if is_draft else {"raw": raw_b64}
    req = urlrequest.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urlerror.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gmail API HTTP {err.code}: {detail}") from err


def build_email_message(draft: dict[str, Any], sender_name: str, sender_email: str) -> EmailMessage:
    attachment_path = (REPO_ROOT / draft["attachmentPath"]).resolve()
    if not attachment_path.exists():
        raise FileNotFoundError(f"Attachment missing for {draft['draftId']}: {attachment_path}")

    msg = EmailMessage()
    msg["From"] = formataddr((sender_name, sender_email))
    msg["To"] = draft["recipientEmail"].strip()
    msg["Subject"] = draft["subject"].strip()
    msg["Message-ID"] = make_msgid(domain=sender_email.split("@")[-1])
    msg.set_content(draft["body"].rstrip() + "\n", subtype="plain", charset="utf-8")

    pdf_bytes = attachment_path.read_bytes()
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename="Sahidhullah-H-Resume.pdf",
    )
    return msg


def filter_drafts(
    drafts: list[dict[str, Any]],
    ledger: dict[str, Any],
    group: int | None,
    ids_filter: set[str],
    limit: int | None,
) -> list[dict[str, Any]]:
    sent_emails = {
        entry.get("recipientEmail", "").lower()
        for entry in ledger.get("entries", {}).values()
        if entry.get("status") == "sent"
    }
    sent_ids = {
        draft_id
        for draft_id, entry in ledger.get("entries", {}).items()
        if entry.get("status") == "sent"
    }

    selected: list[dict[str, Any]] = []
    for draft in drafts:
        draft_id = str(draft["draftId"])
        recipient = str(draft["recipientEmail"]).strip()
        if group is not None and int(draft["group"]) != group:
            continue
        if ids_filter and draft_id not in ids_filter:
            continue
        if draft_id in sent_ids or recipient.lower() in sent_emails:
            continue
        selected.append(draft)

    if limit is not None and limit >= 0:
        selected = selected[:limit]
    return selected


def run_dry_run(
    drafts: list[dict[str, Any]],
    gmail_user: str,
    sender_name: str,
    app_password: str,
    env_values: dict[str, str],
    env_exists: bool,
    client_path: Path,
    token_path: Path,
) -> int:
    errors: list[str] = []
    if not env_exists:
        errors.append(f"Missing env file: {DEFAULT_ENV_PATH}")
    if not EMAIL_RE.match(gmail_user):
        errors.append(f"Invalid GMAIL_USER in .env.outreach: '{gmail_user}'")

    for draft in drafts:
        recipient = str(draft.get("recipientEmail", "")).strip()
        if not EMAIL_RE.match(recipient):
            errors.append(f"{draft.get('draftId')}: invalid recipientEmail '{recipient}'")
        att = (REPO_ROOT / str(draft.get("attachmentPath", ""))).resolve()
        if not att.exists() or att.stat().st_size < 2000:
            errors.append(f"{draft.get('draftId')}: missing/invalid PDF '{draft.get('attachmentPath')}'")

    pw_status = (
        "PLACEHOLDER (turn on 2-Step Verification -> App passwords, OR use OAuth2)"
        if not app_password or app_password == PLACEHOLDER_PASSWORD
        else f"CONFIGURED ({len(app_password.replace(' ', ''))} chars)"
    )

    has_client = load_oauth_client_config(env_values, client_path) is not None
    has_token = token_path.exists()
    if has_token:
        oauth_status = f"AUTHORIZED ({token_path.name} present)"
    elif has_client:
        oauth_status = "CLIENT CONFIGURED (run npm run outreach:oauth to sign in)"
    else:
        oauth_status = "NOT CONFIGURED (optional: add GOOGLE_CLIENT_ID/SECRET or oauth-client.json)"

    print(f"[outreach:dry-run] Env file: {DEFAULT_ENV_PATH} (exists={env_exists})")
    print(f"[outreach:dry-run] Sender: {sender_name} <{gmail_user}>")
    print(f"[outreach:dry-run] App Password status: {pw_status}")
    print(f"[outreach:dry-run] OAuth2 Gmail API status: {oauth_status}")
    print(f"[outreach:dry-run] Targets ready to process: {len(drafts)}")

    if drafts:
        first = drafts[0]
        print(
            f"[outreach:dry-run] Sample target: {first['draftId']} -> {first['recipientEmail']} "
            f"| {first['companyName']} | {first['attachmentPath']}"
        )

    if errors:
        print(f"[outreach:dry-run] FAILED validation ({len(errors)} error(s)):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("[outreach:dry-run] Validation PASSED.")
    return 0


def resolve_auth_mode(
    requested: str,
    raw_password: str,
    token_path: Path,
) -> tuple[str, str]:
    cleaned_pw = raw_password.replace(" ", "").strip()
    has_pw = bool(cleaned_pw) and raw_password.strip() != PLACEHOLDER_PASSWORD
    has_oauth = token_path.exists()

    if requested == "oauth":
        if not has_oauth:
            print(
                f"[outreach] OAuth requested but {token_path} is missing. Run `npm run outreach:oauth` first.",
                file=sys.stderr,
            )
            sys.exit(2)
        return "oauth", ""

    if requested == "app-password":
        if not has_pw:
            print(
                "[outreach] GMAIL_APP_PASSWORD is missing or placeholder in .env.outreach.",
                file=sys.stderr,
            )
            sys.exit(2)
        return "app-password", cleaned_pw

    if has_oauth:
        return "oauth", ""
    if has_pw:
        return "app-password", cleaned_pw

    print(
        "[outreach] No active Gmail credentials configured yet.\n"
        "Choose one of two paths:\n"
        "  Path A (App Password): Enable 2-Step Verification at "
        "https://myaccount.google.com/signinoptions/two-step-verification,\n"
        "    then generate a 16-char password at https://myaccount.google.com/apppasswords and put it in .env.outreach.\n"
        "  Path B (OAuth2): Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env.outreach (or oauth-client.json),\n"
        "    then run `npm run outreach:oauth`.",
        file=sys.stderr,
    )
    sys.exit(2)


def record_ledger_entry(
    ledger: dict[str, Any],
    ledger_path: Path,
    draft: dict[str, Any],
    message_id: str,
    status: str,
    transport: str,
) -> None:
    ledger.setdefault("entries", {})[draft["draftId"]] = {
        "draftId": draft["draftId"],
        "recipientEmail": draft["recipientEmail"],
        "companyName": draft["companyName"],
        "subject": draft["subject"],
        "messageId": message_id,
        "status": status,
        "transport": transport,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    save_ledger(ledger_path, ledger)


def run_oauth_drafts(
    drafts: list[dict[str, Any]],
    gmail_user: str,
    sender_name: str,
    env_values: dict[str, str],
    client_path: Path,
    token_path: Path,
    ledger_path: Path,
    ledger: dict[str, Any],
) -> int:
    print(f"[outreach:draft] Creating Gmail Drafts via OAuth2 REST API as {gmail_user}...")
    access_token = get_valid_oauth_access_token(token_path, env_values, client_path)
    for idx, draft in enumerate(drafts, start=1):
        msg = build_email_message(draft, sender_name, gmail_user)
        _gmail_api_post(GMAIL_API_DRAFT_URL, access_token, msg.as_bytes(), is_draft=True)
        record_ledger_entry(ledger, ledger_path, draft, msg["Message-ID"], "drafted", "oauth2")
        print(f"[outreach:draft] ({idx}/{len(drafts)}) Saved draft for {draft['draftId']} -> {draft['recipientEmail']}")
    return 0


def run_oauth_send(
    drafts: list[dict[str, Any]],
    gmail_user: str,
    sender_name: str,
    env_values: dict[str, str],
    client_path: Path,
    token_path: Path,
    ledger_path: Path,
    ledger: dict[str, Any],
    jitter_min: int,
    jitter_max: int,
) -> int:
    print(f"[outreach:send] Sending via Gmail OAuth2 REST API as {gmail_user}...")
    for idx, draft in enumerate(drafts, start=1):
        access_token = get_valid_oauth_access_token(token_path, env_values, client_path)
        msg = build_email_message(draft, sender_name, gmail_user)
        _gmail_api_post(GMAIL_API_SEND_URL, access_token, msg.as_bytes(), is_draft=False)
        record_ledger_entry(ledger, ledger_path, draft, msg["Message-ID"], "sent", "oauth2")
        print(f"[outreach:send] ({idx}/{len(drafts)}) Sent {draft['draftId']} -> {draft['recipientEmail']}")

        if idx < len(drafts) and jitter_max > 0:
            delay = random.uniform(max(0, jitter_min), max(jitter_min, jitter_max))
            print(f"[outreach:send] Waiting {delay:.1f}s before next send...")
            time.sleep(delay)
    return 0


def run_imap_drafts(
    drafts: list[dict[str, Any]],
    gmail_user: str,
    sender_name: str,
    app_password: str,
    ledger_path: Path,
    ledger: dict[str, Any],
) -> int:
    print(f"[outreach:draft] Connecting to imap.gmail.com:993 as {gmail_user}...")
    context = ssl.create_default_context()
    with imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=context) as imap:
        imap.login(gmail_user, app_password)
        for idx, draft in enumerate(drafts, start=1):
            msg = build_email_message(draft, sender_name, gmail_user)
            now = imaplib.Time2Internaldate(time.time())
            status, _ = imap.append("[Gmail]/Drafts", "\\Draft", now, msg.as_bytes())
            if status != "OK":
                raise RuntimeError(f"IMAP APPEND failed for {draft['draftId']}: {status}")
            record_ledger_entry(ledger, ledger_path, draft, msg["Message-ID"], "drafted", "imap")
            print(f"[outreach:draft] ({idx}/{len(drafts)}) Saved draft for {draft['draftId']} -> {draft['recipientEmail']}")
    return 0


def run_smtp_send(
    drafts: list[dict[str, Any]],
    gmail_user: str,
    sender_name: str,
    app_password: str,
    ledger_path: Path,
    ledger: dict[str, Any],
    jitter_min: int,
    jitter_max: int,
) -> int:
    print(f"[outreach:send] Connecting to smtp.gmail.com:587 (STARTTLS) as {gmail_user}...")
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(gmail_user, app_password)

            for idx, draft in enumerate(drafts, start=1):
                msg = build_email_message(draft, sender_name, gmail_user)
                smtp.send_message(msg)
                record_ledger_entry(ledger, ledger_path, draft, msg["Message-ID"], "sent", "smtp")
                print(f"[outreach:send] ({idx}/{len(drafts)}) Sent {draft['draftId']} -> {draft['recipientEmail']}")

                if idx < len(drafts) and jitter_max > 0:
                    delay = random.uniform(max(0, jitter_min), max(jitter_min, jitter_max))
                    print(f"[outreach:send] Waiting {delay:.1f}s before next send...")
                    time.sleep(delay)
    except smtplib.SMTPAuthenticationError as err:
        print(f"[outreach:send] Authentication failed (check Gmail App Password): {err}", file=sys.stderr)
        return 3
    except smtplib.SMTPException as err:
        print(f"[outreach:send] SMTP error encountered, ledger preserved for resume: {err}", file=sys.stderr)
        return 4
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send or draft compiled job application emails via Gmail.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Validate env, drafts, and PDFs without connecting")
    mode.add_argument("--oauth-login", action="store_true", help="Authorize Gmail access via OAuth2 in Chrome")
    mode.add_argument("--draft", action="store_true", help="Upload messages into Gmail Drafts")
    mode.add_argument("--send", action="store_true", help="Send messages via Gmail")
    parser.add_argument(
        "--auth",
        choices=["auto", "oauth", "app-password"],
        default="auto",
        help="Transport authentication mode (default: auto prefers .oauth-token.json, else GMAIL_APP_PASSWORD)",
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH, help="Compiled outreach-ready.json path")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV_PATH, help="Path to .env.outreach")
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER_PATH, help="Send ledger path")
    parser.add_argument("--oauth-client", type=Path, default=DEFAULT_OAUTH_CLIENT_PATH, help="Desktop OAuth client JSON")
    parser.add_argument("--oauth-token", type=Path, default=DEFAULT_OAUTH_TOKEN_PATH, help="Saved OAuth token JSON")
    parser.add_argument("--limit", type=int, default=None, help="Maximum messages to process")
    parser.add_argument("--group", type=int, choices=[1, 2, 3], default=None, help="Only process one group")
    parser.add_argument("--id", type=str, default="", help="Comma-separated draftIds (e.g. g1-01,g1-02)")
    parser.add_argument("--jitter-min", type=int, default=25, help="Minimum delay seconds between sends")
    parser.add_argument("--jitter-max", type=int, default=65, help="Maximum delay seconds between sends")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env_values = load_env_file(args.env)

    if args.oauth_login:
        return run_oauth_login(env_values, args.oauth_client, args.oauth_token)

    if not args.input.exists():
        print(f"[outreach] Missing compiled drafts JSON: {args.input}", file=sys.stderr)
        return 1

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    all_drafts: list[dict[str, Any]] = payload.get("drafts", [])

    gmail_user = env_values.get("GMAIL_USER", "")
    sender_name = env_values.get("SENDER_NAME", "Sahidhullah H")
    raw_password = env_values.get("GMAIL_APP_PASSWORD", "")

    ids_filter = {part.strip() for part in args.id.split(",") if part.strip()}
    ledger = load_ledger(args.ledger)
    selected = filter_drafts(all_drafts, ledger, args.group, ids_filter, args.limit)

    if args.draft or args.send:
        mode, pw = resolve_auth_mode(args.auth, raw_password, args.oauth_token)
        if args.draft:
            if mode == "oauth":
                return run_oauth_drafts(
                    selected, gmail_user, sender_name, env_values, args.oauth_client, args.oauth_token, args.ledger, ledger
                )
            return run_imap_drafts(selected, gmail_user, sender_name, pw, args.ledger, ledger)

        if mode == "oauth":
            return run_oauth_send(
                selected,
                gmail_user,
                sender_name,
                env_values,
                args.oauth_client,
                args.oauth_token,
                args.ledger,
                ledger,
                args.jitter_min,
                args.jitter_max,
            )
        return run_smtp_send(
            selected,
            gmail_user,
            sender_name,
            pw,
            args.ledger,
            ledger,
            args.jitter_min,
            args.jitter_max,
        )

    return run_dry_run(
        selected,
        gmail_user,
        sender_name,
        raw_password,
        env_values,
        args.env.exists(),
        args.oauth_client,
        args.oauth_token,
    )


if __name__ == "__main__":
    raise SystemExit(main())
