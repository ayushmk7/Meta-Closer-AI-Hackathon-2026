import pytest

from cg_api import app, settings


def test_refuses_without_demo_mode(monkeypatch):
    monkeypatch.setattr(app, "get_settings", lambda: settings.Settings(demo_mode=False))
    with pytest.raises(SystemExit):
        app.create_apps()
