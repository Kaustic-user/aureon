"""USD→INR rate lookup from SBI's daily TT buying rates."""

from datetime import date

import pytest

from app import fx

CSV = """DATE,PDF FILE,TT BUY,TT SELL,BILL BUY,BILL SELL,FOREX TRAVEL CARD BUY,FOREX TRAVEL CARD SELL,CN BUY,CN SELL
2020-01-04 09:00,x,0.00,0.00,71.29,72.34,70.70,72.55,70.40,72.70
2024-03-14 09:00,x,82.50,83.40,82.40,83.50,0,0,0,0
2024-03-15 09:00,x,82.70,83.60,82.60,83.70,0,0,0,0
2024-03-15 13:00,x,82.80,83.70,82.70,83.80,0,0,0,0
2024-03-18 09:00,x,0.00,0.00,82.60,83.70,0,0,0,0
2024-03-19 09:00,x,82.90,83.80,82.80,83.90,0,0,0,0
bad row
"""


@pytest.fixture(autouse=True)
def fresh():
    fx._reset()
    yield
    fx._reset()


@pytest.fixture
def served(monkeypatch):
    calls = []

    def fake(url, *a, **k):
        calls.append(url)
        return CSV

    monkeypatch.setattr(fx, "fetch_text", fake)
    return calls


def test_parse_skips_blank_rates_and_keeps_last_of_a_day():
    days, rates = fx.parse_sbi_csv(CSV)
    assert days == [date(2024, 3, 14), date(2024, 3, 15), date(2024, 3, 19)]
    assert str(rates[1]) == "82.80"  # the 13:00 row replaces the 09:00 one


def test_parse_rejects_wrong_file():
    with pytest.raises(ValueError):
        fx.parse_sbi_csv("<html>not a csv</html>")


def test_lookup_uses_latest_earlier_day():
    table = fx.parse_sbi_csv(CSV)
    assert fx.lookup(table, date(2024, 3, 15))[0] == date(2024, 3, 15)
    assert fx.lookup(table, date(2024, 3, 16))[0] == date(2024, 3, 15)  # Saturday
    assert fx.lookup(table, date(2024, 3, 18))[0] == date(2024, 3, 15)  # a day with no TT rate
    assert fx.lookup(table, date(2024, 3, 1)) is None  # before the data starts


def test_endpoint_and_cache(client, served):
    r = client.get("/api/investments/fx/usd-inr", params={"date": "2024-03-16"})
    assert r.status_code == 200, r.text
    assert r.json() == {"date": "2024-03-16", "rate_date": "2024-03-15", "rate": "82.80", "source": "SBI TT buying rate"}
    # An older date is answered from the copy we hold: no second download.
    assert client.get("/api/investments/fx/usd-inr", params={"date": "2024-03-14"}).json()["rate"] == "82.50"
    assert len(served) == 1
    # And the copy sits next to the database (the test's temp folder), not elsewhere.
    assert (client.app.state.db_path.parent / fx.CACHE_NAME).exists()


def test_date_before_data_is_404(client, served):
    r = client.get("/api/investments/fx/usd-inr", params={"date": "2019-06-01"})
    assert r.status_code == 404


def test_offline_with_no_copy_is_502_and_with_a_copy_still_answers(client, monkeypatch, served):
    assert client.get("/api/investments/fx/usd-inr", params={"date": "2024-03-15"}).status_code == 200
    fx._table = None  # simulate a restart, then go offline
    fx._reset()

    def offline(*a, **k):
        raise OSError("no network")

    monkeypatch.setattr(fx, "fetch_text", offline)
    # A newer date than the file holds would normally re-download; offline we keep the copy.
    r = client.get("/api/investments/fx/usd-inr", params={"date": "2030-01-01"})
    assert r.status_code == 200 and r.json()["rate_date"] == "2024-03-19"

    (client.app.state.db_path.parent / fx.CACHE_NAME).unlink()
    fx._reset()
    assert client.get("/api/investments/fx/usd-inr", params={"date": "2024-03-15"}).status_code == 502


def test_bad_date_is_422(client):
    assert client.get("/api/investments/fx/usd-inr", params={"date": "yesterday"}).status_code == 422
    assert client.get("/api/investments/fx/usd-inr").status_code == 422
