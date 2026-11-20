"""Pure finance calculations: XIRR, FIFO cost basis, date helpers.

No database access here, so everything can be unit-tested with known values.
All money is integer paise; units and prices are Decimal.
"""

from __future__ import annotations

import calendar
from collections import deque
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

# --------------------------------------------------------------------------
# Dates
# --------------------------------------------------------------------------


def parse_month(month: str) -> tuple[int, int]:
    """'2026-11' -> (2026, 11). Raises ValueError on bad input."""
    y, m = month.split("-")
    year, mon = int(y), int(m)
    if not (1 <= mon <= 12) or len(y) != 4 or len(m) != 2:
        raise ValueError(f"invalid month: {month!r}")
    return year, mon


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def month_bounds(month: str) -> tuple[date, date]:
    """First and last day of a 'YYYY-MM' month."""
    year, mon = parse_month(month)
    return date(year, mon, 1), date(year, mon, calendar.monthrange(year, mon)[1])


def shift_month(month: str, delta: int) -> str:
    year, mon = parse_month(month)
    idx = year * 12 + (mon - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def add_months(d: date, n: int, anchor_day: int | None = None) -> date:
    """Add n months, clamping to month end (Jan 31 + 1 month -> Feb 28/29).

    anchor_day keeps a monthly series on its original day, so a rule that
    started on the 31st returns to the 31st after a short month.
    """
    day = anchor_day or d.day
    idx = d.year * 12 + (d.month - 1) + n
    year, mon = idx // 12, idx % 12 + 1
    return date(year, mon, min(day, calendar.monthrange(year, mon)[1]))


def next_occurrence(d: date, frequency: str, anchor_day: int) -> date:
    if frequency == "weekly":
        return d + timedelta(days=7)
    if frequency == "monthly":
        return add_months(d, 1, anchor_day)
    if frequency == "yearly":
        return add_months(d, 12, anchor_day)
    raise ValueError(f"unknown frequency: {frequency!r}")


# --------------------------------------------------------------------------
# XIRR
# --------------------------------------------------------------------------

MIN_XIRR_SPAN_DAYS = 30


def xirr(flows: list[tuple[date, int]]) -> float | None:
    """Annualised internal rate of return for dated cash flows.

    Convention: money you put in is negative, money you get back (including
    the current value as a final flow dated today) is positive.

    Returns None when the rate is undefined (no sign change) or misleading:
    annualising a period shorter than MIN_XIRR_SPAN_DAYS turns small moves
    into huge percentages.
    """
    flows = [(d, a) for d, a in flows if a != 0]
    if not any(a < 0 for _, a in flows) or not any(a > 0 for _, a in flows):
        return None
    start = min(d for d, _ in flows)
    end = max(d for d, _ in flows)
    if (end - start).days < MIN_XIRR_SPAN_DAYS:
        return None

    timed = [((d - start).days / 365.0, float(a)) for d, a in flows]

    def npv(rate: float) -> float:
        return sum(a / (1.0 + rate) ** t for t, a in timed)

    lo, hi = -0.9999, 1.0
    f_lo = npv(lo)
    f_hi = npv(hi)
    while f_lo * f_hi > 0 and hi < 1e6:
        hi *= 4
        f_hi = npv(hi)
    if f_lo * f_hi > 0:
        return None

    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7 or (hi - lo) < 1e-12:
            return mid
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


# --------------------------------------------------------------------------
# FIFO holdings
# --------------------------------------------------------------------------


class HoldingError(ValueError):
    """Transactions are inconsistent (e.g. selling more units than held)."""


@dataclass
class InvTxnInput:
    date: date
    type: str  # buy | sell | dividend
    amount: int  # paise
    units: Decimal | None = None
    id: int | None = None


@dataclass
class _Lot:
    date: date
    units: Decimal
    cost: int  # paise, remaining cost of this lot


@dataclass
class HoldingResult:
    units: Decimal = Decimal(0)
    invested: int = 0  # cost basis of units still held (paise)
    realized: int = 0  # realised P&L from sells (paise)
    dividends: int = 0
    total_bought: int = 0
    flows: list[tuple[date, int]] = field(default_factory=list)
    first_date: date | None = None


def to_paise(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def compute_holding(txns: list[InvTxnInput]) -> HoldingResult:
    """Replay transactions in date order using FIFO cost basis.

    Same-day ordering: buys before sells, so a same-day buy-and-sell works.
    """
    order = {"buy": 0, "dividend": 1, "sell": 2}
    ordered = sorted(txns, key=lambda t: (t.date, order.get(t.type, 9), t.id or 0))

    res = HoldingResult()
    lots: deque[_Lot] = deque()

    for t in ordered:
        if res.first_date is None:
            res.first_date = t.date
        if t.type == "buy":
            if t.units is None or t.units <= 0:
                raise HoldingError("buy needs a positive number of units")
            lots.append(_Lot(t.date, t.units, t.amount))
            res.total_bought += t.amount
            res.flows.append((t.date, -t.amount))
        elif t.type == "sell":
            if t.units is None or t.units <= 0:
                raise HoldingError("sell needs a positive number of units")
            remaining = t.units
            cost_removed = 0
            while remaining > 0:
                if not lots:
                    raise HoldingError(
                        f"sell on {t.date.isoformat()} is for more units than were held"
                    )
                lot = lots[0]
                if lot.units <= remaining:
                    cost_removed += lot.cost
                    remaining -= lot.units
                    lots.popleft()
                else:
                    part = to_paise(Decimal(lot.cost) * remaining / lot.units)
                    lot.cost -= part
                    lot.units -= remaining
                    cost_removed += part
                    remaining = Decimal(0)
            res.realized += t.amount - cost_removed
            res.flows.append((t.date, t.amount))
        elif t.type == "dividend":
            res.dividends += t.amount
            res.flows.append((t.date, t.amount))
        else:
            raise HoldingError(f"unknown investment transaction type: {t.type!r}")

    res.units = sum((lot.units for lot in lots), Decimal(0))
    res.invested = sum(lot.cost for lot in lots)
    return res


def market_value(units: Decimal, price: Decimal) -> int:
    """Value in paise of units at a per-unit price in rupees."""
    return to_paise(units * price * 100)
