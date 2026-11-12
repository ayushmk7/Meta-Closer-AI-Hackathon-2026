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


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.50", "::", "example.com", ""])
def test_internal_listener_must_be_loopback(monkeypatch, host):
    from cg_api import cli

    monkeypatch.setattr(cli, "get_settings", lambda: settings.Settings(internal_host=host))
    with pytest.raises(SystemExit, match="loopback"):
        cli.main()


def test_loopback_hosts():
    from cg_api.cli import is_loopback

    assert all(is_loopback(h) for h in ("127.0.0.1", "127.0.0.2", "::1", "[::1]", "localhost"))
