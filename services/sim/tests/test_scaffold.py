from cg_sim import cli


def test_dispatch_unknown_command():
    assert cli.main(["nope"]) == 2


def test_unbuilt_command_reports_not_built():
    assert cli.main(["report"]) == 2
