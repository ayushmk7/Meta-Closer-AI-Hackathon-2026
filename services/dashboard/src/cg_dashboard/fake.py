"""Fake internal API (openapi.internal.yaml shapes) for stand-alone dashboard runs and tests.

ponytail: in-memory, deterministic, only the routes the dashboard calls. Swap for the real
backend by setting CG_INTERNAL_URL; no code change.
"""

import json
import random
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

SCENES = [
    ("sc_climb", "Bouldering + trail running", (37.770, -122.445)),
    ("sc_games", "Board games + D&D", (37.760, -122.415)),
    ("sc_clay", "Ceramics + printmaking", (37.776, -122.424)),
    ("sc_coast", "Coastal hikes + gardening", (37.780, -122.490)),
]


def build_state(seed: int = 7) -> dict:
    rng = random.Random(seed)
    nodes = []
    for i in range(48):
        sc, _, (lat, lng) = SCENES[i % len(SCENES)]
        uid = "u_maya" if i == 0 else f"u_{i:04d}"
        nodes.append(
            {
                "userId": uid,
                "displayName": "Maya" if i == 0 else f"Person {i}",
                "location": {"lat": lat + rng.gauss(0, 0.008), "lng": lng + rng.gauss(0, 0.01)},
                "sceneId": sc if i % 11 else None,
                "connections": rng.randint(0, 5),
                "openJoins": rng.randint(0, 3),
                "isolated": i % 5 == 0,
                "synthetic": i % 7 == 0,
            }
        )
    ids = [n["userId"] for n in nodes]
    edges = [
        {"a": a, "b": b, "kind": rng.choice(["candidate"] * 6 + ["met", "met", "friendship"]), "weight": rng.random()}
        for a, b in {tuple(sorted(rng.sample(ids, 2))) for _ in range(70)}
    ]
    groups = [
        {
            "meetupId": "m_0001",
            "planId": "p_clay_sat",
            "title": "Saturday wheel-throwing drop-in",
            "venue": {"name": "Hayes Clay Works (fictional)", "lat": 37.7765, "lng": -122.4240},
            "memberIds": ids[2:30:8],
            "status": "confirmed",
        }
    ]
    return {
        "graph": {"poolId": "pool_sf_city", "nodes": nodes, "edges": edges, "groups": groups, "scenes": [
            {"sceneId": s, "label": label, "topInterestIds": []} for s, label, _ in SCENES
        ]},
        "metrics": {
            "members": len(nodes), "isolated": sum(n["isolated"] for n in nodes), "connections": len(edges),
            "openPlans": 24, "joins": 61, "plansFormed": 1, "plansNotFilled": 0, "meetupsConfirmed": 1,
            "meetupsCompleted": 0, "museStepsDone": 9, "museStepsFailed": 1, "approvalsRequested": 2,
            "approvalsApproved": 1, "bookingFallbacks": 1, "userDecisionsPerMeetup": 2.5, "nudgesShown": 3,
            "nudgesJoined": 1, "laya_decisive_share": 0.42, "muse_fallbacks": 0,
        },
        "demo": {"counterpart": "synthetic", "liveUserId": "u_0005", "forcedYes": True, "relaxCheckin": True,
                 "failNextBooking": False, "simulatedPayments": True, "fakeLocation": {"lat": 37.78, "lng": -122.49}},
        "calls": [],
    }


def make_handler(state: dict, lock: threading.Lock):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def reply(self, status, obj=None):
            body = b"" if obj is None else json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def handle_any(self, method):
            p = urlsplit(self.path).path.removeprefix("/internal/v1")
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}") if n else {}
            with lock:
                state["calls"].append([method, p, body])
                m = state["metrics"]
                if method == "GET" and p == "/health":
                    return self.reply(200, {"status": "ok"})
                if method == "GET" and p == "/pools":
                    return self.reply(200, {"items": [
                        {"poolId": "pool_sf_city", "mode": "city", "label": "San Francisco", "members": m["members"]},
                        {"poolId": "pool_evt_closer_together", "mode": "event", "label": "Closer Together AI Hackathon", "members": 80},
                    ]})
                if method == "GET" and p.startswith("/pools/") and p.endswith("/graph"):
                    g = dict(state["graph"], poolId=p.split("/")[2], generatedAt=datetime.now(timezone.utc).isoformat())
                    return self.reply(200, g)
                if method == "GET" and p == "/metrics":
                    m["museStepsDone"] += 1  # looks alive on screen
                    return self.reply(200, m)
                if p == "/demo":
                    if method == "PUT":
                        state["demo"].update(body)
                    return self.reply(200, state["demo"])
                if method == "POST":
                    if p == "/demo/reset":
                        return self.reply(204)
                    if p == "/demo/nudges":
                        m["nudgesShown"] += 1
                        return self.reply(200, {"nudgeId": "n_fake"})
                    if p == "/plans/regenerate":
                        return self.reply(200, {"plans": 24, "feeds": m["members"]})
                    if p.startswith("/plans/") and p.endswith("/form"):
                        m["plansFormed"] += 1
                        return self.reply(200, {"meetupIds": ["m_0001"], "notFilledUserIds": []})
                    if p.startswith("/demo/meetups/") and p.endswith("/advance"):
                        return self.reply(200, {})
            self.reply(404, {"error": {"code": "not_found", "message": p, "retryable": False}})

        def do_GET(self):
            self.handle_any("GET")

        def do_PUT(self):
            self.handle_any("PUT")

        def do_POST(self):
            self.handle_any("POST")

    return H


def start_fake(state: dict | None = None) -> str:
    """Start the fake on a free loopback port in a daemon thread; return its base URL."""
    state = state if state is not None else build_state()
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state, threading.Lock()))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}"
