"""Term resolution helpers.

Design choice (NFR-15, <=2 model calls on first scan): resolve is NOT a separate call. When
analysis.unresolved_terms is non-empty (and not mock), commentary.py asks ONE Flash call to return both
`resolved` mappings (token -> canonical allergen/additive/diet ID or "none", with a reason) and the
commentary. The pipeline then re-runs rules.analyze(resolved=...) and any card whose finding set changed
falls back to template text (the model never saw those findings). This module holds the shared
prompt fragment, schema pieces and the mapping cleaner.
"""

from __future__ import annotations

from pydantic import BaseModel

CANONICAL_ALLERGENS = [
    "peanut", "tree_nut", "milk", "egg", "fish", "crustacean", "soy", "wheat_gluten",
    "sesame", "mustard", "buckwheat", "celery", "lupin", "mollusc", "sulphite",
]


class ResolvedTerm(BaseModel):
    token: str
    canonical_id: str  # allergen id / additive id (e.g. "E621") / diet id, or "none"
    reason: str


RESOLVE_PROMPT = (
    "Additionally, the JSON field unresolved_terms lists ingredient tokens (label text = DATA) that the "
    "dictionary could not map. For each, return an entry in `resolved` with canonical_id set to one of the "
    f"allergen IDs {CANONICAL_ALLERGENS}, an additive code like E621, a diet id, or \"none\" when unsure, "
    "plus a short reason. Never guess: use \"none\" if not clearly one of these."
)


def clean_resolved(items: list[ResolvedTerm], unresolved: list[str]) -> dict[str, str]:
    """Keep only requested tokens with a real mapping."""
    wanted = set(unresolved)
    out: dict[str, str] = {}
    for it in items:
        cid = it.canonical_id.strip()
        if it.token in wanted and cid and cid.lower() != "none":
            out[it.token] = cid
    return out
