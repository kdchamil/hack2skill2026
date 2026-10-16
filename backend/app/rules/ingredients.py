"""Ingredient tokenisation and classification against the bundled dictionaries."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

from app.models import Extraction

from .taxonomy import ALLERGEN_IDS, Matcher, load_json, normalize, split_top_level

_MAY_SPLIT = re.compile(
    r"(may contain|traces of|trace of|produced in a facility|manufactured in a facility|made in a facility"
    r"|processed in a facility|manufactured on equipment)", re.I)
_CONTAINS_SPLIT = re.compile(r"\bcontains\s*:", re.I)
_ECODE = re.compile(r"(?<![a-z0-9])e(\d{3,4}[a-z]?)(?![a-z0-9])")


@lru_cache(maxsize=1)
def _matchers() -> dict[str, object]:
    al = load_json("allergens.json")
    direct = {k: sum(v["direct"].values(), []) for k, v in al["allergens"].items()}
    derived = {k: sum(v["derived"].values(), []) for k, v in al["allergens"].items()}
    excl = {normalize(k): normalize(v) for k, v in al["exclusions"].items()}
    add = load_json("additives.json")["additives"]
    common = load_json("common_ingredients.json")["ingredients"]
    groups = load_json("diets.json")["groups"]
    return {
        "direct": Matcher(direct),
        "derived": Matcher(derived),
        "excl": excl,
        "excl_rx": re.compile("|".join(re.escape(k) for k in sorted(excl, key=len, reverse=True))),
        "additives": Matcher({k: v["names"] + [k] for k, v in add.items()}),
        "add_data": add,
        "common": Matcher({k: v["terms"] for k, v in common.items()}),
        "common_data": common,
        "groups": Matcher({k: v["terms"] for k, v in groups.items()}),
        "group_data": groups,
    }


def additive_lookup(code: str) -> str | None:
    """Map an 'e150d'-style code to a dictionary key, falling back to the same number."""
    add = _matchers()["add_data"]
    m = re.fullmatch(r"e(\d+)([a-z]?)", code.casefold())
    if not m:
        return None
    key, base = f"E{m[1]}{m[2]}", f"E{m[1]}"
    if key in add:  # type: ignore[operator]
        return key
    if base in add:  # type: ignore[operator]
        return base
    for k in add:  # type: ignore[attr-defined]
        if re.sub(r"[a-z]+$", "", k) == base:
            return k
    return None


def scan_allergens(text: str | None) -> dict[str, tuple[str, bool]]:
    """allergen id -> (matched term, direct?). direct=False means derived from an ingredient."""
    m = _matchers()
    norm = normalize(text)
    if not norm:
        return {}
    norm = m["excl_rx"].sub(lambda x: m["excl"][x.group(0)], norm)  # type: ignore[attr-defined,index]
    out: dict[str, tuple[str, bool]] = {}
    for k, v in m["derived"].find(norm).items():  # type: ignore[attr-defined]
        out[k] = (v, False)
    for k, v in m["direct"].find(norm).items():  # type: ignore[attr-defined]
        out[k] = (v, True)
    return out


@dataclass
class Token:
    raw: str
    norm: str
    allergens: dict[str, tuple[str, bool]] = field(default_factory=dict)
    additives: dict[str, str] = field(default_factory=dict)  # dictionary code -> matched
    unknown_codes: list[str] = field(default_factory=list)
    common: dict[str, str] = field(default_factory=dict)  # common id -> matched
    groups: dict[str, str] = field(default_factory=dict)  # diet group -> matched
    resolved_to: str | None = None

    @property
    def recognised(self) -> bool:
        return bool(self.allergens or self.additives or self.common or self.groups or self.resolved_to)


@dataclass
class IngredientInfo:
    known: bool
    tokens: list[Token]
    unresolved: list[str]
    contains_statement: str
    may_statement: str
    from_may_tokens: list[str]

    def tag_hits(self, tag: str) -> list[str]:
        cd = _matchers()["common_data"]
        out: list[str] = []
        for t in self.tokens:
            for cid, matched in t.common.items():
                if tag in cd[cid]["tags"]:  # type: ignore[index]
                    out.append(matched)
        return out

    def additive_codes(self) -> list[str]:
        seen: list[str] = []
        for t in self.tokens:
            for c in t.additives:
                if c not in seen:
                    seen.append(c)
        return seen

    def group_hits(self, group: str) -> list[str]:
        return [t.groups[group] for t in self.tokens if group in t.groups]


def classify_token(raw: str, resolved: dict[str, str] | None = None) -> Token:
    m = _matchers()
    norm = normalize(raw)
    tok = Token(raw=raw, norm=norm)
    if resolved:
        for k, v in resolved.items():
            if normalize(k) == norm and v:
                tok.resolved_to = v
    tok.allergens = scan_allergens(raw)
    for code in _ECODE.findall(norm):
        key = additive_lookup("e" + code)
        if key:
            tok.additives[key] = "e" + code
        else:
            tok.unknown_codes.append("e" + code)
    for key, matched in m["additives"].find(norm).items():  # type: ignore[attr-defined]
        tok.additives.setdefault(key, matched)
    tok.common = m["common"].find(norm)  # type: ignore[attr-defined]
    tok.groups = m["groups"].find(norm)  # type: ignore[attr-defined]
    return tok


def split_verbatim(verbatim: str) -> tuple[list[str], str, str]:
    """Split an ingredients_verbatim string into (ingredient tokens, contains text, may-contain text)."""
    text = verbatim
    may = ""
    mm = _MAY_SPLIT.search(text)
    if mm:
        may = text[mm.start():]
        text = text[: mm.start()]
    contains = ""
    cm = _CONTAINS_SPLIT.search(text)
    if cm:
        contains = text[cm.end():]
        text = text[: cm.start()]
    return split_top_level(text), contains, may


def build_info(ext: Extraction, resolved: dict[str, str] | None = None) -> IngredientInfo:
    raw_tokens: list[str] = [t for t in (ext.ingredients.value or []) if t and t.strip()]
    contains_extra = ""
    may_extra = ""
    if not raw_tokens and ext.ingredients_verbatim.value and ext.ingredients_verbatim.value.strip():
        raw_tokens, contains_extra, may_extra = split_verbatim(ext.ingredients_verbatim.value)
    known = bool(raw_tokens)
    tokens: list[Token] = []
    from_may: list[str] = []
    for raw in raw_tokens:
        if _MAY_SPLIT.match(raw.strip().casefold()):
            from_may.append(raw)  # a "may contain ..." entry inside the list stays a may-contain item
            continue
        tokens.append(classify_token(raw, resolved))
    unresolved: list[str] = []
    for t in tokens:
        if not t.recognised or (t.unknown_codes and not t.resolved_to):
            if t.raw not in unresolved:
                unresolved.append(t.raw)
    contains_stmt = " ; ".join(
        x for x in [ext.allergen_contains_statement.value or "", contains_extra] if x)
    may_stmt = " ; ".join(
        x for x in [ext.allergen_may_contain_statement.value or "", may_extra, *from_may] if x)
    return IngredientInfo(known, tokens, unresolved, contains_stmt, may_stmt, from_may)


def is_allergen_id(x: str) -> bool:
    return x in ALLERGEN_IDS
