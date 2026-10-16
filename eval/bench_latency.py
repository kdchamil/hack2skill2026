"""Latency benchmark: real Vertex calls for extract + commentary on a label image.

Run: cd backend && GOOGLE_CLOUD_PROJECT=fiveseconds-hr-2026 uv run python ../eval/bench_latency.py [image] [runs]
Env overrides honoured by the app: GOOGLE_CLOUD_LOCATION, GEMINI_FLASH_MODEL, FIVESEC_COMMENTARY_MODEL, FIVESEC_THINKING.
"""
import asyncio
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "fiveseconds-hr-2026")
os.environ["FIVESEC_MOCK"] = "0"

from app import rules  # noqa: E402
from app.ai import commentary, extract  # noqa: E402
from app.config import get_settings  # noqa: E402

DEFAULT_IMG = "/private/tmp/claude-501/-Users-chamil-Documents-hack2skill/8272d9ad-5391-40e2-a132-5fda64f8dfc1/scratchpad/label.jpg"


async def once(img: bytes) -> tuple[int, int, object, object]:
    t = time.perf_counter()
    ex, _ = await extract.extract_label([("image/jpeg", img)])
    t_ex = int((time.perf_counter() - t) * 1000)
    an = rules.analyze(ex, market="SG")
    t = time.perf_counter()
    com, _, _ = await commentary.write_commentary(an, "si", "bench" + str(time.time()), use_cache=False)
    t_co = int((time.perf_counter() - t) * 1000)
    return t_ex, t_co, ex, (an, com)


async def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMG
    runs = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    img = open(path, "rb").read()
    s = get_settings()
    print(f"loc={s.location} model={s.flash_model} bytes={len(img)}")
    ex_t, co_t = [], []
    for i in range(runs):
        a, b, ex, (an, com) = await once(img)
        ex_t.append(a); co_t.append(b)
        ings = getattr(ex, "ingredients", None)
        print(f"run{i}: extract={a}ms commentary={b}ms source={com.source}")
        ids = sorted(f.id for f in an.findings)
        print("  finding ids:", ids)
        need = ["sesame", "soy", "gluten", "peanut", "sodium", "sugar"]
        print("  accuracy:", {k: any(k in i for i in ids) for k in need}, "PP5:", "PP 5" in " ".join(ex.packaging_codes.value or []))
        print("  headline sample:", next(iter(com.cards.values())))
    print(f"MEDIAN extract={int(statistics.median(ex_t))}ms commentary={int(statistics.median(co_t))}ms")
    print("extraction keys:", {k: (v if not isinstance(v, (list, dict)) else '...') for k, v in ex.model_dump().items()} if False else ex.model_dump_json()[:1500])


asyncio.run(main())
