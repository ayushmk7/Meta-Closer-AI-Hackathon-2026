import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path[:0] = [str(HERE.parents[1] / "src"), str(HERE)]

from fixture_world import world  # noqa: E402,F401  (pytest fixture)
