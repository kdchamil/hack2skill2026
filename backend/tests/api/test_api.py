import json

import pytest

from app.ai import commentary as cm
from app.models import Commentary
from tests.api.conftest import PNG, parse_sse, scan

FIX = {"fixture": "kokis_sesame_si_en"}


def test_sse_order(client):
    r = scan(client, **FIX)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    evs = parse_sse(r.text)
    assert [e for e, _ in evs] == ["analysis", "commentary", "done"]
    done = evs[-1][1]
    assert done["model_calls"] == 0 and done["cached"] is False
    assert done["commentary"]["source"] == "template"


def test_trace_has_all_tools(client):
    done = parse_sse(scan(client, **FIX).text)[-1][1]
    tools = {t["tool"] for t in done["trace"]}
    assert tools >= {"extract_label", "lookup_open_food_facts", "resolve_terms", "run_rules",
                     "check_claims", "write_commentary"}


def test_direct_pipeline(client, monkeypatch):
    monkeypatch.setenv("FIVESEC_PIPELINE", "direct")
    evs = parse_sse(scan(client, **FIX).text)
    assert [e for e, _ in evs] == ["analysis", "commentary", "done"]


def test_repeat_cached(client):
    first = parse_sse(scan(client, **FIX).text)[-1][1]
    second = parse_sse(scan(client, **FIX).text)[-1][1]
    assert second["cached"] is True and second["model_calls"] == 0
    assert second["scan_id"] == first["scan_id"]


def test_unexpected_field_400(client):
    assert scan(client, extra={"allergies": "peanut"}, **FIX).status_code == 400


def test_five_images_400(client):
    assert scan(client, n=5, **FIX).status_code == 400
    assert client.post("/api/scan", data={"lang": "en"}).status_code == 400


def test_bad_type_and_lang_and_size(client):
    r = client.post("/api/scan", files=[("images", ("a.gif", PNG, "image/gif"))])
    assert r.status_code == 400
    assert scan(client, lang="fr").status_code == 400
    big = b"x" * (5 * 1024 * 1024 + 1)
    r = client.post("/api/scan", files=[("images", ("a.png", big, "image/png"))])
    assert r.status_code == 400


def test_tts_503_in_mock(client):
    assert client.post("/api/tts", json={"text": "hi", "lang": "en"}).status_code == 503


def test_commentary_language_switch(client):
    done = parse_sse(scan(client, **FIX).text)[-1][1]
    r = client.post("/api/commentary", json={"scan_id": done["scan_id"], "lang": "si"})
    assert r.status_code == 200 and r.json()["lang"] == "si"
    assert client.post("/api/commentary", json={"scan_id": "nope", "lang": "en"}).status_code == 404


def test_report_and_health_and_fixtures(client):
    assert client.post("/api/report", json={"scan_id": "x", "note": "wrong"}).status_code == 202
    assert client.post("/api/report", json={"scan_id": "x", "allergies": "a"}).status_code == 400
    assert client.get("/api/health").json()["status"] == "ok"
    names = [f["name"] for f in client.get("/api/fixtures").json()]
    assert "kokis_sesame_si_en" in names


def test_prompt_injection_fixture(client):
    evs = parse_sse(scan(client, fixture="prompt_injection_label").text)
    assert [e for e, _ in evs] == ["analysis", "commentary", "done"]
    assert "safe" not in json.dumps(evs[1][1]).lower()


