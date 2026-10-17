"""Fixtures for API tests (real rules engine and fixtures, mock mode)."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("FIVESEC_MOCK", raising=False)
    monkeypatch.delenv("FIVESEC_PIPELINE", raising=False)
    monkeypatch.setenv("WEB_DIST", "/nonexistent")
    monkeypatch.setenv("FIVESEC_RATE_LIMIT", "0")  # rate tests switch it back on
    monkeypatch.setenv("FIVESEC_CACHE", "memory")
    from app.agent import pipeline
    from app.store import reset_caches, reset_limits
    pipeline._BY_KEY.clear(); pipeline.SCANS.clear(); reset_caches(); reset_limits()


@pytest.fixture
def client():
    from app.main import create_app
    return TestClient(create_app())


def parse_sse(text: str):
    import json
    out = []
    for block in text.strip().split("\n\n"):
        ev, data = None, None
        for line in block.splitlines():
            if line.startswith("event: "):
                ev = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        out.append((ev, data))
    return out


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def scan(client, n=1, extra=None, **fields):
    files = [("images", (f"i{i}.png", PNG + bytes([i]), "image/png")) for i in range(n)]
    data = {"lang": "en", **fields, **(extra or {})}
    return client.post("/api/scan", files=files, data=data)
