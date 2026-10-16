"""Date parsing and expiry banners. Takes `today` as a parameter."""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date

from app.models import DateField, Finding

from .taxonomy import make_finding

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8,
          "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
_MON = r"(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?"
_ISO = re.compile(r"(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)")
_DMONY = re.compile(r"(?<!\d)(\d{1,2})\s*[-/. ]?\s*(?<![a-z])" + _MON + r"\s*[-/.,' ]?\s*(\d{4}|\d{2})(?!\d)", re.I)
_MONY = re.compile(r"(?<![a-z])" + _MON + r"\s*[-/.,' ]?\s*(\d{4}|\d{2})(?!\d)", re.I)
_DMY = re.compile(r"(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})(?!\d)")
_MY = re.compile(r"(?<![\d/.-])(\d{1,2})\s*[./-]\s*(\d{4})(?![\d/.-])")
_YM = re.compile(r"(?<![\d/.-])(\d{4})\s*[./-]\s*(\d{1,2})(?![\d/.-])")


@dataclass
class ParsedDate:
    value: date
    inferred: bool
    note: str


def _year(y: str) -> int:
    n = int(y)
    return 2000 + n if len(y) == 2 else n


def _mk(y: int, m: int, d: int) -> date | None:
    try:
        if not 2000 <= y <= 2100:
            return None
        return date(y, m, d)
    except ValueError:
        return None


def _eom(y: int, m: int) -> date | None:
    if not (2000 <= y <= 2100 and 1 <= m <= 12):
        return None
    return date(y, m, calendar.monthrange(y, m)[1])


def parse_date(raw: str) -> ParsedDate | None:
    """Parse common label date formats. Native-language prefixes are simply ignored."""
    t = (raw or "").casefold()
    if m := _ISO.search(t):
        d = _mk(int(m[1]), int(m[2]), int(m[3]))
        return ParsedDate(d, False, "ISO date") if d else None
    if m := _DMONY.search(t):
        d = _mk(_year(m[3]), MONTHS[m[2]], int(m[1]))
        return ParsedDate(d, False, "day-month-year") if d else None
    if m := _MONY.search(t):
        d = _eom(_year(m[2]), MONTHS[m[1]])
        return ParsedDate(d, True, "month and year only; end of month assumed") if d else None
    if m := _DMY.search(t):
        a, b, y = int(m[1]), int(m[2]), _year(m[3])
        if b > 12 >= a:
            d = _mk(y, a, b)
            return ParsedDate(d, True, "read as MM/DD because the second number exceeds 12") if d else None
        d = _mk(y, b, a)
        if d is None:
            return None
        ambiguous = a <= 12 and b <= 12 and a != b
        return ParsedDate(d, ambiguous, "DD/MM assumed (ambiguous)" if ambiguous else "day-month-year")
    if m := _MY.search(t):
        d = _eom(int(m[2]), int(m[1]))
        return ParsedDate(d, True, "month and year only; end of month assumed") if d else None
    if m := _YM.search(t):
        d = _eom(int(m[1]), int(m[2]))
        return ParsedDate(d, True, "month and year only; end of month assumed") if d else None
    return None


KIND_LABEL = {"best_before": "best before", "use_by": "use by", "expiry": "expiry", "mfg": "manufacture"}


def evaluate(fields: list[DateField], today: date) -> tuple[list[DateField], list[Finding], list[str]]:
    """Returns (fields with iso filled by rules code, findings, banners)."""
    out_fields: list[DateField] = []
    findings: list[Finding] = []
    banners: list[str] = []
    seen: dict[str, int] = {}
    for f in fields:
        p = parse_date(f.raw)
        out_fields.append(f.model_copy(update={"iso": p.value.isoformat() if p else None}))
        if f.kind == "mfg":
            continue
        label = KIND_LABEL[f.kind]
        n = seen.get(f.kind, 0)
        seen[f.kind] = n + 1
        fid = f"date.{f.kind}" if n == 0 else f"date.{f.kind}.{n}"
        if p is None:
            findings.append(make_finding(
                fid, "packaging", "date", "info", "no_known_concern", "unknown",
                f"The {label} date could not be read", "The printed date did not match a known format.",
                "Check the date on the pack yourself.", {"kind": f.kind}, label_read=False))
            continue
        iso = p.value.isoformat()
        days = (p.value - today).days
        tier = "inferred" if p.inferred else "label_stated"
        data = {"kind": f.kind, "iso": iso, "days_left": days, "parse": p.note}
        if days < 0:
            banners.append(f"expired:{iso}")
            findings.append(make_finding(
                fid, "packaging", "date", "avoid", "restricted", tier,
                f"Past its {label} date",
                f"The {label} date read is {iso}, which is {-days} day(s) before today ({p.note}).",
                "Check the date on the pack and consider not using this product.", data))
        elif days <= 7:
            banners.append(f"near_expiry:{iso}")
            findings.append(make_finding(
                fid, "packaging", "date", "check", "restricted", tier,
                f"Close to its {label} date",
                f"The {label} date read is {iso}, which is {days} day(s) from today ({p.note}).",
                "Consider using it soon and check the date on the pack.", data))
        else:
            findings.append(make_finding(
                fid, "packaging", "date", "info", "no_known_concern", tier,
                f"{label.capitalize()} date {iso}",
                f"The {label} date read is {iso}, {days} day(s) from today ({p.note}).", None, data))
    return out_fields, findings, banners
