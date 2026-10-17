"""Byte cache with two backends: in-memory LRU and Firestore (async client, ADC only).

`get_cache(ns)` returns a per-namespace Cache: a memory LRU in front, Firestore behind it when enabled.
Selection: FIVESEC_CACHE=memory|firestore; default is firestore when GOOGLE_CLOUD_PROJECT is set and not mock,
else memory. Any Firestore error (or timeout) falls back to memory and trips a short circuit breaker so a scan
never fails or waits on the store. Docs carry `expires_at` for a Firestore TTL policy on that field.
Namespaces map to collections: label_extractions, commentary, tts_audio.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import get_settings

log = logging.getLogger("fivesec")

READ_TIMEOUT_S = 0.5
WRITE_TIMEOUT_S = 1.5
COLD_TIMEOUT_S = 8.0  # until the first remote success: client creation + ADC token + gRPC channel take 1-3 s
BREAKER_S = 60.0
MAX_VALUE_BYTES = 900 * 1024
DEFAULT_TTL_DAYS = 30


class MemoryBackend:
    def __init__(self, max_items: int = 256) -> None:
        self.data: "OrderedDict[str, bytes]" = OrderedDict()
        self.max_items = max_items

    def get(self, key: str) -> bytes | None:
        v = self.data.get(key)
        if v is not None:
            self.data.move_to_end(key)
        return v

    def put(self, key: str, value: bytes) -> None:
        self.data[key] = value
        self.data.move_to_end(key)
        while len(self.data) > self.max_items:
            self.data.popitem(last=False)

    def clear(self) -> None:
        self.data.clear()


_CLIENT: Any | None = None


def shared_client() -> Any:
    """One AsyncClient (one gRPC channel) for all namespaces, created lazily inside the running loop."""
    global _CLIENT
    if _CLIENT is None:
        from google.cloud import firestore

        _CLIENT = firestore.AsyncClient(project=get_settings().project)
    return _CLIENT


class FirestoreBackend:
    """One collection per namespace; doc id = key; fields: v (bytes), created_at, expires_at (TTL field)."""

    def __init__(self, collection: str, client: Any | None = None, ttl_days: int | None = None) -> None:
        self.collection = collection
        self._client = client
        self.ttl = timedelta(days=ttl_days or int(os.getenv("FIVESEC_CACHE_TTL_DAYS", DEFAULT_TTL_DAYS)))

    def _doc(self, key: str) -> Any:
        if self._client is None:
            self._client = shared_client()
        return self._client.collection(self.collection).document(key)

    async def get(self, key: str) -> bytes | None:
        snap = await self._doc(key).get()
        if not snap.exists:
            return None
        d = snap.to_dict() or {}
        exp = d.get("expires_at")
        if exp is not None and exp < datetime.now(timezone.utc):
            return None
        v = d.get("v")
        return bytes(v) if v is not None else None

    async def put(self, key: str, value: bytes) -> None:
        now = datetime.now(timezone.utc)
        await self._doc(key).set({"v": value, "created_at": now, "expires_at": now + self.ttl})


def firestore_enabled() -> bool:
    mode = os.getenv("FIVESEC_CACHE", "").strip().lower()
    if mode == "memory":
        return False
    s = get_settings()
    if mode == "firestore":
        return bool(s.project)
    return bool(s.project) and not s.mock


class Cache:
    def __init__(self, ns: str, max_items: int = 256, remote: Any | None = None) -> None:
        self.ns = ns
        self.mem = MemoryBackend(max_items)
        self._remote = remote  # injected in tests
        self._down_until = {"read": 0.0, "write": 0.0}  # independent breakers: a slow read must not stop writes
        self._warm = remote is not None  # False until the first real Firestore success (cold start)
        self._pending: set[asyncio.Task[None]] = set()

    def _fs(self, op: str) -> Any | None:
        if time.monotonic() < self._down_until[op]:
            return None
        if self._remote is not None:
            return self._remote
        if not firestore_enabled():
            return None
        self._remote = FirestoreBackend(self.ns)
        return self._remote

    def _trip(self, op: str, e: BaseException) -> None:
        self._down_until[op] = time.monotonic() + BREAKER_S
        log.warning("cache %s %s failed (%s: %s); skipping for %ds", self.ns, op, type(e).__name__, e, int(BREAKER_S))

    def get_local(self, key: str) -> bytes | None:
        return self.mem.get(key)

    async def get(self, key: str) -> bytes | None:
        v = self.mem.get(key)
        if v is not None:
            return v
        fs = self._fs("read")
        if fs is None:
            return None
        try:
            v = await asyncio.wait_for(fs.get(key), READ_TIMEOUT_S if self._warm else COLD_TIMEOUT_S)
            self._warm = True
        except Exception as e:  # noqa: BLE001 - never fail a scan on the store
            self._trip("read", e)
            return None
        if v is not None:
            self.mem.put(key, v)
        return v

    async def _remote_put(self, fs: Any, key: str, value: bytes) -> None:
        try:
            await asyncio.wait_for(fs.put(key, value), WRITE_TIMEOUT_S if self._warm else COLD_TIMEOUT_S)
            self._warm = True
        except Exception as e:  # noqa: BLE001
            self._trip("write", e)

    def put_nowait(self, key: str, value: bytes) -> None:
        """Memory write now; the Firestore write runs in the background (needs a running loop, else skipped).

        On Cloud Run, CPU is throttled once the response is sent, so background writes may never run:
        request paths should `await put()` instead.
        """
        if len(value) > MAX_VALUE_BYTES:
            return
        self.mem.put(key, value)
        fs = self._fs("write")
        if fs is None:
            return
        try:
            t = asyncio.get_running_loop().create_task(self._remote_put(fs, key, value))
        except RuntimeError:
            return
        self._pending.add(t)
        t.add_done_callback(self._pending.discard)

    async def put(self, key: str, value: bytes) -> None:
        """Memory write, then await the Firestore write (bounded by a timeout; never raises)."""
        if len(value) > MAX_VALUE_BYTES:
            return
        self.mem.put(key, value)
        fs = self._fs("write")
        if fs is not None:
            await self._remote_put(fs, key, value)

    async def flush(self) -> None:
        """Wait for background writes (tests, shutdown)."""
        if self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)

    async def warmup(self) -> None:
        """Pay the cold-start cost (client, token, channel) at startup with a read of a nonexistent doc."""
        fs = self._fs("read")
        if fs is None:
            return
        try:
            await asyncio.wait_for(fs.get("_warmup"), COLD_TIMEOUT_S)
            self._warm = True
        except Exception as e:  # noqa: BLE001
            self._trip("read", e)

    def clear(self) -> None:
        self.mem.clear()
        self._down_until = {"read": 0.0, "write": 0.0}


_CACHES: dict[str, Cache] = {}
_SIZES = {"label_extractions": 256, "commentary": 256, "tts_audio": 64}


def get_cache(ns: str) -> Cache:
    c = _CACHES.get(ns)
    if c is None:
        c = _CACHES[ns] = Cache(ns, _SIZES.get(ns, 256))
    return c


async def warmup_caches() -> None:
    await asyncio.gather(*(get_cache(ns).warmup() for ns in _SIZES))


def reset_caches() -> None:
    for c in _CACHES.values():
        c.clear()
