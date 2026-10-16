import pytest

from app.rules import analyze
from app.rules.packaging import parse_code
from tests.rules.helpers import TODAY, mk


@pytest.mark.parametrize("raw,code,mat", [
    ("PET 1", "PET 1", "PET"), ("PP 5", "PP 5", "polypropylene"), ("♻ 05 PP", "PP 5", "polypropylene"),
    ("HDPE 2", "HDPE 2", "high-density"), ("2", "HDPE 2", "high-density"), ("♷", "PP 5", "polypropylene"),
    ("PE-LD 4", "LDPE 4", "low-density"), ("PVC", "PVC 3", "polyvinyl"), ("PS 6", "PS 6", "polystyrene"),
    ("OTHER 7", "OTHER 7", "Other plastics"), ("PAP 20", "PAP 20", "Corrugated"), ("PAP 22", "PAP 22", "Paper"),
    ("C/PAP 81", "C/PAP 81", "plastic"), ("C/PAP 84", "C/PAP 84", "aluminium"), ("ALU 41", "ALU 41", "Aluminium"),
    ("GL 70", "GL 70", "Glass"), ("GL 72", "GL 72", "brown"), ("FE 40", "FE 40", "Steel"), ("ALU", "ALU 41", "Aluminium"),
])
def test_parse_code(raw, code, mat):
    p = parse_code(raw)
    assert p["code"] == code and mat.lower() in p["material"].lower()


def test_unparseable_code():
    assert parse_code("recycle me") is None
    assert parse_code("99") is None


def test_findings_label_stated_and_carbon_unknown():
    a = analyze(mk(["a"], codes=["PP 5"]), today=TODAY)
    f = next(x for x in a.findings if x.category == "packaging")
    assert f.tier == "label_stated" and f.data["number"] == 5
    c = next(x for x in a.findings if x.category == "carbon")
    assert c.tier == "unknown" and "no reliable data" in c.title.lower()
    assert a.cards[5].tier == "label_stated"  # carbon is not a key finding for the tier


def test_no_codes_still_has_carbon():
    a = analyze(mk(["a"]), today=TODAY)
    assert any(f.id == "packaging.code.none" for f in a.findings)
    assert any(f.category == "carbon" for f in a.findings)
    assert a.cards[5].headline == "No recycling code read; carbon: no data"


def test_duplicate_codes_deduped():
    a = analyze(mk(["a"], codes=["PP 5", "♻ 05 PP"]), today=TODAY)
    assert len([f for f in a.findings if f.category == "packaging"]) == 1
