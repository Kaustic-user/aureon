"""Historical USD→INR rates: SBI's published TT buying rate, one per day.

Source: the community-maintained archive of SBI's daily forex rate PDFs
(github.com/sahilgupta/sbi-fx-ratekeeper), a single CSV from Jan 2020 onwards.
It is downloaded once, kept next to the database (inside the project's data
folder) and only re-downloaded when you ask for a date newer than the copy
we hold and the copy is over 6 hours old. Past dates never touch the network
once the file exists. Only the CSV is fetched; nothing about you is sent.

SBI publishes no rate on weekends and holidays, so those dates use the most
recent earlier day, and the answer says which day that was.
"""

from __future__ import annotations

import csv
import io
import threading
import time
from bisect import bisect_right
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .prices import fetch_text

SBI_USD_URL = "https://raw.githubusercontent.com/sahilgupta/sbi-fx-ratekeeper/main/csv_files/SBI_REFERENCE_RATES_USD.csv"
CACHE_SECONDS = 6 * 3600
RETRY_SECONDS = 300  # after a failed download, don't hammer (or wait on) the network every request
CACHE_NAME = "fx_usd_inr_sbi.csv"

Table = tuple[list[date], list[Decimal]]  # sorted dates, rates in the same order


def parse_sbi_csv(text: str) -> Table:
    """Daily TT BUY rates. Rows with no rate (0.00) are skipped; the last row of a day wins."""
    by_day: dict[date, Decimal] = {}
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header or "TT BUY" not in header or "DATE" not in header:
        raise ValueError("Unexpected SBI rates file format")
    i_date, i_rate = header.index("DATE"), header.index("TT BUY")
    for row in reader:
        try:
            day = datetime.strptime(row[i_date].strip()[:10], "%Y-%m-%d").date()
            rate = Decimal(row[i_rate].strip())
        except (IndexError, ValueError, InvalidOperation):
            continue
        if rate > 0:
            by_day[day] = rate
    days = sorted(by_day)
    if not days:
        raise ValueError("SBI rates file had no usable rows")
    return days, [by_day[d] for d in days]


def lookup(table: Table, on: date) -> tuple[date, Decimal] | None:
    """The rate in force on `on`: that day's, or the latest earlier one. None if before the data starts."""
    days, rates = table
    i = bisect_right(days, on) - 1
    return (days[i], rates[i]) if i >= 0 else None


_lock = threading.Lock()
_table: Table | None = None
_next_try = 0.0  # wall-clock time before which we won't re-download
_folder: Path | None = None  # where the cached copy lives; the table is dropped if it changes


def _reset() -> None:
    """For tests."""
    global _table, _next_try, _folder
    _table, _next_try, _folder = None, 0.0, None


def _download(path: Path) -> Table:
    global _table, _next_try
    text = fetch_text(SBI_USD_URL)
    table = parse_sbi_csv(text)  # validate before it replaces a good file
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    _table, _next_try = table, time.time() + CACHE_SECONDS
    return table


def get_rate(on: date, folder: Path) -> tuple[date, Decimal] | None:
    """Rate for `on`, fetching/refreshing the archive only when needed. Raises OSError if offline with no copy.

    `folder` is where the cached CSV is kept (the database's folder, inside the project).
    """
    global _table, _folder, _next_try
    path = folder / CACHE_NAME
    with _lock:
        if _folder != folder:
            _table, _folder = None, folder
        if _table is None:
            try:
                _table = parse_sbi_csv(path.read_text(encoding="utf-8"))
                _next_try = path.stat().st_mtime + CACHE_SECONDS
            except (OSError, ValueError):
                _table, _next_try = None, 0.0
        # Download when we have nothing, or the date is newer than our copy and the copy is old.
        if _table is None or (on > _table[0][-1] and time.time() >= _next_try):
            try:
                _download(path)
            except (OSError, ValueError):
                if _table is None:
                    raise
                _next_try = time.time() + RETRY_SECONDS  # offline: keep using the copy we hold
        return lookup(_table, on)
