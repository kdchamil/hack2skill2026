from datetime import date

import pytest

from app.rules import analyze
from app.rules.dates import parse_date
from tests.rules.helpers import area, TODAY, mk


def d(raw, kind="best_before"):
    return {"kind": kind, "raw": raw, "iso": None}


@pytest.mark.parametrize("raw,iso,inferred", [
    ("BB 12 OCT 2026", "2026-10-12", False),
    ("BEST BEFORE 12OCT26", "2026-10-12", False),
    ("EXP 10/2026", "2026-10-31", True),
    ("exp 02/2028", "2028-02-29", True),
    ("11/2026", "2026-11-30", True),
    ("2026-10-19", "2026-10-19", False),
    ("25/12/2026", "2026-12-25", False),
    ("25.12.26", "2026-12-25", False),
    ("05/09/2026", "2026-09-05", True),
    ("12/12/2026", "2026-12-12", False),
    ("12/25/2026", "2026-12-25", True),
    ("කල් ඉකුත් වන දිනය 15/03/2027", "2027-03-15", False),
    ("காலாவதி 01.01.2028", "2028-01-01", False),
    ("USE BY SEPT 2027", "2027-09-30", True),
    ("2027/03", "2027-03-31", True),
])
def test_parse(raw, iso, inferred):
    p = parse_date(raw)
    assert p is not None and p.value.isoformat() == iso and p.inferred is inferred


@pytest.mark.parametrize("raw", ["", "no date here", "31/02/2026", "99/99/9999", "13/2026", "2026-13-40"])
def test_unparseable(raw):
    assert parse_date(raw) is None


def test_expired_banner_and_severity():
    a = analyze(mk(["a"], dates=[d("01/09/2026", "expiry")]), today=TODAY)
    f = next(x for x in a.findings if x.id == "date.expiry")
    assert f.severity == "avoid" and f.tier == "inferred"
    assert "expired:2026-09-01" in a.banners
    assert area(a, "body").status == "avoid" and area(a, "body").headline.endswith("; date passed")
    assert f.area == "body" and f.topic == "dates" and f.card is None


def test_near_expiry_window_inclusive():
    a = analyze(mk(["a"], dates=[d("24 OCT 2026")]), today=TODAY)
    assert "near_expiry:2026-10-24" in a.banners
    b = analyze(mk(["a"], dates=[d("25 OCT 2026")]), today=TODAY)
    assert b.banners == []
    c = analyze(mk(["a"], dates=[d("17 OCT 2026")]), today=TODAY)
    assert "near_expiry:2026-10-17" in c.banners
    e = analyze(mk(["a"], dates=[d("16 OCT 2026")]), today=TODAY)
    assert "expired:2026-10-16" in e.banners


def test_iso_filled_by_rules_and_model_iso_ignored():
    raw = {"kind": "best_before", "raw": "12 OCT 2030", "iso": "1999-01-01"}
    a = analyze(mk(["a"], dates=[raw]), today=TODAY)
    assert a.product.dates.value[0].iso == "2030-10-12"


def test_unreadable_date_and_mfg_ignored():
    a = analyze(mk(["a"], dates=[d("smudge"), d("01/01/2020", "mfg")]), today=TODAY)
    assert a.banners == []
    assert any(f.id == "date.best_before" and f.tier == "unknown" for f in a.findings)
    assert not any(f.id == "date.mfg" for f in a.findings)


def test_default_today_used():
    a = analyze(mk(["a"], dates=[d("01/01/2001")]))
    assert any(b.startswith("expired:") for b in a.banners)


def test_duplicate_kinds_get_unique_ids():
    a = analyze(mk(["a"], dates=[d("12 OCT 2030"), d("13 OCT 2030")]), today=TODAY)
    ids = [f.id for f in a.findings if f.category == "date"]
    assert ids == ["date.best_before", "date.best_before.1"]
