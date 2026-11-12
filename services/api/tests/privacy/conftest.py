import pytest
from domain.fixture_world import make_world

from cg_api.domain import matching, stubs


@pytest.fixture(params=[stubs, matching], ids=["stubs", "cg_matching"])
def world(request):
    """Privacy must hold whichever matching implementation answers (matching falls back to stubs if absent)."""
    return make_world(request.param)
