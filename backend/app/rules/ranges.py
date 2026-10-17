"""Product ranges: canonical grocery range ids with en/si/ta keywords (data/ranges.json). Longest keyword wins."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from .taxonomy import load_json, normalize


def ranges() -> list[dict[str, Any]]:
    return load_json("ranges.json")["ranges"]  # type: ignore[no-any-return]


@lru_cache(maxsize=1)
def _compiled() -> list[tuple[str, int, re.Pattern[str]]]:
    out: list[tuple[str, int, re.Pattern[str]]] = []
    for r in ranges():
        for kws in r["keywords"].values():
            for kw in kws:
                t = normalize(kw)
                if not t:
                    continue
                rx = r"(?<![a-z0-9])" + re.escape(t) + r"(?:s|es)?(?![a-z0-9])" if t.isascii() else re.escape(t)
                out.append((r["id"], len(t), re.compile(rx)))
    return out


def match_range(*texts: str | None) -> str | None:
    """Canonical range id for free text (product name, list line), or None. Longest keyword hit wins; ties keep file order."""
    norm = normalize(" ".join(t for t in texts if t))
    best: tuple[int, str] | None = None
    for rid, ln, rx in _compiled():
        if (best is None or ln > best[0]) and rx.search(norm):
            best = (ln, rid)
    return best[1] if best else None
