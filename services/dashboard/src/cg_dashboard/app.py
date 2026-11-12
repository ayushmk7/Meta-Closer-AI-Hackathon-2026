"""cg-dashboard: internal dashboard on CG_DASHBOARD_HOST:CG_DASHBOARD_PORT (loopback only).

Routes
  /, /map, /replay, /muse, /controls   one page (static/index.html), tab picked from the path
  /api/i/<path>                        proxy to CG_INTERNAL_URL/internal/v1/<path> (GET, PUT, POST)
  /api/replay                          newest data/sim/runs/*/replay.json, else bundled fixture
  /api/local?poolId=                   demo.json + low-outgoing ids from data/sim_private + LAN IP
"""

import argparse
import ipaddress
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

PKG = Path(__file__).parent
PAGES = {"/", "/map", "/replay", "/muse", "/controls"}
POOL_ID_OK = set("abcdefghijklmnopqrstuvwxyz0123456789_")


def data_dir() -> Path:
    return Path(os.environ.get("CG_DATA_DIR") or PKG.parents[3] / "data")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def replay_path() -> Path:
    if env := os.environ.get("CG_REPLAY"):
        return Path(env)
    runs = sorted(data_dir().glob("sim/runs/*/replay.json"), key=lambda p: p.stat().st_mtime)
    return runs[-1] if runs else PKG / "fixtures" / "replay.json"


def lan_ip() -> str:
    # UDP connect sends nothing; it just picks the outbound interface.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # default route; editable in the UI if it picks a VPN
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def local_info(pool_id: str) -> dict:
    if not pool_id or not set(pool_id) <= POOL_ID_OK:
        raise ValueError("bad poolId")
    demo_file = data_dir() / "seed" / pool_id / "demo.json"
    demo = json.loads(demo_file.read_text()) if demo_file.exists() else None
    latent = read_jsonl(data_dir() / "sim_private" / pool_id / "latent.jsonl")
    return {
        "demo": demo,
        "lowOutgoingIds": [r["userId"] for r in latent if r.get("lowOutgoing")],
        "lanIp": lan_ip(),
    }


class Handler(BaseHTTPRequestHandler):
    internal_url = "http://127.0.0.1:9001"

    def log_message(self, fmt, *args):  # quiet: the 2 s map poll would flood the terminal
        pass

    def send(self, status: int, body: bytes, ctype: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, obj):
        self.send(status, json.dumps(obj).encode())

    def proxy(self, method: str, path: str, query: str):
        url = f"{self.internal_url}/internal/v1/{path}" + (f"?{query}" if query else "")
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else (b"{}" if method != "GET" else None)
        req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                self.send(r.status, r.read() or b"{}")
        except urllib.error.HTTPError as e:
            self.send(e.code, e.read() or b"{}")
        except OSError as e:
            self.send_json(502, {"error": {"code": "internal_unreachable", "message": str(e), "retryable": True}})

    def route(self, method: str):
        u = urlsplit(self.path)
        if u.path.startswith("/api/i/") and ".." not in u.path:
            return self.proxy(method, u.path[len("/api/i/") :], u.query)
        if method != "GET":
            return self.send_json(405, {"error": {"code": "method", "message": "GET only", "retryable": False}})
        if u.path in PAGES:
            return self.send(200, (PKG / "static" / "index.html").read_bytes(), "text/html; charset=utf-8")
        if u.path == "/api/replay":
            return self.send(200, replay_path().read_bytes())
        if u.path == "/api/local":
            try:
                return self.send_json(200, local_info(parse_qs(u.query).get("poolId", [""])[0]))
            except ValueError as e:
                return self.send_json(400, {"error": {"code": "bad_request", "message": str(e), "retryable": False}})
        self.send_json(404, {"error": {"code": "not_found", "message": u.path, "retryable": False}})

    def do_GET(self):
        self.route("GET")

    def do_PUT(self):
        self.route("PUT")

    def do_POST(self):
        self.route("POST")


def make_server(host: str, port: int, internal_url: str) -> ThreadingHTTPServer:
    if not ipaddress.ip_address(socket.gethostbyname(host)).is_loopback:
        raise SystemExit(f"refusing to bind {host}: the dashboard binds to loopback only")
    handler = type("H", (Handler,), {"internal_url": internal_url.rstrip("/")})
    return ThreadingHTTPServer((host, port), handler)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="cg-dashboard")
    ap.add_argument("--fake", action="store_true", help="serve a built-in fake internal API instead of CG_INTERNAL_URL")
    a = ap.parse_args(argv)
    host = os.environ.get("CG_DASHBOARD_HOST", "127.0.0.1")
    port = int(os.environ.get("CG_DASHBOARD_PORT", "9100"))
    internal = os.environ.get("CG_INTERNAL_URL", "http://127.0.0.1:9001")
    if a.fake:
        from cg_dashboard.fake import start_fake

        internal = start_fake()
    srv = make_server(host, port, internal)
    print(f"cg-dashboard on http://{host}:{port}  (internal API: {internal})", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
