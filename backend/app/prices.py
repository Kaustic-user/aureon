"""Mutual fund NAVs from AMFI's public daily file.

File format (semicolon separated, with section header lines mixed in):
Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
(Some versions omit Plan/Option; we read NAV and date from the end of the row.)

Stock prices have no data source yet (open question in REQUIREMENTS.md), so
stocks are priced manually through the API for now.
"""

from __future__ import annotations

import ssl
import threading
import time
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from . import config

AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
CACHE_SECONDS = 6 * 3600


@dataclass(frozen=True)
class Scheme:
    code: str
    isin_growth: str | None
    isin_reinvest: str | None
    name: str
    nav: Decimal | None
    nav_date: date | None


def _clean_isin(v: str) -> str | None:
    v = v.strip()
    return v if len(v) == 12 and v[:2].isalpha() else None


def parse_navall(text: str) -> dict[str, Scheme]:
    schemes: dict[str, Scheme] = {}
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 6 or not parts[0].isdigit():
            continue
        code = parts[0]
        nav_raw, date_raw = parts[-2], parts[-1]
        name_parts = [p for p in parts[3:-2] if p]
        try:
            nav = Decimal(nav_raw)
            if nav <= 0:
                nav = None
        except InvalidOperation:
            nav = None
        try:
            nav_date = datetime.strptime(date_raw, "%d-%b-%Y").date()
        except ValueError:
            nav_date = None
        schemes[code] = Scheme(
            code=code,
            isin_growth=_clean_isin(parts[1]),
            isin_reinvest=_clean_isin(parts[2]),
            name=" · ".join(name_parts) if len(name_parts) > 1 else (name_parts[0] if name_parts else code),
            nav=nav,
            nav_date=nav_date,
        )
    return schemes


_cache: tuple[float, dict[str, Scheme]] | None = None
_lock = threading.Lock()


def fetch_text(url: str = AMFI_URL, timeout: int = 60) -> str:
    ca = config.ca_bundle()
    if not ca:
        try:
            import certifi
            ca = certifi.where()
        except ImportError:
            pass
    ctx = ssl.create_default_context(cafile=ca)
    req = urllib.request.Request(url, headers={"User-Agent": "Aureon/0.1 (personal finance, local)"})
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def get_schemes(force: bool = False) -> dict[str, Scheme]:
    global _cache
    with _lock:
        if not force and _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
            return _cache[1]
        schemes = parse_navall(fetch_text())
        _cache = (time.monotonic(), schemes)
        return schemes


def search(schemes: dict[str, Scheme], query: str, limit: int = 20) -> list[Scheme]:
    terms = [t for t in query.lower().split() if t]
    if not terms:
        return []
    out = []
    for s in schemes.values():
        hay = f"{s.name} {s.code} {s.isin_growth or ''}".lower()
        if all(t in hay for t in terms):
            out.append(s)
            if len(out) >= limit:
                break
    return out
