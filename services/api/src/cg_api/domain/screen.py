"""Local text screen that always runs, fakes or not (D4: the demo never goes unscreened).

ponytail: a short word list for obviously violent, explicit or drug text; Laya plan_ok (real) judges the rest.
"""

from __future__ import annotations

import re
import unicodedata

_BLOCK = re.compile(
    r"\b(kill(?:ing)?|murder\w*|shoot(?:ing)?|stab\w*|bomb\w*|rape\w*|nazi\w*|porn\w*|nudes?|naked|sex\w*|"
    r"cocaine|coke|meth|heroin|molly|mdma|fentanyl|weapons?|guns?)\b",
    re.I,
)


def blocked(text: str) -> bool:
    t = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return bool(_BLOCK.search(t))
