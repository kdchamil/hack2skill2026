"""Shared constants, text normalisation, term matching and finding helpers. No model calls."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.models import Finding, Severity, Source, Tier

RULE_PACK_VERSION = "2026.10.17-1"
DATA_DIR = Path(__file__).parent / "data"

ALLERGEN_IDS: list[str] = [
    "peanut", "tree_nut", "milk", "egg", "fish", "crustacean", "soy", "wheat_gluten",
    "sesame", "mustard", "buckwheat", "celery", "lupin", "mollusc", "sulphite",
]
ALLERGEN_LABELS: dict[str, str] = {
    "peanut": "peanut", "tree_nut": "tree nuts", "milk": "milk", "egg": "egg", "fish": "fish",
    "crustacean": "crustaceans", "soy": "soy", "wheat_gluten": "wheat/gluten", "sesame": "sesame",
    "mustard": "mustard", "buckwheat": "buckwheat", "celery": "celery", "lupin": "lupin",
    "mollusc": "molluscs", "sulphite": "sulphites",
}
DIETS: list[str] = ["vegan", "vegetarian", "gluten_free", "lactose_free", "halal", "kosher"]

TIER_ORDER: dict[str, int] = {"unknown": 0, "inferred": 1, "label_stated": 2, "verified": 3}
SEVERITY_ORDER: dict[str, int] = {"good": 0, "info": 1, "check": 2, "avoid": 3}
CARD_ORDER: list[str] = ["allergens", "nutrition", "diet", "ingredients", "claims", "packaging"]


def weakest(tiers: list[str]) -> Tier:
    """Weakest tier among the given tiers; never upgrades. Empty -> unknown."""
    if not tiers:
        return "unknown"
    return min(tiers, key=lambda t: TIER_ORDER[t])  # type: ignore[return-value]


def strongest(tiers: list[str]) -> Tier:
    return max(tiers, key=lambda t: TIER_ORDER[t])  # type: ignore[return-value]


def worst(severities: list[str]) -> Severity:
    if not severities:
        return "info"
    return max(severities, key=lambda s: SEVERITY_ORDER[s])  # type: ignore[return-value]


@lru_cache(maxsize=None)
def load_json(name: str) -> dict[str, Any]:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


_BRACKETS = str.maketrans({c: " " for c in "()[]{}（）［］【】「」『』<>"})
_ENUM = re.compile(r"(?<![a-z0-9])(?:e|ins)[\s\-]?(\d{3,4}[a-z]?)(?![a-z0-9])")


def normalize(text: str | None) -> str:
    """NFKC + casefold, brackets turned into spaces (contents are still scanned),
    E/INS numbers canonicalised to e<digits>, whitespace collapsed."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text).casefold().translate(_BRACKETS)
    t = _ENUM.sub(lambda m: "e" + m.group(1), t)
    return re.sub(r"\s+", " ", t).strip()


class Matcher:
    """Compiled term matcher. Latin terms match on word boundaries (optional plural);
    other scripts match as substrings."""

    def __init__(self, table: dict[str, list[str]]):
        self._res: dict[str, re.Pattern[str]] = {}
        for key, terms in table.items():
            parts: list[str] = []
            for term in sorted({normalize(t) for t in terms if normalize(t)}, key=len, reverse=True):
                if term.isascii():
                    parts.append(r"(?<![a-z0-9])" + re.escape(term) + r"(?:s|es)?(?![a-z0-9])")
                else:
                    parts.append(re.escape(term))
            if parts:
                self._res[key] = re.compile("|".join(parts))

    def find(self, norm_text: str) -> dict[str, str]:
        """Return {key: matched substring} for every key with a hit."""
        out: dict[str, str] = {}
        if not norm_text:
            return out
        for key, rx in self._res.items():
            m = rx.search(norm_text)
            if m:
                out[key] = m.group(0)
        return out


def split_top_level(text: str) -> list[str]:
    """Split an ingredient string on commas/semicolons outside brackets."""
    out: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in text:
        if ch in "([{（［":
            depth += 1
        elif ch in ")]}）］":
            depth = max(0, depth - 1)
        if ch in ",;、，।\n" and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur).strip())
    return [t for t in out if t]


def src_rules() -> Source:
    return Source(label=f"Rule pack {RULE_PACK_VERSION}")


def src_label() -> Source:
    return Source(label="Pack label")


def make_finding(
    fid: str, card: str, category: str, severity: str, risk: str, tier: str,
    title: str, reason: str, next_step: str | None = None, data: dict[str, Any] | None = None,
    label_read: bool = True, extra_sources: list[Source] | None = None,
) -> Finding:
    sources = [src_rules()]
    if label_read:
        sources.append(src_label())
    sources.extend(extra_sources or [])
    return Finding(
        id=fid, card=card, category=category, severity=severity, risk=risk, tier=tier,  # type: ignore[arg-type]
        title=title, reason=reason, next_step=next_step, sources=sources, data=data or {},
    )


PRO = " Check with a professional."
