#!/usr/bin/env python3
"""AI-uplift eval (SPEC 12): rules-only baseline vs Gemini pipeline on the golden manifest.

Run from backend/ so the backend venv is used:
  cd backend && uv run python ../eval/run_eval.py --mode offline
  cd backend && uv run python ../eval/run_eval.py --mode live --api http://localhost:8080

offline  No cloud calls. Text entries only. Baseline reads fixture text (baseline.fixture_text).
         Pipeline runs the fixture extraction through app.rules.analyze.
live     Photo entries with images on disk. Pipeline POSTs the photos to /api/scan (no fixture).
         Baseline OCRs them with Cloud Vision (ADC) and runs the same rules-only matching.

Exit codes: 0 ok, 3 rules not ready (NotImplementedError), 4 fixture not found, 2 bad manifest.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parent
ROOT = EVAL_DIR.parent
BACKEND = ROOT / "backend"
FIXTURE_DIR = BACKEND / "app" / "fixtures"
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import baseline  # noqa: E402  (eval/baseline.py)

LANGS = ("en", "si", "ta")
ALLERGEN_KEYS = ("allergens_contains", "allergens_may_contain")
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
SODIUM_TOL = 0.05


class ManifestError(Exception):
    pass


# ---------------------------------------------------------------- manifest and fixtures

def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for e in data.get("entries", []):
        if e.get("kind") not in ("photo", "text") or e.get("lang") not in LANGS:
            raise ManifestError(f"bad kind/lang in entry {e.get('id')}")
        for k in ALLERGEN_KEYS:
            if e["expected"].get(k) is not None and not isinstance(e["expected"].get(k), list):
                raise ManifestError(f"{e['id']}: expected.{k} must be a list or null")
        if e["kind"] == "text" and not e.get("fixture"):
            raise ManifestError(f"{e['id']}: text entry needs a fixture name")
    return data


def load_fixture(name: str) -> dict[str, Any]:
    path = FIXTURE_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"fixture {name} not found at {path}; backend fixtures not ready")
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- predictions

def predicted_from_analysis(a: dict[str, Any]) -> dict[str, Any]:
    """Pipeline prediction from an Analysis dict (rules.analyze output or /api/scan 'analysis')."""
    facts = a["facts"]
    prod = a["product"]

    def v(field: str) -> Any:
        x = prod.get(field)
        return x.get("value") if isinstance(x, dict) else x

    nut = {r["nutrient"]: r.get("per_100g") for r in (v("nutrition") or [])}
    bb = next((d.get("iso") for d in (v("dates") or []) if d.get("kind") == "best_before" and d.get("iso")), None)
    return {
        "contains": set(facts.get("allergens_contains") or []),
        "may": set(facts.get("allergens_may_contain") or []),
        "sodium_mg": nut.get("sodium_mg"),
        "sugars_g": nut.get("sugars_total"),
        "claims": list(v("claims") or []),
        "best_before_iso": bb,
    }


def pipeline_offline(entry: dict[str, Any]) -> tuple[dict[str, Any], float, int, int]:
    from app.models import Extraction  # backend
    from app.rules import analyze  # backend

    fx = load_fixture(entry["fixture"])
    t0 = time.perf_counter()
    ext = Extraction.model_validate(fx)
    analysis = analyze(ext, market="SG")
    ms = (time.perf_counter() - t0) * 1000
    # model_calls=1 is an assumption: the fixture stands in for the one Gemini Flash extraction call.
    return predicted_from_analysis(analysis.model_dump(mode="json")), ms, 1, 0


def pipeline_live(client: Any, api: str, entry: dict[str, Any], images: list[Path]) -> tuple[dict[str, Any], float, int, int]:
    files = [("images", (p.name, p.read_bytes(), MIME.get(p.suffix.lower(), "image/jpeg"))) for p in images]
    data = {"lang": entry["lang"], "market": "SG"}
    t0 = time.perf_counter()
    done: dict[str, Any] | None = None
    event = None
    with client.stream("POST", f"{api}/api/scan", files=files, data=data, timeout=180) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if event == "error":
                    raise RuntimeError(f"{entry['id']}: /api/scan error {payload}")
                if event == "done":
                    done = payload
    ms = (time.perf_counter() - t0) * 1000
    if done is None:
        raise RuntimeError(f"{entry['id']}: no 'done' event from /api/scan")
    return predicted_from_analysis(done["analysis"]), ms, int(done["model_calls"]), 0


def baseline_offline(entry: dict[str, Any]) -> tuple[dict[str, Any], float, int, int]:
    fx = load_fixture(entry["fixture"])
    t0 = time.perf_counter()
    pred = baseline.run_baseline(baseline.fixture_text(fx))
    ms = (time.perf_counter() - t0) * 1000
    # ocr_calls=1 is an assumption for cost per photo scan; no OCR call is made offline.
    return pred, ms, 0, 1


def baseline_live(entry: dict[str, Any], images: list[Path]) -> tuple[dict[str, Any], float, int, int]:
    t0 = time.perf_counter()
    text = baseline.cloudvision_text(images)
    pred = baseline.run_baseline(text)
    ms = (time.perf_counter() - t0) * 1000
    return pred, ms, 0, len(images)


# ---------------------------------------------------------------- scoring

def norm_claim(s: str) -> str:
    return re.sub(r"[\W_]+", " ", s, flags=re.UNICODE).casefold().strip()


def score_entry(gold: dict[str, Any], pred: dict[str, Any]) -> dict[str, int]:
    s = {
        "any_tp": 0, "any_fn": 0, "any_fp": 0, "c_tp": 0, "c_fn": 0,
        "sep_ok": 0, "sep_n": 0, "field_ok": 0, "field_n": 0, "allergen_entries": 0,
    }
    # Allergen metrics need both lists labelled (null = not scored for this entry).
    if gold["allergens_contains"] is not None and gold["allergens_may_contain"] is not None:
        g_c, g_m = set(gold["allergens_contains"]), set(gold["allergens_may_contain"])
        p_c, p_m = set(pred["contains"]), set(pred["may"])
        g_all, p_all = g_c | g_m, p_c | p_m
        s.update(any_tp=len(g_all & p_all), any_fn=len(g_all - p_all), any_fp=len(p_all - g_all),
                 c_tp=len(g_c & p_c), c_fn=len(g_c - p_c), allergen_entries=1)
        for item in g_all & p_all:  # contains vs may-contain bucket, only for detected allergens
            s["sep_n"] += 1
            gold_bucket = "c" if item in g_c else "m"
            pred_bucket = "c" if item in p_c else "m"
            s["sep_ok"] += int(gold_bucket == pred_bucket)

    def field(ok: bool) -> None:
        s["field_n"] += 1
        s["field_ok"] += int(ok)

    if gold["sodium_mg_per_100g"] is not None:
        g = gold["sodium_mg_per_100g"]
        field(pred["sodium_mg"] is not None and abs(pred["sodium_mg"] - g) <= SODIUM_TOL * g)
    if gold["sugars_per_100g"] is not None:
        g = gold["sugars_per_100g"]
        field(pred["sugars_g"] is not None and abs(pred["sugars_g"] - g) <= SODIUM_TOL * g)
    if gold["claims"] is not None:
        field({norm_claim(c) for c in gold["claims"]} == {norm_claim(c) for c in pred["claims"]})
    if gold["best_before_iso"] is not None:
        field(pred["best_before_iso"] == gold["best_before_iso"])
    return s


def pct(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return s[max(0, math.ceil(q / 100 * len(s)) - 1)]


def ratio(a: int, b: int) -> float | None:
    return a / b if b else None


def summarize(rows: list[dict[str, Any]], side: str, prices: dict[str, float]) -> dict[str, Any]:
    tot = {k: 0 for k in ("any_tp", "any_fn", "any_fp", "c_tp", "c_fn", "sep_ok", "sep_n", "field_ok", "field_n", "allergen_entries")}
    lat, models, ocrs, costs = [], [], [], []
    for r in rows:
        for k in tot:
            tot[k] += r[side]["score"][k]
        lat.append(r[side]["ms"])
        models.append(r[side]["model_calls"])
        ocrs.append(r[side]["ocr_calls"])
        costs.append(r[side]["ocr_calls"] * prices["cloud_vision_document_text_usd_per_image"]
                     + r[side]["model_calls"] * prices["gemini_flash_usd_per_call_est"])
    n = len(rows)
    return {
        "n_scored": n,
        "allergen_entries": tot["allergen_entries"],
        "allergen_recall_any": ratio(tot["any_tp"], tot["any_tp"] + tot["any_fn"]),
        "allergen_recall_contains": ratio(tot["c_tp"], tot["c_tp"] + tot["c_fn"]),
        "allergen_precision_any": ratio(tot["any_tp"], tot["any_tp"] + tot["any_fp"]),
        "contains_vs_may_separation_acc": ratio(tot["sep_ok"], tot["sep_n"]),
        "field_accuracy": ratio(tot["field_ok"], tot["field_n"]),
        "field_checks": tot["field_n"],
        "latency_p50_ms": pct(lat, 50),
        "latency_p75_ms": pct(lat, 75),
        "model_calls_per_scan": sum(models) / n if n else None,
        "ocr_calls_per_scan": sum(ocrs) / n if n else None,
        "cost_per_scan_usd": sum(costs) / n if n else None,
        "counts": tot,
    }


# ---------------------------------------------------------------- run

def run(args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[str]]:
    manifest = load_manifest(Path(args.manifest))
    prices = json.loads((EVAL_DIR / "prices.json").read_text(encoding="utf-8"))
    client = None
    if args.mode == "live":
        import httpx
        client = httpx.Client()

    rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    for e in manifest["entries"]:
        if e.get("pending_photo"):
            skipped.append(f"{e['id']}: pending_photo")
            continue
        if args.mode == "offline":
            if e["kind"] != "text":
                skipped.append(f"{e['id']}: photo entry, offline mode needs text entries")
                continue
            fx_path = FIXTURE_DIR / f"{e['fixture']}.json"
            if not fx_path.exists():
                raise FileNotFoundError(f"fixture {e['fixture']} not found at {fx_path}; backend fixtures not ready")
            b_pred, b_ms, b_models, b_ocr = baseline_offline(e)
            p_pred, p_ms, p_models, p_ocr = pipeline_offline(e)
        else:
            if e["kind"] != "photo":
                skipped.append(f"{e['id']}: text entry, live mode needs photos")
                continue
            images = [ROOT / p for p in e["image_paths"]]
            missing = [str(p.relative_to(ROOT)) for p in images if not p.exists()]
            if missing:
                skipped.append(f"{e['id']}: missing {', '.join(missing)}")
                continue
            b_pred, b_ms, b_models, b_ocr = baseline_live(e, images)
            p_pred, p_ms, p_models, p_ocr = pipeline_live(client, args.api, e, images)

        gold = e["expected"]
        rows.append({
            "id": e["id"], "kind": e["kind"], "lang": e["lang"], "gold": gold,
            "baseline": {
                "pred": {**b_pred, "contains": sorted(b_pred["contains"]), "may": sorted(b_pred["may"])},
                "score": score_entry(gold, b_pred), "ms": b_ms,
                "model_calls": b_models, "ocr_calls": b_ocr,
            },
            "pipeline": {
                "pred": {**p_pred, "contains": sorted(p_pred["contains"]), "may": sorted(p_pred["may"])},
                "score": score_entry(gold, p_pred), "ms": p_ms,
                "model_calls": p_models, "ocr_calls": p_ocr,
            },
        })
    if not rows:
        raise ManifestError("no entries to score for this mode")
    return rows, skipped


def write_outputs(rows, skipped, mode, out_dir: Path, prices: dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    price_vals = {k: v for k, v in prices.items() if k.endswith("_usd_per_image") or k.endswith("_usd_per_call_est")}
    base = summarize(rows, "baseline", price_vals)
    pipe = summarize(rows, "pipeline", price_vals)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    caveats = (
        [
            "OFFLINE RUN. Both sides use fixture text, not photographs. Baseline text is rendered from the fixture "
            "(ingredients, statements, claims, dates, nutrition) so OCR errors are absent. This is NOT the final golden-set result.",
            "Both sides read the same printed text offline, so allergen parity here is expected. It does not measure the uplift from Gemini on photos. The baseline's field misses are regex limits (for example, month-name dates).",
            "Offline latency is local compute only (regex and dictionary vs Extraction validation and analyze). It excludes OCR and model latency and is not comparable to live numbers.",
            "Offline model_calls=1 for the pipeline and ocr_calls=1 for the baseline are assumptions used only for cost per photo scan.",
            "Offline gold for text entries is the label truth printed in the fixture JSON (see golden/manifest.json notes). It is hand-checked but not reviewed by two annotators, and the fixture was written by the same team as the rules, so this is a sanity check, not an independent test.",
        ]
        if mode == "offline"
        else [
            "LIVE RUN. Real photos, Cloud Vision OCR and /api/scan with real Gemini calls. Cost uses placeholder prices in eval/prices.json (unverified).",
        ]
    ) + [f"Skipped: {len(skipped)} entries (pending photos or missing images)."]

    result = {
        "mode": mode, "generated_at": generated, "caveats": caveats,
        "prices": prices, "summary": {"baseline": base, "pipeline": pipe},
        "entries": rows, "skipped": skipped,
    }
    (out_dir / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    (out_dir / "results.md").write_text(to_markdown(result), encoding="utf-8")


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def _ms(x: float | None) -> str:
    return "n/a" if x is None else f"{x:.0f} ms"


def _usd(x: float | None) -> str:
    return "n/a" if x is None else f"${x:.4f}"


def _n(x: float | None) -> str:
    return "n/a" if x is None else f"{x:.2f}"


def to_markdown(res: dict[str, Any]) -> str:
    b, p = res["summary"]["baseline"], res["summary"]["pipeline"]
    mode = res["mode"]
    title = "Offline (fixture text)" if mode == "offline" else "Live (photos)"
    lines = [
        f"# AI uplift: rules-only baseline vs Gemini pipeline ({title})",
        "",
        f"Generated {res['generated_at']}. Scored entries: {b['n_scored']}. Entries with allergen labels: {b['allergen_entries']}. Field checks: {b['field_checks']} baseline, {p['field_checks']} pipeline.",
        "",
    ]
    lines += [f"> **{c}**" if i == 0 else f"> {c}" for i, c in enumerate(res["caveats"])]
    lines += [
        "",
        "| Metric | Rules-only baseline (Cloud Vision + dictionary + regex) | Gemini pipeline |",
        "| --- | ---: | ---: |",
        f"| Allergen recall (any allergen, contains or may contain) | {_pct(b['allergen_recall_any'])} | {_pct(p['allergen_recall_any'])} |",
        f"| Allergen recall (contains only) | {_pct(b['allergen_recall_contains'])} | {_pct(p['allergen_recall_contains'])} |",
        f"| Allergen precision (any) | {_pct(b['allergen_precision_any'])} | {_pct(p['allergen_precision_any'])} |",
        f"| Contains vs may-contain separation | {_pct(b['contains_vs_may_separation_acc'])} | {_pct(p['contains_vs_may_separation_acc'])} |",
        f"| Field accuracy (sodium and sugars within 5%, claims, best-before) | {_pct(b['field_accuracy'])} | {_pct(p['field_accuracy'])} |",
        f"| Latency p50 | {_ms(b['latency_p50_ms'])} | {_ms(p['latency_p50_ms'])} |",
        f"| Latency p75 | {_ms(b['latency_p75_ms'])} | {_ms(p['latency_p75_ms'])} |",
        f"| Model calls per scan | {_n(b['model_calls_per_scan'])} | {_n(p['model_calls_per_scan'])} |",
        f"| Cloud Vision calls per scan | {_n(b['ocr_calls_per_scan'])} | {_n(p['ocr_calls_per_scan'])} |",
        f"| Estimated cost per scan (placeholder prices) | {_usd(b['cost_per_scan_usd'])} | {_usd(p['cost_per_scan_usd'])} |",
        "",
        "Allergen recall and precision are micro-averaged over all labelled entries and allergen IDs. "
        "Sodium and sugars match within 5% of the labelled value. Claims are compared as normalised sets.",
        "",
        "## Per entry",
        "",
        "| id | lang | gold contains / may | baseline contains / may | pipeline contains / may | baseline ms | pipeline ms |",
        "| --- | --- | --- | --- | --- | ---: | ---: |",
    ]
    for r in res["entries"]:
        g = r["gold"]
        bp, pp = r["baseline"]["pred"], r["pipeline"]["pred"]
        def j(xs: list[str] | None) -> str:
            return "n/a" if xs is None else (",".join(xs) or "-")

        lines.append(
            f"| {r['id']} | {r['lang']} | {j(g['allergens_contains'])} / {j(g['allergens_may_contain'])} "
            f"| {','.join(bp['contains']) or '-'} / {','.join(bp['may']) or '-'} "
            f"| {','.join(pp['contains']) or '-'} / {','.join(pp['may']) or '-'} "
            f"| {r['baseline']['ms']:.0f} | {r['pipeline']['ms']:.0f} |"
        )
    if res["skipped"]:
        lines += ["", "## Skipped", ""] + [f"- {s}" for s in res["skipped"]]
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=["offline", "live"], required=True)
    ap.add_argument("--api", default="http://localhost:8080", help="live mode: base URL of the running API")
    ap.add_argument("--manifest", default=str(EVAL_DIR / "golden" / "manifest.json"))
    ap.add_argument("--out", default=str(EVAL_DIR / "results"))
    args = ap.parse_args()

    try:
        rows, skipped = run(args)
    except NotImplementedError as exc:
        print(f"NOT READY: {exc}", file=sys.stderr)
        return 3
    except FileNotFoundError as exc:
        print(f"NOT READY: {exc}", file=sys.stderr)
        return 4
    except ManifestError as exc:
        print(f"BAD MANIFEST: {exc}", file=sys.stderr)
        return 2

    prices = json.loads((EVAL_DIR / "prices.json").read_text(encoding="utf-8"))
    write_outputs(rows, skipped, args.mode, Path(args.out), prices)
    b = json.loads((Path(args.out) / "results.json").read_text())["summary"]
    print(f"scored {len(rows)} entries, skipped {len(skipped)}")
    for side in ("baseline", "pipeline"):
        s = b[side]
        print(f"{side:9s} recall_any={_pct(s['allergen_recall_any'])} precision_any={_pct(s['allergen_precision_any'])} "
              f"sep={_pct(s['contains_vs_may_separation_acc'])} field={_pct(s['field_accuracy'])} p50={_ms(s['latency_p50_ms'])}")
    print(f"wrote {Path(args.out) / 'results.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
