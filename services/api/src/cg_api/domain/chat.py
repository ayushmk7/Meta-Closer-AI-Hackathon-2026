"""Group threads and messages."""

from __future__ import annotations

import re

from cg_api.domain import privacy
from cg_api.domain.world import Fail, World, iso, not_found

TO_MUSE = re.compile(r"^\s*muse\b", re.I)


def _visible(w: World, viewer: str, msg: dict) -> bool:
    if msg.get("onlyFor") and msg["onlyFor"] != viewer:
        return False
    uid = msg["sender"].get("userId")
    return not (uid and w.blocked(viewer, uid))  # P9


def message_view(viewer: str, msg: dict) -> dict:
    out = {k: v for k, v in msg.items() if k != "onlyFor"}
    out["attachments"] = [
        a
        for a in msg["attachments"]
        if a.get("kind") != "approval" or msg.get("onlyFor") == viewer
    ]
    return out


def get(w: World, viewer: str, thread_id: str) -> dict:
    t = w.threads.get(thread_id)
    if not t or viewer not in t["members"]:
        raise not_found()
    return t


def messages(w: World, viewer: str, t: dict) -> list[dict]:
    return [m for m in t["messages"] if _visible(w, viewer, m)]


def thread_view(w: World, viewer: str, t: dict) -> dict:
    msgs = messages(w, viewer, t)
    read = t["readUpTo"].get(viewer, 0)
    unread = sum(
        1
        for m in t["messages"][read:]
        if _visible(w, viewer, m) and m["sender"].get("userId") != viewer
    )
    return {
        "threadId": t["threadId"],
        "kind": "group",
        "title": t["title"],
        "participants": [
            privacy.person_card(w, u)
            for u in privacy.others_visible(w, viewer, t["members"])
        ],
        "lastMessage": message_view(viewer, msgs[-1]) if msgs else None,
        "unreadCount": unread,
        "updatedAt": msgs[-1]["createdAt"]
        if msgs
        else w.meetups[t["meetupId"]]["steps"][0]["at"]
        if w.meetups[t["meetupId"]]["steps"]
        else iso(w.now()),
        "meetupId": t["meetupId"],
    }


def list_threads(w: World, viewer: str) -> list[dict]:
    ts = [
        thread_view(w, viewer, t) for t in w.threads.values() if viewer in t["members"]
    ]
    return sorted(ts, key=lambda t: t["updatedAt"], reverse=True)


def list_messages(
    w: World, viewer: str, thread_id: str, after: str | None = None
) -> list[dict]:
    msgs = messages(w, viewer, get(w, viewer, thread_id))
    if after:
        idx = next((i for i, m in enumerate(msgs) if m["messageId"] == after), None)
        msgs = msgs[idx + 1 :] if idx is not None else msgs
    return [message_view(viewer, m) for m in msgs]


def post(
    w: World,
    thread_id: str,
    kind: str,
    user_id: str | None,
    text: str,
    attachments: list[dict] | None = None,
    client_id: str | None = None,
    to_muse: bool = False,
    only_for: str | None = None,
) -> dict:
    t = w.threads[thread_id]
    msg = {
        "messageId": w.next_id("ms_"),
        "threadId": thread_id,
        "sender": {"kind": kind, "userId": user_id},
        "text": text,
        "createdAt": iso(w.now()),
        "clientId": client_id,
        "toMuse": to_muse,
        "attachments": attachments or [],
    }
    if only_for:
        msg["onlyFor"] = only_for
    t["messages"].append(msg)
    for uid in t["members"]:
        if _visible(w, uid, msg):
            w.emit(uid, "message.created", message_view(uid, msg))
            w.emit(uid, "thread.updated", thread_view(w, uid, t))
    return msg


def send(
    w: World,
    viewer: str,
    thread_id: str,
    text: str,
    client_id: str,
    to_muse: bool = False,
) -> dict:
    t = get(w, viewer, thread_id)
    if (
        not text
        or not text.strip()
        or len(text) > w.params["messages"]["maxChars"]
        or not client_id
    ):
        raise Fail(400, "validation_failed", "That message can't be sent.")
    dup = next(
        (
            m
            for m in t["messages"]
            if m["clientId"] == client_id and m["sender"].get("userId") == viewer
        ),
        None,
    )
    if dup:
        return message_view(viewer, dup)
    msg = post(
        w,
        thread_id,
        "user",
        viewer,
        text,
        client_id=client_id,
        to_muse=bool(to_muse or TO_MUSE.match(text)),
    )
    t["readUpTo"][viewer] = len(t["messages"])
    if msg["toMuse"]:
        w.on_to_muse(w, msg)
    return message_view(viewer, msg)


def mark_read(w: World, viewer: str, thread_id: str) -> None:
    t = get(w, viewer, thread_id)
    t["readUpTo"][viewer] = len(t["messages"])
