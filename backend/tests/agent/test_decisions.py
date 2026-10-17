"""Agent decisions: reshoot, barcode route, grounding, planet signal. No network: Gemini and httpx are faked."""

from __future__ import annotations

import asyncio

import pytest

from app.agent import steps
from app.agent.direct import run_direct
from app.agent.steps import ScanState
from app.ai import commentary as com_mod
from app.ai import grounding
from app.ai.extract import mock_extract
from app.models import Legible

ODD = "zorbitol quillaja"


def _ex(name="kokis_sesame_si_en", barcode="4791234567890", odd=False):
    ex = mock_extract(name, None)
    upd = {"barcode": barcode}
    if odd:
        toks = [*(ex.ingredients.value or []), ODD]
        upd["ingredients"] = Legible[list[str]](value=toks, confidence=0.9)
    return ex.model_copy(update=upd)


class Env:
    def __init__(self):
        self.events: list[str] = []
        self.http_calls = 0
        self.ground_calls = 0


@pytest.fixture
def env(monkeypatch):
    """Non-mock mode with every external call faked."""
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-proj")
    monkeypatch.setenv("FIVESEC_MOCK", "0")
    e = Env()
    e.extraction = _ex()
    e.off_payload = {"status": 1, "product": {
        "product_name": "Kokis", "brands": "X", "ecoscore_grade": "c", "ecoscore_score": 52.4,
        "packaging_tags": ["en:plastic"]}}

    async def fake_extract(images, barcode, fixture):
        return e.extraction, 1

    async def fake_commentary(analysis, lang, scan_id, **kw):
        return com_mod.template_commentary(analysis, lang), {}, 1

    class Resp:
        status_code = 200

        def json(self):
            return e.off_payload

    class Client:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def get(self, url, **kw):
            e.http_calls += 1
            e.http_url, e.http_params = url, kw.get("params")
            return Resp()

    async def fake_generate(terms):
        e.ground_calls += 1
        return e.ground_text(terms), e.ground_sources

    e.ground_text = lambda terms: f"{terms[0]} | sesame | derived from sesame seed"
    e.ground_sources = [("https://example.org/g", "Example")]
    monkeypatch.setattr(steps, "ai_extract", fake_extract)
    monkeypatch.setattr(com_mod, "write_commentary", fake_commentary)
    monkeypatch.setattr(steps.httpx, "AsyncClient", Client)
    monkeypatch.setattr(grounding, "_generate", fake_generate)
    return e


def run(e, barcode=None):
    async def emit(ev, data):
        e.events.append(ev)

    st = ScanState(images=[("image/png", b"x")], barcode=barcode, lang="en", market="SG", fixture=None, emit=emit)
    resp = asyncio.run(run_direct(st))
    return st, resp


def entry(resp, tool):
    return next(t for t in resp.trace if t["tool"] == tool)


# --- decision 1: reshoot ---------------------------------------------------------------------------------------

def test_reshoot_when_ingredients_unreadable(env):
    env.extraction = _ex("blurred_label", barcode=None)
    st, resp = run(env)
    d = entry(resp, "assess_capture")
    assert d["decision"] == "needs_reshoot" and "ingredients" in d["fields"]
    f = next(f for f in resp.analysis.findings if f.id == "capture.reshoot_ingredients")
    assert f.severity == "info" and f.next_step
    assert "capture.reshoot_ingredients" in next(a for a in resp.analysis.areas if a.id == "truth").finding_ids
    assert "needs_reshoot" in env.events


def test_reshoot_when_allergen_statement_low_confidence(env):
    ex = _ex()
    env.extraction = ex.model_copy(update={"allergen_contains_statement": Legible[str](value=None, confidence=0.3)})
    _, resp = run(env)
    assert entry(resp, "assess_capture")["fields"] == ["allergen_statement"]


def test_no_reshoot_when_legible(env):
    _, resp = run(env)
    assert entry(resp, "assess_capture")["decision"] == "proceed"
    assert not any(f.id.startswith("capture.") for f in resp.analysis.findings)
    assert "needs_reshoot" not in env.events


# --- decision 2: barcode route ---------------------------------------------------------------------------------

def test_barcode_calls_off_with_eco_fields(env):
    _, resp = run(env)
    t = entry(resp, "lookup_open_food_facts")
    assert t["decision"] == "call" and env.http_calls == 1
    assert "ecoscore_grade" in env.http_params["fields"] and "ecoscore_score" in env.http_params["fields"]


def test_no_barcode_skips_off(env):
    env.extraction = _ex(barcode=None)
    _, resp = run(env)
    t = entry(resp, "lookup_open_food_facts")
    assert t["decision"] == "skip" and t["reason"] == "no barcode" and env.http_calls == 0


def test_mock_mode_makes_no_network_calls(env, monkeypatch):
    monkeypatch.setenv("FIVESEC_MOCK", "1")
    env.extraction = _ex(odd=True)
    _, resp = run(env)
    assert env.http_calls == 0 and env.ground_calls == 0
    assert entry(resp, "lookup_open_food_facts")["decision"] == "skip"
    assert entry(resp, "resolve_terms")["decision"] == "skip"


