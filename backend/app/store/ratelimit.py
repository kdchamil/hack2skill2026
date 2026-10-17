"""In-process token bucket per client IP plus a global daily budget of requests.

Per-instance state (Cloud Run max-instances is small); it bounds spend, it is not a precise global quota.
Env: FIVESEC_RATE_PER_MIN (default 20), FIVESEC_DAILY_BUDGET (default 300; 0 disables the global cap),
FIVESEC_RATE_LIMIT=0 disables everything.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first[:64]
    return request.client.host if request.client else "?"


@dataclass
class _Bucket:
    tokens: float
    ts: float


class RateLimiter:
    def __init__(self) -> None:
        self.buckets: dict[str, _Bucket] = {}
        self.day = ""
        self.day_count = 0

    def take(self, who: str, per_min: int, daily: int, now: float | None = None, day: str | None = None) -> str | None:
        """Returns None when allowed, else 'ip' or 'daily'."""
        now = time.monotonic() if now is None else now
        today = day or time.strftime("%Y-%m-%d", time.gmtime())
        if today != self.day:
            self.day, self.day_count = today, 0
        if daily > 0 and self.day_count >= daily:
            return "daily"
        b = self.buckets.get(who)
        if b is None:
            b = self.buckets[who] = _Bucket(float(per_min), now)
        b.tokens = min(float(per_min), b.tokens + (now - b.ts) * per_min / 60.0)
        b.ts = now
        if b.tokens < 1:
            return "ip"
        b.tokens -= 1
        self.day_count += 1
        if len(self.buckets) > 5000:
            self.buckets.pop(next(iter(self.buckets)))
        return None

    def reset(self) -> None:
        self.buckets.clear()
        self.day, self.day_count = "", 0


limiter = RateLimiter()


def reset_limits() -> None:
    limiter.reset()


def check_rate(request: Request, *, exempt: bool = False) -> None:
    """Raise 429 (JSON detail) when over limit. `exempt` skips the check (demo fixture scans)."""
    if exempt or os.getenv("FIVESEC_RATE_LIMIT", "1").strip().lower() in ("0", "false", "off"):
        return
    per_min = int(os.getenv("FIVESEC_RATE_PER_MIN", "20"))
    daily = int(os.getenv("FIVESEC_DAILY_BUDGET", "300"))
    why = limiter.take(client_ip(request), per_min, daily)
    if why:
        raise HTTPException(
            status_code=429,
            detail="Daily capacity reached. Please try again tomorrow." if why == "daily"
            else "Too many requests. Please wait a moment and retry.",
            headers={"Retry-After": "60" if why == "ip" else "3600"},
        )