def test_security_headers(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["referrer-policy"] == "no-referrer"
    assert "camera=(self)" in h["permissions-policy"]


# ----- guards -----
def test_guard_numbers():
    assert cm.guard_numbers("820 mg sodium", {"820"})
    assert not cm.guard_numbers("999 mg sodium", {"820"})


def test_guard_words():
    assert cm.guard_words("one two three")
    assert not cm.guard_words(" ".join(["w"] * 13))
    assert cm.guard_words(" ".join(["w"] * 12))


def test_guard_safe():
    assert not cm.guard_not_safe("This is safe to eat")
    assert cm.guard_not_safe("May contain sesame; consider checking")


def test_guard_glossary():
    assert cm.guard_glossary("contains තල", ["sesame"], "si")
    assert not cm.guard_glossary("contains sesame", ["sesame"], "si")


def _analysis():
    from tests.api.conftest import _stub_analyze, STUB_FIXTURES
    return _stub_analyze(STUB_FIXTURES["kokis_sesame_si_en"])


def _out(**over):
    cards = [cm.CardOut(card=c, headline="May contain sesame", reason="Label lists sesame.") for c in cm.CARD_IDS]
    d = dict(summary="This may contain sesame; consider checking.", cards=cards)
    d.update(over)
    return cm.CommentaryOut(**d)


def test_apply_guards_ok_and_rejections():
    a = _analysis()
    com = cm.apply_guards(_out(), a, "en")
    assert com.source == "gemini"
    bad = [cm.CardOut(card="allergens", headline="May contain sesame 99 times", reason="x"),
           *[cm.CardOut(card=c, headline="Fine", reason="ok") for c in cm.CARD_IDS if c != "allergens"]]
    com = cm.apply_guards(_out(cards=bad, summary="It is safe"), a, "en")
    assert com.cards["allergens"] == cm.template_allergens_card(a, "en")  # always template
    assert "safe" not in com.summary
    long = [cm.CardOut(card="allergens", headline=" ".join(["sesame"] * 13), reason="r")]
    assert cm.apply_guards(_out(cards=long), a, "en").cards["allergens"] == cm.template_allergens_card(a, "en")


def test_template_si_ta():
    a = _analysis()
    for lang in ("si", "ta"):
        c = cm.template_commentary(a, lang)
        assert cm.GLOSSARY["allergens"]["sesame"][lang] in c.cards["allergens"]["headline"]
        assert set(c.cards) == set(cm.CARD_IDS)


# ----- non-mock parsing with faked Gemini -----
@pytest.mark.asyncio
async def test_extract_parsing_fake_gemini(monkeypatch):
    from app.ai import client as ai_client, extract
    from tests.api.conftest import STUB_FIXTURES
    monkeypatch.setenv("FIVESEC_MOCK", "0")
    seen = {}

    async def fake(**kw):
        seen.update(kw)
        return STUB_FIXTURES["kokis_sesame_si_en"].model_dump_json()

    monkeypatch.setattr(ai_client, "call_model", fake)
    ex, calls = await extract.extract_label([("image/png", PNG)], barcode="123")
    assert calls == 1 and ex.barcode == "123" and ex.name.value == "Kokis"
    assert "DATA" in seen["system"] and len(seen["parts"]) == 2


@pytest.mark.asyncio
async def test_commentary_and_resolve_fake_gemini(monkeypatch):
    from app.ai import client as ai_client
    monkeypatch.setenv("FIVESEC_MOCK", "0")
    a = _analysis().model_copy(update={"unresolved_terms": ["ulundu"]})
    out = _out(resolved=[cm.ResolvedTerm(token="ulundu", canonical_id="none", reason="pulse"),
                         cm.ResolvedTerm(token="other", canonical_id="soy", reason="x")])

    async def fake(**kw):
        assert "unresolved_terms" in kw["system"]
        return out.model_dump_json()

    monkeypatch.setattr(ai_client, "call_model", fake)
    com, resolved, calls = await cm.write_commentary(a, "en", "sid")
    assert calls == 1 and com.source == "gemini" and resolved == {}
    out.resolved = [cm.ResolvedTerm(token="ulundu", canonical_id="soy", reason="x")]
    com, resolved, calls = await cm.write_commentary(a, "si", "sid")
    assert resolved == {"ulundu": "soy"}


@pytest.mark.asyncio
async def test_commentary_model_failure_falls_back(monkeypatch):
    from app.ai import client as ai_client
    monkeypatch.setenv("FIVESEC_MOCK", "0")

    async def boom(**kw):
        raise RuntimeError("down")

    monkeypatch.setattr(ai_client, "call_model", boom)
    com, _, calls = await cm.write_commentary(_analysis(), "en", "s2")
    assert com.source == "template" and calls == 1


def test_fixture_in_live_mode_skips_extract(client, monkeypatch):
    """Judge fallback: demo fixture works without Gemini extraction; commentary is still live."""
    from app.ai import client as ai_client

    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setenv("FIVESEC_MOCK", "0")
    systems = []

    async def fake_call(*, model, system, parts, schema, **_kw):
        systems.append(system)
        return '{"summary":"A short summary.","cards":[],"resolved":[]}'

    monkeypatch.setattr(ai_client, "call_model", fake_call)
    evs = parse_sse(scan(client, **FIX).text)
    assert [e for e, _ in evs] == ["analysis", "commentary", "done"]
    done = evs[-1][1]
    assert len(systems) == 1 and "label-reading component" not in systems[0]
    assert done["model_calls"] == 1
    ex = next(t for t in done["trace"] if t["tool"] == "extract_label")
    assert ex["model_calls"] == 0
    assert scan(client, extra={"allergies": "peanut"}, **FIX).status_code == 400


def test_unknown_fixture_400(client):
    assert scan(client, fixture="nope_nope").status_code == 400


# ---- /api/report (correction queue) ----

def _log_lines(capsys):
    out = capsys.readouterr().out
    return [json.loads(line) for line in out.splitlines() if line.startswith("{") and "correction_report" in line]


def test_report_rejects_unknown_fields(client):
    for extra in ({"allergies": "a"}, {"profile": {"alias": "Amaya"}}, {"images": "x"}):
        assert client.post("/api/report", json={"scan_id": "x", **extra}).status_code == 400
    assert client.post("/api/report", json={"note": "no scan"}).status_code == 400
    assert client.post("/api/report", content=b"not json").status_code == 400
    assert client.post("/api/report", json=["scan_id"]).status_code == 400


def test_report_note_length_and_control_chars(client, capsys):
    assert client.post("/api/report", json={"scan_id": "x", "note": "a" * 501}).status_code == 400
    assert client.post("/api/report", json={"scan_id": "x", "note": "a" * 500}).status_code == 202
    capsys.readouterr()
    r = client.post("/api/report", json={"scan_id": "x", "note": "bad\x00\x07 line\nbreak\x1b[31m"})
    assert r.status_code == 202
    (line,) = _log_lines(capsys)
    assert not any(ord(c) < 32 or 127 <= ord(c) < 160 for c in line["note"])
    assert "bad" in line["note"] and "break" in line["note"]


def test_report_emits_structured_log_for_cached_scan(client, capsys):
    evs = parse_sse(scan(client, **FIX).text)
    done = evs[-1][1]
    scan_id = done["scan_id"]
    fid = evs[0][1]["findings"][0]["id"]
    capsys.readouterr()
    r = client.post("/api/report", json={"scan_id": scan_id, "finding_id": fid, "note": "label differs"})
    assert r.status_code == 202
    (line,) = _log_lines(capsys)
    assert set(line) == {"severity", "type", "report_id", "scan_id", "finding_id", "product_name", "rule_pack_version", "note"}
    assert line["severity"] == "NOTICE" and line["type"] == "correction_report"
    assert line["scan_id"] == scan_id and line["finding_id"] == fid and line["note"] == "label differs"
    assert line["product_name"] and line["rule_pack_version"]
    assert line["report_id"] == r.json()["report_id"]
    # a finding that is not in the cached scan is refused
    assert client.post("/api/report", json={"scan_id": scan_id, "finding_id": "nope"}).status_code == 400


def test_report_unknown_scan_id_accepted_with_null_product(client, capsys):
    capsys.readouterr()
    assert client.post("/api/report", json={"scan_id": "never-seen", "finding_id": "anything"}).status_code == 202
    (line,) = _log_lines(capsys)
    assert line["product_name"] is None and line["rule_pack_version"] is None and line["note"] is None


def test_report_rate_limit_per_scan(client):
    from app.api import routes
    routes._REPORT_COUNTS.clear()
    codes = [client.post("/api/report", json={"scan_id": "spam"}).status_code for _ in range(22)]
    assert codes[:20] == [202] * 20 and codes[20:] == [429, 429]
    assert client.post("/api/report", json={"scan_id": "other"}).status_code == 202


# ----- allergen wording: Contains / May contain never merged (code-built) -----
def _split_analysis():
    a = _analysis()
    f = a.facts.model_copy(update={"allergens_contains": ["soy", "wheat_gluten", "sesame"],
                                   "allergens_may_contain": ["peanut"], "ingredients_known": True})
    return a.model_copy(update={"facts": f})


@pytest.mark.parametrize("lang", ["en", "si", "ta"])
def test_merged_gemini_summary_is_separated(lang):
    a = _split_analysis()
    g, t = cm.GLOSSARY["allergens"], cm.GLOSSARY["templates"]
    merged = ", ".join(g[x][lang] for x in ("soy", "wheat_gluten", "sesame", "peanut"))
    out = _out(summary=f"{merged} may be present. Check the pack.")
    com = cm.apply_guards(out, a, lang)
    c = t["allergen_contains"][lang].format(list=", ".join(g[x][lang] for x in ("soy", "wheat_gluten", "sesame")))
    m = t["allergen_may"][lang].format(list=g["peanut"][lang])
    assert com.summary.startswith(f"{c} {m}")
    assert com.summary.count(g["peanut"][lang]) == 1  # appears only in the may-contain sentence
    assert "Check the pack." in com.summary if lang == "en" else True
    assert com.cards["allergens"] == {"headline": c, "reason": m}


def test_remainder_with_allergen_term_dropped():
    a = _split_analysis()
    out = _out(summary="තල අඩංගු විය හැක. සෝඩියම් ප්‍රමාණය සැලකිලිමත් වන්න.")
    com = cm.apply_guards(out, a, "si")
    assert "තල" not in com.summary.split(cm.allergen_sentence(a, "si"), 1)[1]
    assert com.summary.endswith("සෝඩියම් ප්‍රමාණය සැලකිලිමත් වන්න.")
    com = cm.apply_guards(_out(summary="Sesame is present."), a, "en")  # whole remainder dropped -> template
    assert com.summary == cm.full_summary(a, "en", cm.template_summary(a, "en"))


def test_allergen_sentence_none_and_unreadable():
    a = _analysis()
    none = a.model_copy(update={"facts": a.facts.model_copy(update={
        "allergens_contains": [], "allergens_may_contain": [], "ingredients_known": True})})
    unread = none.model_copy(update={"facts": none.facts.model_copy(update={"ingredients_known": False})})
    for lang in ("en", "si", "ta"):
        assert cm.allergen_sentence(none, lang) == cm.GLOSSARY["templates"]["allergen_none"][lang]
        assert cm.allergen_sentence(unread, lang) == cm.GLOSSARY["templates"]["allergen_unreadable"][lang]
