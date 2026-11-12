import pytest

from cg_sim.contracts import data_dir


@pytest.fixture(scope="session")
def committed():
    return data_dir()
