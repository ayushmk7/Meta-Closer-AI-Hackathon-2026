import pytest

from cg_api import app, settings


def test_refuses_without_demo_mode(monkeypatch):
    monkeypatch.setattr(app, "get_settings", lambda: settings.Settings(demo_mode=False))
    with pytest.raises(SystemExit):
        app.create_apps()


def test_copy_drops_sensitive_and_hidden():
    import asyncio

    from cg_api.ports import StubCopy

    items = [
        {"id": "a.b.c", "label": "Wheel throwing", "visibility": "shown", "sensitive": False},
        {"id": "x.y.z", "label": "Buddhism", "visibility": "shown", "sensitive": True},
        {"id": "p.q.r", "label": "Secret hobby", "visibility": "hidden", "sensitive": False},
    ]
    c = StubCopy()
    texts = [
        asyncio.run(c.setup_review("u_maya", items)),
        asyncio.run(c.plan_reason({}, items[1:])),
        asyncio.run(c.intro(["Maya"], items[1:], {}))[0],
    ]
    assert "wheel throwing" in texts[0]
    assert not any(w in t.lower() for t in texts for w in ("buddhism", "secret"))
