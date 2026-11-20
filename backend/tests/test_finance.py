from datetime import date
from decimal import Decimal

import pytest

from app import finance
from app.finance import InvTxnInput as T


# ------------------------------------------------------------------- XIRR


def test_xirr_one_year_ten_percent():
    r = finance.xirr([(date(2025, 1, 1), -100_000), (date(2026, 1, 1), 110_000)])
    assert r == pytest.approx(0.10, abs=1e-6)


def test_xirr_matches_excel_reference():
    # Reference case from the Excel XIRR documentation: result 0.373362535
    flows = [
        (date(2008, 1, 1), -10_000),
        (date(2008, 3, 1), 2_750),
        (date(2008, 10, 30), 4_250),
        (date(2009, 2, 15), 3_250),
        (date(2009, 4, 1), 2_750),
    ]
    assert finance.xirr(flows) == pytest.approx(0.373362535, abs=1e-6)


def test_xirr_negative_return():
    r = finance.xirr([(date(2025, 1, 1), -100_000), (date(2026, 1, 1), 80_000)])
    assert r == pytest.approx(-0.20, abs=1e-6)


def test_xirr_undefined_cases():
    assert finance.xirr([]) is None
    assert finance.xirr([(date(2025, 1, 1), -100)]) is None
    assert finance.xirr([(date(2025, 1, 1), -100), (date(2025, 6, 1), -100)]) is None
    # Too short to annualise meaningfully
    assert finance.xirr([(date(2025, 1, 1), -100), (date(2025, 1, 10), 101)]) is None


# -------------------------------------------------------------------- FIFO


def test_fifo_partial_sell_realises_oldest_lot_first():
    res = finance.compute_holding([
        T(date(2025, 1, 1), "buy", 100_000, Decimal(10)),  # ₹100/unit
        T(date(2025, 2, 1), "buy", 120_000, Decimal(10)),  # ₹120/unit
        T(date(2025, 3, 1), "sell", 195_000, Decimal(15)),  # ₹130/unit
    ])
    # Cost of units sold: 10 @100 + 5 @120 = 1,000 + 600 = ₹1,600
    assert res.units == Decimal(5)
    assert res.invested == 60_000
    assert res.realized == 195_000 - 160_000


def test_fifo_dividend_and_flows():
    res = finance.compute_holding([
        T(date(2025, 1, 1), "buy", 50_000, Decimal("12.345")),
        T(date(2025, 6, 1), "dividend", 2_100),
    ])
    assert res.dividends == 2_100
    assert res.flows == [(date(2025, 1, 1), -50_000), (date(2025, 6, 1), 2_100)]


def test_fifo_same_day_buy_then_sell_is_allowed():
    res = finance.compute_holding([
        T(date(2025, 1, 1), "sell", 11_000, Decimal(1), id=1),
        T(date(2025, 1, 1), "buy", 10_000, Decimal(1), id=2),
    ])
    assert res.units == 0
    assert res.realized == 1_000


def test_fifo_overselling_is_rejected():
    with pytest.raises(finance.HoldingError):
        finance.compute_holding([
            T(date(2025, 1, 1), "buy", 10_000, Decimal(1)),
            T(date(2025, 2, 1), "sell", 30_000, Decimal(2)),
        ])


def test_market_value_rounds_to_paise():
    assert finance.market_value(Decimal("12.345"), Decimal("15.7104")) == 19394  # ₹193.94


# ------------------------------------------------------------------- dates


def test_add_months_clamps_and_keeps_anchor():
    assert finance.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert finance.add_months(date(2026, 2, 28), 1, anchor_day=31) == date(2026, 3, 31)
    assert finance.add_months(date(2026, 12, 5), 1) == date(2027, 1, 5)


def test_month_helpers():
    assert finance.shift_month("2026-01", -1) == "2025-12"
    assert finance.month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))
    with pytest.raises(ValueError):
        finance.parse_month("2026-13")
