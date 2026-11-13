"""UX guide Part 1 on the server's own error copy (CONTRACTS §7: `message` is shown as is)."""

import pathlib
import re

DOMAIN = pathlib.Path(__file__).resolve().parents[2] / "src" / "cg_api" / "domain"
FAIL = re.compile(r'Fail\(\s*\d+,\s*"[a-z_]+",\s*f?"([^"]+)"')


def test_error_messages_follow_the_voice():
    msgs = [(p.name, m) for p in DOMAIN.glob("*.py") for m in FAIL.findall(p.read_text())]
    assert len(msgs) > 30
    for name, m in msgs:
        assert not re.search(r"\bI\b|\bI'", m), (name, m)  # chrome speaks about Muse, never as "I"
        assert m.endswith((".", "?")) and "!" not in m, (name, m)
        assert m[0].isupper() or m[0] == "{", (name, m)  # sentence case ("{" = an f-string slot first)
        assert not re.search(r"\b(Could not|cannot|do not|does not|is not)\b", m), (name, m)  # contractions


def test_not_found_names_the_thing(world):
    import pytest

    from cg_api.domain import approvals, nudges, shares
    from cg_api.domain.world import Fail

    for call, thing in (
        (lambda: shares.like(world, "u_maya", "sh_nope", True), "post"),
        (lambda: approvals.decide(world, "u_maya", "ap_nope", "approve"), "request"),
        (lambda: nudges.dismiss(world, "u_maya", "nd_nope"), "suggestion"),
    ):
        with pytest.raises(Fail) as e:
            call()
        assert e.value.message == f"This {thing} isn't available. It may have been removed."
