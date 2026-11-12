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


@pytest.mark.parametrize("ans,want", [(0.3, 0.3), ({"p": 0.3}, 0.3), ({"probability": 0.3}, 0.3),
                                      ({"probabilities": {"yes": 0.3, "no": 0.7}}, 0.3)])
def test_noul_answer_shapes(ans, want):
    assert laya._answer_p(ans, "noul", None) == want


def test_render_state_is_what_fake_hashes():
    import hashlib

    case = next(c for c in GOLDEN["cases"] if c["name"] == "show_up_state")
    s = laya.render_state("show_up", users=case["users"], activityType=case["activityType"])
    want = int(hashlib.sha256(f"2|show_up|{case['render']}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    assert laya.fake_p("show_up", s) == want


def test_noul_dist_without_yes_is_valueerror():
    with pytest.raises(ValueError):
        laya._answer_p({"probabilities": {"x": 0.3}}, "noul", None)


def test_ask_falls_back_per_answer():
    class Resp:
        def raise_for_status(self): ...
        def json(self): return {"answers": {"show_up": {"probabilities": {"x": 0.3}}, "meet_again": {"p": 0.4}}}

    class Http:
        def post(self, *a, **k): return Resp()

    class Down:
        def post(self, *a, **k): raise OSError("down")

    c = laya.LayaClient(fake=False)
    assert c._ask(Http(), "s", ["show_up", "meet_again"]) == {"show_up": laya.fake_p("show_up", "s"), "meet_again": 0.4}
    assert c._ask(Down(), "s", ["meet_again"]) == {"meet_again": laya.fake_p("meet_again", "s")}
