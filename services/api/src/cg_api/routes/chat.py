"""listThreads, getThread, listMessages, sendMessage, markThreadRead."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import chat
from cg_api.domain.http import REQUEST_BASE, call, items

router = APIRouter(dependencies=REQUEST_BASE)


@router.get("/v1/threads", operation_id="listThreads")
async def list_threads(user: User):
    return call("listThreads", items(chat.list_threads), user)


@router.get("/v1/threads/{threadId}", operation_id="getThread")
async def get_thread(threadId: str, user: User):
    return call("getThread", lambda w, u, t: chat.thread_view(w, u, chat.get(w, u, t)), user, threadId)


@router.get("/v1/threads/{threadId}/messages", operation_id="listMessages")
async def list_messages(threadId: str, user: User, after: str | None = None):
    return call("listMessages", items(chat.list_messages), user, threadId, after)


@router.post("/v1/threads/{threadId}/messages", operation_id="sendMessage")
async def send_message(threadId: str, user: User, body: dict = Body(...)):
    return call(
        "sendMessage", chat.send, user, threadId, body.get("text"), body.get("clientId"), body.get("toMuse") is True
    )


@router.post("/v1/threads/{threadId}/read", operation_id="markThreadRead", status_code=204, response_class=Response)
async def mark_thread_read(threadId: str, user: User):
    call("markThreadRead", chat.mark_read, user, threadId)