# --- planet signal ---------------------------------------------------------------------------------------------

def test_ecoscore_finding(env):
    _, resp = run(env)
    f = next(f for f in resp.analysis.findings if f.id == "planet.ecoscore")
    assert f.area == "planet" and f.tier == "verified" and f.card is None
    assert f.sources[0].url == "https://world.openfoodfacts.org/product/4791234567890"
    assert "safe" not in (f.title + f.reason).lower()
    assert f.data["ecoscore_grade"] == "c"
    assert "planet.ecoscore" in next(a for a in resp.analysis.areas if a.id == "planet").finding_ids


def test_ecoscore_does_not_change_grade(env):
    _, with_eco = run(env)
    env.off_payload = {"status": 1, "product": {"product_name": "Kokis"}}
    _, without = run(env)
    assert with_eco.analysis.grade == without.analysis.grade
    assert not any(f.id == "planet.ecoscore" for f in without.analysis.findings)


@pytest.mark.parametrize("g", ["unknown", "not-applicable", None])
def test_ecoscore_ignored_when_not_a_grade(env, g):
    env.off_payload = {"status": 1, "product": {"product_name": "Kokis", "ecoscore_grade": g}}
    _, resp = run(env)
    assert not any(f.id == "planet.ecoscore" for f in resp.analysis.findings)


# --- decision 3: grounding -------------------------------------------------------------------------------------

def test_grounding_resolves_term_with_source(env):
    env.extraction = _ex(odd=True)
    st, resp = run(env)
    t = entry(resp, "resolve_terms")
    assert t["decision"] == "ground" and t["resolved"] == 1 and t["model_calls"] == 1
    assert env.ground_calls == 1
    assert st.resolved[ODD] == "sesame"
    f = next(f for f in resp.analysis.findings if f.category == "grounding")
    assert f.tier == "inferred" and f.sources[0].url == "https://example.org/g"
    assert ODD not in resp.analysis.unresolved_terms
    assert sum(1 for t in resp.trace if t["tool"] == "run_rules") == 2  # re-ran rules once with grounded facts
    assert resp.model_calls == 3  # extract + grounding + commentary


def test_grounding_failure_falls_back_silently(env, monkeypatch):
    env.extraction = _ex(odd=True)

    async def boom(terms):
        raise RuntimeError("vertex down")

    monkeypatch.setattr(grounding, "_generate", boom)
    st, resp = run(env)
    t = entry(resp, "resolve_terms")
    assert t["resolved"] == 0 and t["fallback"] == "merged into write_commentary"
    assert ODD in resp.analysis.unresolved_terms
    assert sum(1 for t in resp.trace if t["tool"] == "run_rules") == 1
    assert resp.commentary is not None


def test_grounding_timeout(env, monkeypatch):
    env.extraction = _ex(odd=True)
    monkeypatch.setattr(grounding, "GROUNDING_TIMEOUT_S", 0.05)

    async def slow(terms):
        await asyncio.sleep(1)
        return "", []

    monkeypatch.setattr(grounding, "_generate", slow)
    _, resp = run(env)
    assert entry(resp, "resolve_terms")["resolved"] == 0


def test_no_unresolved_terms_skips_grounding(env):
    _, resp = run(env)
    t = entry(resp, "resolve_terms")
    assert t["decision"] == "skip" and t["reason"] == "no unresolved terms" and env.ground_calls == 0


def test_grounding_requires_url_and_valid_id():
    terms = ["a", "b"]
    assert grounding.parse("a | sesame | r", terms, []) == []  # no grounding evidence
    got = grounding.parse("a | sesame | r\nb | made up | r\nc | e621 | r", terms, [("https://u", None)])
    assert [(g.token, g.canonical_id) for g in got] == [("a", "sesame")]
    assert grounding.parse("a | e621 | r", terms, [("https://u", None)])[0].canonical_id == "E621"


def test_grounding_caps_terms(env, monkeypatch):
    seen = {}

    async def spy(terms):
        seen["terms"] = terms
        return "", []

    monkeypatch.setattr(grounding, "_generate", spy)
    asyncio.run(grounding.ground_terms(["a", "b", "c", "d", "e"]))
    assert seen["terms"] == ["a", "b", "c"]


# --- shared policy / ADK ---------------------------------------------------------------------------------------

def test_adk_agent_uses_same_policy(env):
    from app.agent.adk_agent import run_adk

    env.extraction = _ex(odd=True)

    async def emit(ev, data): ...

    st = ScanState(images=[("image/png", b"x")], barcode=None, lang="en", market="SG", fixture=None, emit=emit)
    resp = asyncio.run(run_adk(st))
    tools = [t["tool"] for t in resp.trace]
    assert tools == ["extract_label", "assess_capture", "lookup_open_food_facts", "run_rules", "resolve_terms",
                     "run_rules", "write_commentary"]
    assert not any(t in ("check_claims",) for t in tools)
