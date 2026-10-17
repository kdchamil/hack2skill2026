from tests.api.conftest import scan

IMG = [("images", ("i.png", b"\x89PNG0", "image/png"))]


def _on(monkeypatch, per_min="3", daily="300"):
    monkeypatch.setenv("FIVESEC_RATE_LIMIT", "1")
    monkeypatch.setenv("FIVESEC_RATE_PER_MIN", per_min)
    monkeypatch.setenv("FIVESEC_DAILY_BUDGET", daily)


def test_scan_429_with_json_detail(client, monkeypatch):
    _on(monkeypatch)
    h = {"x-forwarded-for": "5.5.5.5"}
    for _ in range(3):
        assert client.post("/api/scan", files=IMG, headers=h).status_code == 200
    r = client.post("/api/scan", files=IMG, headers=h)
    assert r.status_code == 429 and "detail" in r.json()
    assert client.post("/api/scan", files=IMG, headers={"x-forwarded-for": "6.6.6.6"}).status_code == 200


def test_fixture_scans_not_throttled(client, monkeypatch):
    _on(monkeypatch, per_min="1")
    for _ in range(5):
        assert scan(client, fixture="kokis_sesame_si_en").status_code == 200


def test_invalid_scan_does_not_consume_tokens(client, monkeypatch):
    _on(monkeypatch, per_min="1")
    for _ in range(3):
        assert client.post("/api/scan", data={"lang": "en"}).status_code == 400


def test_daily_budget(client, monkeypatch):
    _on(monkeypatch, per_min="100", daily="2")
    body = {"text": "rice", "lang": "en"}
    assert client.post("/api/list/parse", json=body).status_code == 200
    assert client.post("/api/list/parse", json=body).status_code == 200
    r = client.post("/api/list/parse", json=body)
    assert r.status_code == 429 and "detail" in r.json()


def test_tts_and_commentary_limited(client, monkeypatch):
    _on(monkeypatch, per_min="1")
    assert client.post("/api/tts", json={"text": "hi", "lang": "en"}).status_code == 503
    assert client.post("/api/tts", json={"text": "hi", "lang": "en"}).status_code == 429
    assert client.post("/api/commentary", json={"scan_id": "x", "lang": "en"}).status_code == 429
