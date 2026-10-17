"""Cache backends with a fake Firestore client; no network."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.store import cache as C


class FakeSnap:
    def __init__(self, d):
        self._d = d
        self.exists = d is not None

    def to_dict(self):
        return self._d


class FakeDoc:
    def __init__(self, store, key, fail):
        self.store, self.key, self.fail = store, key, fail

    async def get(self):
        if self.fail():
            raise RuntimeError("boom")
        return FakeSnap(self.store.get(self.key))

    async def set(self, d):
        if self.fail():
            raise RuntimeError("boom")
        self.store[self.key] = d


class FakeCol:
    def __init__(self, store, fail):
        self.store, self.fail = store, fail

    def document(self, k):
        return FakeDoc(self.store, k, self.fail)


class FakeClient:
    def __init__(self):
        self.cols: dict[str, dict] = {}
        self.broken = False
        self.calls = 0

    def _fail(self):
        self.calls += 1
        return self.broken

    def collection(self, name):
        return FakeCol(self.cols.setdefault(name, {}), self._fail)


def make(client, ns="commentary"):
    return C.Cache(ns, remote=C.FirestoreBackend(ns, client=client))


def test_memory_lru_evicts_oldest():
    m = C.MemoryBackend(2)
    m.put("a", b"1"); m.put("b", b"2"); m.get("a"); m.put("c", b"3")
    assert m.get("b") is None and m.get("a") == b"1" and m.get("c") == b"3"


@pytest.mark.asyncio
async def test_firestore_roundtrip_survives_new_instance_with_ttl():
    fc = FakeClient()
    a = make(fc)
    await a.put("k", b"hello"); await a.flush()
    doc = fc.cols["commentary"]["k"]
    assert doc["v"] == b"hello"
    assert timedelta(days=29) < doc["expires_at"] - doc["created_at"] <= timedelta(days=30)
    b = make(fc)  # simulated cold start / second instance
    assert await b.get("k") == b"hello"


@pytest.mark.asyncio
async def test_expired_doc_is_a_miss():
    fc = FakeClient()
    c = make(fc)
    fc.cols["commentary"] = {"k": {"v": b"x", "expires_at": datetime.now(timezone.utc) - timedelta(days=1)}}
    assert await c.get("k") is None


@pytest.mark.asyncio
async def test_oversize_value_skipped():
    fc = FakeClient()
    c = make(fc, "tts_audio")
    await c.put("big", b"x" * (C.MAX_VALUE_BYTES + 1)); await c.flush()
    assert "big" not in fc.cols.get("tts_audio", {}) and c.get_local("big") is None


@pytest.mark.asyncio
async def test_error_falls_back_to_memory_and_trips_breaker():
    fc = FakeClient()
    c = make(fc)
    await c.put("k", b"v"); await c.flush()
    c2 = make(fc)
    fc.broken = True
    assert await c2.get("k") is None  # error -> miss, no exception
    n = fc.calls
    assert await c2.get("other") is None
    assert fc.calls == n  # breaker open: no further remote calls
    c2.put_nowait("m", b"mem")
    assert await c2.get("m") == b"mem"  # memory still works


@pytest.mark.asyncio
async def test_write_error_never_raises():
    fc = FakeClient()
    fc.broken = True
    c = make(fc)
    await c.put("k", b"v"); await c.flush()
    assert await c.get("k") == b"v"


@pytest.mark.asyncio
async def test_slow_read_times_out(monkeypatch):
    class Slow:
        async def get(self, k):
            await asyncio.sleep(5)

        async def put(self, k, v):
            pass

    monkeypatch.setattr(C, "READ_TIMEOUT_S", 0.05)
    c = C.Cache("x", remote=Slow())
    assert await c.get("k") is None


@pytest.mark.asyncio
async def test_slow_cold_read_does_not_disable_writes(monkeypatch):
    """Regression: a cold first read timing out used to trip a shared breaker, silently dropping every write."""
    class ColdThenFast:
        def __init__(self):
            self.docs = {}
            self.n = 0

        async def get(self, k):
            self.n += 1
            if self.n == 1:
                await asyncio.sleep(5)
            return self.docs.get(k)

        async def put(self, k, v):
            self.docs[k] = v

    monkeypatch.setattr(C, "READ_TIMEOUT_S", 0.05)
    r = ColdThenFast()
    c = C.Cache("x", remote=r)
    assert await c.get("a") is None  # read times out and trips the read breaker
    await c.put("k", b"v")
    assert r.docs == {"k": b"v"}  # write still lands


@pytest.mark.asyncio
async def test_put_is_durable_before_return_without_background_task():
    """Regression: Cloud Run throttles CPU after the response, so put() must finish the remote write itself."""
    fc = FakeClient()
    c = make(fc)
    await c.put("k", b"v")  # no flush()
    assert fc.cols["commentary"]["k"]["v"] == b"v" and not c._pending


@pytest.mark.asyncio
async def test_cold_first_op_gets_longer_timeout(monkeypatch):
    class Cold:
        async def get(self, k):
            await asyncio.sleep(0.15)

        async def put(self, k, v):
            pass

    monkeypatch.setattr(C, "READ_TIMEOUT_S", 0.05)
    monkeypatch.setattr(C, "COLD_TIMEOUT_S", 2.0)
    c = C.Cache("x", remote=Cold())
    c._warm = False
    await c.get("k")
    assert c._down_until["read"] == 0.0 and c._warm


def test_selection(monkeypatch):
    for k in ("GOOGLE_CLOUD_PROJECT", "FIVESEC_MOCK", "FIVESEC_CACHE"):
        monkeypatch.delenv(k, raising=False)
    assert not C.firestore_enabled()
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p")
    assert C.firestore_enabled()
    monkeypatch.setenv("FIVESEC_MOCK", "1")
    assert not C.firestore_enabled()
    monkeypatch.setenv("FIVESEC_CACHE", "firestore")
    assert C.firestore_enabled()
    monkeypatch.setenv("FIVESEC_CACHE", "memory")
    monkeypatch.delenv("FIVESEC_MOCK")
    assert not C.firestore_enabled()


@pytest.mark.asyncio
async def test_extract_repeat_scan_zero_model_calls(monkeypatch):
    """A second instance (fresh memory) reads the extraction from Firestore: 0 model calls."""
    from app.ai import extract
    from app.models import Extraction

    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p")
    monkeypatch.setenv("FIVESEC_MOCK", "0")
    fc = FakeClient()
    ex = extract._fixture_extraction(extract.DEFAULT_FIXTURE)
    calls = []

    async def fake_call(**kw):
        calls.append(1)
        return ex.model_dump_json()

    monkeypatch.setattr(extract.client, "call_model", fake_call)
    imgs = [("image/png", b"abc")]
    orig = extract._store
    try:
        for _ in range(2):
            extract._store = make(fc, "label_extractions")  # new instance each time, shared Firestore
            got, n = await extract.extract_label(imgs, "123")
            await extract._store.flush()
            assert isinstance(got, Extraction) and got.barcode == "123"
    finally:
        extract._store = orig
    assert len(calls) == 1 and n == 0
