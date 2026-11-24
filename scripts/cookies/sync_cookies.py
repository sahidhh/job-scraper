#!/usr/bin/env python3
"""Sync Naukri / NaukriGulf cookies from a cookies.json file or Chrome CDP to the DietPi box."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shlex
import socket
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from typing import Any

SOURCE_DOMAINS: dict[str, tuple[str, ...]] = {
    "naukri": ("naukri.com",),
    "naukrigulf": ("naukrigulf.com",),
}


def _ws_handshake(sock: socket.socket, host: str, port: int, path: str) -> None:
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode("ascii"))
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise RuntimeError("WebSocket handshake failed: connection closed")
        buf += chunk
    status_line = buf.split(b"\r\n", 1)[0]
    if b"101" not in status_line:
        raise RuntimeError(f"WebSocket handshake rejected: {status_line.decode('utf-8', 'replace')}")


def _ws_send_text(sock: socket.socket, text: str) -> None:
    payload = text.encode("utf-8")
    mask_key = os.urandom(4)
    header = bytearray([0x81])
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    header.extend(mask_key)
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    data = bytearray()
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise RuntimeError("WebSocket connection closed unexpectedly")
        data.extend(chunk)
    return bytes(data)


def _ws_recv_text(sock: socket.socket) -> str:
    while True:
        b1, b2 = _recv_exact(sock, 2)
        opcode = b1 & 0x0F
        masked = (b2 & 0x80) != 0
        length = b2 & 0x7F
        if length == 126:
            (length,) = struct.unpack("!H", _recv_exact(sock, 2))
        elif length == 127:
            (length,) = struct.unpack("!Q", _recv_exact(sock, 8))
        mask_key = _recv_exact(sock, 4) if masked else b""
        payload = _recv_exact(sock, length)
        if masked:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        if opcode == 0x8:
            raise RuntimeError("WebSocket closed by remote")
        if opcode == 0x9:  # ping -> pong
            continue
        if opcode == 0x1:
            return payload.decode("utf-8")


def fetch_cdp_cookies(cdp_port: int) -> list[dict[str, Any]]:
    """Fetch all cookies from a local Chrome instance with remote debugging enabled."""
    with urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json/version", timeout=5) as resp:
        info = json.loads(resp.read().decode("utf-8"))
    ws_url = info.get("webSocketDebuggerUrl")
    if not ws_url:
        raise RuntimeError(f"No webSocketDebuggerUrl found on port {cdp_port}")

    parsed = urllib.parse.urlparse(ws_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or cdp_port
    path = parsed.path or "/"

    with socket.create_connection((host, port), timeout=10) as sock:
        _ws_handshake(sock, host, port, path)
        _ws_send_text(sock, json.dumps({"id": 1, "method": "Storage.getCookies"}))
        while True:
            msg = json.loads(_ws_recv_text(sock))
            if msg.get("id") == 1:
                if "error" in msg:
                    raise RuntimeError(f"CDP error: {msg['error']}")
                return list(msg.get("result", {}).get("cookies", []))


def normalize_cookies(
    raw_cookies: Any,
    source: str | None = None,
) -> list[dict[str, str]]:
    """Validate and normalize cookies into [{name, value}] matching cookieStore.ts."""
    if not isinstance(raw_cookies, list):
        raise ValueError("Cookie payload must be a JSON array of {name, value} objects")

    domains = SOURCE_DOMAINS.get(source, ()) if source else ()
    normalized: list[dict[str, str]] = []
    for item in raw_cookies:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        value = item.get("value")
        if not isinstance(name, str) or not name or not isinstance(value, str):
            continue
        if domains:
            domain = str(item.get("domain", "")).lstrip(".").lower()
            if domain and not any(domain == d or domain.endswith(f".{d}") for d in domains):
                continue
        normalized.append({"name": name, "value": value})

    if not normalized:
        target = f" for source '{source}'" if source else ""
        raise ValueError(f"No valid non-empty cookies found{target}")
    return normalized


def sync_to_remote(
    source: str,
    cookies: list[dict[str, str]],
    host: str,
    cookies_dir: str,
    dry_run: bool = False,
) -> None:
    """SCP validated cookies to the remote host and enforce chmod 600."""
    remote_path = f"{cookies_dir.rstrip('/')}/{source}.json"
    if dry_run:
        print(f"[dry-run] Would sync {len(cookies)} cookies for '{source}' -> {host}:{remote_path} (chmod 600)")
        return

    with tempfile.NamedTemporaryFile("w", suffix=f"-{source}.json", encoding="utf-8", delete=False) as tmp:
        json.dump(cookies, tmp, indent=2)
        tmp_path = tmp.name

    try:
        mkdir_cmd = f"mkdir -p {shlex.quote(cookies_dir)} && chmod 700 {shlex.quote(cookies_dir)}"
        subprocess.run(["ssh", host, mkdir_cmd], check=True)
        subprocess.run(["scp", tmp_path, f"{host}:{remote_path}"], check=True)
        subprocess.run(["ssh", host, f"chmod 600 {shlex.quote(remote_path)}"], check=True)
        print(f"Synced {len(cookies)} cookies for '{source}' -> {host}:{remote_path}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export Naukri/NaukriGulf cookies from Chrome CDP or cookies.json and SCP to DietPi.",
    )
    parser.add_argument(
        "--source",
        required=True,
        choices=["naukri", "naukrigulf", "all"],
        help="Target job source (naukri, naukrigulf, or all).",
    )
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--cookies-file",
        help="Path to a cookies.json file containing an array of {name, value} objects.",
    )
    input_group.add_argument(
        "--cdp-port",
        type=int,
        help="Chrome remote debugging port (e.g. 9222) to extract cookies via CDP.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("DIETPI_HOST", "dietpi"),
        help="Remote SSH/SCP host (default: $DIETPI_HOST or 'dietpi').",
    )
    parser.add_argument(
        "--cookies-dir",
        default=os.environ.get("COOKIES_DIR", "/home/dietpi/.cookies"),
        help="Remote cookie store directory (default: $COOKIES_DIR or '/home/dietpi/.cookies').",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate cookies and print the target without running ssh/scp.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    sources = ["naukri", "naukrigulf"] if args.source == "all" else [args.source]

    if args.cookies_file:
        with open(args.cookies_file, "r", encoding="utf-8") as f:
            raw_cookies = json.load(f)
    else:
        raw_cookies = fetch_cdp_cookies(args.cdp_port)

    for src in sources:
        # Filter by domain when pulling from CDP or when syncing 'all' from a multi-domain file.
        filter_src = src if (args.cdp_port or args.source == "all") else None
        cookies = normalize_cookies(raw_cookies, source=filter_src)
        sync_to_remote(
            source=src,
            cookies=cookies,
            host=args.host,
            cookies_dir=args.cookies_dir,
            dry_run=args.dry_run,
        )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
