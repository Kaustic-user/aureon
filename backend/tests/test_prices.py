from datetime import date
from decimal import Decimal

from app import prices

SAMPLE = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Index Funds)

149373;INF846K013D2;-;Axis Nifty 50 Index Fund;Direct Plan;Growth Option;15.7104;20-Nov-2026
100001;-;-;Old Fund Without Plan Columns;N.A.;20-Nov-2026
"""


def test_parse_navall():
    schemes = prices.parse_navall(SAMPLE)
    s = schemes["149373"]
    assert s.isin_growth == "INF846K013D2"
    assert s.isin_reinvest is None
    assert s.nav == Decimal("15.7104")
    assert s.nav_date == date(2026, 11, 20)
    assert "Axis Nifty 50 Index Fund" in s.name and "Direct Plan" in s.name
    assert schemes["100001"].nav is None  # "N.A." NAV is skipped, not zero


def test_search_requires_all_terms():
    schemes = prices.parse_navall(SAMPLE)
    assert [s.code for s in prices.search(schemes, "axis nifty direct")] == ["149373"]
    assert prices.search(schemes, "axis midcap") == []
