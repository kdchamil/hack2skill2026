"""Rules-only baseline: OCR text -> backend allergen dictionary + regex.

The baseline gets no structured fields (no Extraction, no statements, no nutrition
rows). It sees one raw text blob and matches allergen synonyms in it. The only
contains / may-contain split is a regex on "may contain" (text before it is
"contains", text after it is "may contain").

OCR backends:
  cloudvision  Google Cloud Vision document_text_detection (ADC). Imported lazily.
  fixture_text Offline: ingredients_verbatim + statements (+ claims, dates, nutrition
               rendered as lines) from the fixture JSON, as if OCR returned them.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

OCR_BACKENDS = ("cloudvision", "fixture_text")

MAY_RE = re.compile(r"may\s+contain|may\s+also\s+contain|traces?\s+of|produced\s+in\s+a\s+facility", re.IGNORECASE)
SODIUM_RE = re.compile(r"sodium[^\d\n]{0,20}?(\d+(?:\.\d+)?)\s*mg", re.IGNORECASE)
SUGARS_RE = re.compile(r"sugars?[^\d\n]{0,20}?(\d+(?:\.\d+)?)\s*g\b", re.IGNORECASE)
BEST_BEFORE_RE = re.compile(
    r"(?:best\s*before|use\s*by|\bbb\b|\bexp(?:iry)?\b|expires?)[^\d\n]{0,20}?"
    r"(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
    re.IGNORECASE,
)
# English-only claim phrases a rules-only system would know. Sinhala/Tamil claims are not matched.
CLAIM_PATTERNS: list[tuple[str, str]] = [
    (r"sugar[\s-]*free", "sugar free"),
    (r"no\s+added\s+sugars?", "no added sugar"),
    (r"no\s+added\s+msg", "no added msg"),
    (r"\bvegan\b", "vegan"),
    (r"gluten[\s-]*free", "gluten free"),
    (r"lactose[\s-]*free", "lactose free"),
]
NUTRIENT_LABEL = {
    "sodium_mg": "Sodium", "sugars_total": "Sugars", "sugars_added": "Added sugars",
    "energy_kcal": "Energy", "fat_total": "Fat", "fat_saturated": "Saturated fat",
    "fat_trans": "Trans fat", "protein": "Protein", "fibre": "Fibre",
    "carbohydrate": "Carbohydrate", "salt_g": "Salt",
}


def dictionary_allergens(text: str) -> set[str]:
    """Allergen matching from the backend dictionary on raw text only (rules.ingredients.scan_allergens).

    Uses no structured fields: no tokens, no contains/may statements, no resolved terms.
    """
    if not text.strip():
        return set()
    try:
        from app.rules.ingredients import scan_allergens  # owned by the rules agent
    except ImportError as exc:
        raise NotImplementedError(f"app.rules.ingredients.scan_allergens not available yet: {exc}") from exc
    return set(scan_allergens(text).keys())


def _parse_date(raw: str) -> str | None:
    raw = raw.strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", raw)
        if not m:
            return None
        d, mo, y = map(int, m.groups())  # day-first, as on Sri Lankan and Singapore packs
        if y < 100:
            y += 2000
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def parse_text(text: str) -> dict[str, Any]:
    """Regex and dictionary extraction from one raw text blob."""
    m = MAY_RE.search(text)
    head, tail = (text, "") if m is None else (text[: m.start()], text[m.start():])
    contains = dictionary_allergens(head)
    may = dictionary_allergens(tail) - contains

    sodium = SODIUM_RE.search(text)
    sugars = SUGARS_RE.search(text)
    bb = BEST_BEFORE_RE.search(text)
    claims: list[str] = []
    for pattern, canonical in CLAIM_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            claims.append(canonical)
    return {
        "contains": contains,
        "may": may,
        "sodium_mg": float(sodium.group(1)) if sodium else None,
        "sugars_g": float(sugars.group(1)) if sugars else None,
        "claims": claims,
        "best_before_iso": _parse_date(bb.group(1)) if bb else None,
    }


def _v(fx: dict[str, Any], key: str) -> Any:
    """Unwrap a Legible field the same way the Legible validator does (confidence < 0.6 -> None)."""
    x = fx.get(key)
    if isinstance(x, dict) and "value" in x:
        if x.get("value") is None or float(x.get("confidence", 1.0)) < 0.6:
            return None
        return x["value"]
    return x


def fixture_text(fx: dict[str, Any]) -> str:
    """'fixture_text' OCR: render the fixture's printed content as the text OCR would return."""
    lines: list[str] = []
    for key in ("ingredients_verbatim", "allergen_contains_statement", "allergen_may_contain_statement"):
        val = _v(fx, key)
        if val:
            lines.append(str(val))
    for claim in _v(fx, "claims") or []:
        lines.append(str(claim))
    for d in _v(fx, "dates") or []:
        lines.append(f"{d.get('raw', '')}")
    for row in _v(fx, "nutrition") or []:
        if row.get("per_100g") is not None:
            label = NUTRIENT_LABEL.get(row["nutrient"], row["nutrient"])
            lines.append(f"{label} {row['per_100g']:g} {row.get('unit', '')}".rstrip())
    return "\n".join(lines)


_vision_client: Any = None


def cloudvision_text(image_paths: list[Path]) -> str:
    """'cloudvision' OCR: document_text_detection per image, joined. Needs ADC and google-cloud-vision."""
    global _vision_client
    try:
        from google.cloud import vision  # lazy: not in backend deps
    except ImportError as exc:
        raise RuntimeError("google-cloud-vision not installed (uv add google-cloud-vision)") from exc
    if _vision_client is None:
        _vision_client = vision.ImageAnnotatorClient()
    ctx = vision.ImageContext(language_hints=["en", "si", "ta"])
    parts: list[str] = []
    for p in image_paths:
        resp = _vision_client.document_text_detection(
            image=vision.Image(content=p.read_bytes()), image_context=ctx
        )
        if resp.error.message:
            raise RuntimeError(f"Cloud Vision error on {p.name}: {resp.error.message}")
        parts.append(resp.full_text_annotation.text)
    return "\n".join(parts)


def run_baseline(text: str) -> dict[str, Any]:
    """Baseline prediction from raw OCR text. Same shape as the pipeline prediction."""
    return parse_text(text)
