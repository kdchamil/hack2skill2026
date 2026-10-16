"""Demo fixture loader. Fixtures are Extraction JSON with an ignored top-level "_title"."""

from __future__ import annotations

import json
from pathlib import Path

from app.models import Extraction

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _raw(name: str) -> dict:
    if not name.replace("_", "").isalnum():
        raise KeyError(name)
    path = FIXTURE_DIR / f"{name}.json"
    if not path.is_file():
        raise KeyError(name)
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixture(name: str) -> Extraction:
    data = _raw(name)
    data.pop("_title", None)
    return Extraction.model_validate(data)


def list_fixtures() -> list[dict[str, str]]:
    out = []
    for p in sorted(FIXTURE_DIR.glob("*.json")):
        out.append({"name": p.stem, "title": str(json.loads(p.read_text(encoding="utf-8")).get("_title", p.stem))})
    return out
