import json

import pytest

from cg_sim import laya
from cg_sim.contracts import contracts_dir

GOLDEN = json.loads((contracts_dir() / "laya_golden.json").read_text())


def test_versions_agree():
    assert GOLDEN["questionsVersion"] == laya.questions_version() == 2


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: c["name"])
def test_golden(case):
    if "fragment" in case:
        out = laya.user_summary(case["user"], case["alias"])
    else:
        fields = {k: v for k, v in case.items() if k not in ("name", "question", "render")}
        fields |= fields.pop("place", {})
        out = laya.render_state(case["question"], **fields)
    assert out == case["render"]


def test_fake_p_rule():
    import hashlib

    s = GOLDEN["cases"][2]["render"]
    want = int(hashlib.sha256(f"2|show_up|{s}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    assert laya.fake_p("show_up", s) == want
    assert laya.LayaClient(fake=True).ask_many([(s, ["show_up"])]) == [{"show_up": want}]


def test_score_answer_expected_value():
    p = laya._answer_p({"probabilities": [0, 0, 1, 0]}, "score", ["a", "b", "c", "d"])
    assert p == pytest.approx(2 / 3)
