from starlette.requests import Request

from app.store.ratelimit import RateLimiter, client_ip


def test_bucket_refills():
    r = RateLimiter()
    assert all(r.take("a", 3, 0, now=0, day="d") is None for _ in range(3))
    assert r.take("a", 3, 0, now=0, day="d") == "ip"
    assert r.take("b", 3, 0, now=0, day="d") is None  # other IP unaffected
    assert r.take("a", 3, 0, now=20, day="d") is None  # 3/min -> 1 token per 20 s


def test_daily_budget_global_and_resets():
    r = RateLimiter()
    assert r.take("a", 100, 2, now=0, day="d1") is None
    assert r.take("b", 100, 2, now=0, day="d1") is None
    assert r.take("c", 100, 2, now=0, day="d1") == "daily"
    assert r.take("c", 100, 2, now=0, day="d2") is None


def _req(headers, client=("9.9.9.9", 1)):
    return Request({"type": "http", "headers": [(k.encode(), v.encode()) for k, v in headers.items()], "client": client})


def test_client_ip_uses_first_forwarded_hop():
    assert client_ip(_req({"x-forwarded-for": "1.2.3.4, 10.0.0.1"})) == "1.2.3.4"
    assert client_ip(_req({})) == "9.9.9.9"
