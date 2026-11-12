from cg_sim import cli


def test_dispatch_unknown_command():
    assert cli.main(["nope"]) == 2
