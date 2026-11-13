from cg_sim.laya import _answer_p


def test_parse_real_laya_serve_answers():
    """Shapes captured from laya-serve 0.2.1 with real weights (2026-11-13)."""
    assert _answer_p({"type": "noul", "noul": 0.0889}, "noul", None) == 0.0889
    score = {"type": "score", "score": 1.0, "legend": {"0": "weak", "1": "medium", "2": "strong"},
             "probabilities": {"0": 0.2, "1": 0.3, "2": 0.5}, "confidence": 0.4}
    assert abs(_answer_p(score, "score", ["weak", "medium", "strong"]) - (0.3 * 0.5 + 0.5 * 1.0)) < 1e-9
