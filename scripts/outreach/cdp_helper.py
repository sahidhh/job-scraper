import asyncio
import json
import urllib.request
import websockets


def get_page_ws(port=9225):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as r:
        targets = json.loads(r.read().decode("utf-8"))
    pages = [t for t in targets if t.get("type") == "page" and not t.get("url", "").startswith("devtools://")]
    if not pages:
        raise RuntimeError("No open page tab found on CDP port")
    return pages[0]["webSocketDebuggerUrl"], pages[0]["url"]


class CDPPage:
    """Lightweight raw-WebSocket CDP driver for a visible Chrome tab (avoids Playwright connect_over_cdp hangs on Chrome 157+)."""

    def __init__(self, port=9225):
        self.ws_url, self.url = get_page_ws(port)
        self.msg_id = 0

    async def _send(self, ws, method, params=None):
        self.msg_id += 1
        mid = self.msg_id
        await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=15)
            data = json.loads(raw)
            if data.get("id") == mid:
                if "error" in data:
                    raise RuntimeError(f"CDP error {method}: {data['error']}")
                return data.get("result", {})

    async def run(self, fn):
        async with websockets.connect(self.ws_url, max_size=20 * 1024 * 1024) as ws:
            return await fn(ws, self)

    def eval(self, expression):
        async def _fn(ws, s):
            res = await s._send(ws, "Runtime.evaluate", {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            })
            if "exceptionDetails" in res:
                raise RuntimeError(res["exceptionDetails"])
            return res.get("result", {}).get("value")
        return asyncio.run(self.run(_fn))

    def navigate(self, url):
        async def _fn(ws, s):
            await s._send(ws, "Page.enable")
            return await s._send(ws, "Page.navigate", {"url": url})
        return asyncio.run(self.run(_fn))

    def set_files(self, selector, files):
        async def _fn(ws, s):
            await s._send(ws, "DOM.enable")
            doc = await s._send(ws, "DOM.getDocument", {"depth": -1})
            node = await s._send(ws, "DOM.querySelector", {
                "nodeId": doc["root"]["nodeId"],
                "selector": selector,
            })
            if not node.get("nodeId"):
                raise RuntimeError(f"Selector not found: {selector}")
            await s._send(ws, "DOM.setFileInputFiles", {
                "nodeId": node["nodeId"],
                "files": files,
            })
            return True
        return asyncio.run(self.run(_fn))
