import json
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app import finance

TODAY = date.today()
MONTH = finance.month_key(TODAY)


def add_txn(client, **kw):
    r = client.post("/api/transactions", json={"date": TODAY.isoformat(), **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_rejects_non_localhost_host_header(tmp_path):
    from app.main import create_app

    with TestClient(create_app(db_path=tmp_path / "h.db"), base_url="http://evil.example") as c:
        assert c.get("/api/health").status_code == 400


def test_default_categories_created_once(client):
    cats = client.get("/api/categories").json()
    names = {c["name"] for c in cats}
    assert {"Food", "Groceries", "Salary", "Rent"} <= names
    groceries = next(c for c in cats if c["name"] == "Groceries")
    food = next(c for c in cats if c["name"] == "Food")
    assert groceries["parent_id"] == food["id"]


def test_balance_is_derived_from_transactions(client, bank, cats):
    wallet = client.post("/api/accounts", json={"name": "Wallet", "type": "wallet"}).json()
    add_txn(client, kind="income", amount=50_000_00, account_id=bank["id"], category_id=cats["Salary"]["id"])
    add_txn(client, kind="expense", amount=1_234_50, account_id=bank["id"], category_id=cats["Groceries"]["id"])
    add_txn(client, kind="transfer", amount=2_000_00, account_id=bank["id"], to_account_id=wallet["id"])

    balances = {a["name"]: a["balance"] for a in client.get("/api/accounts").json()}
    assert balances["Bank"] == 100_000_00 + 50_000_00 - 1_234_50 - 2_000_00
    assert balances["Wallet"] == 2_000_00


def test_transaction_validation(client, bank, cats):
    base = {"date": TODAY.isoformat(), "account_id": bank["id"]}
    # Amount must be positive
    assert client.post("/api/transactions", json={**base, "kind": "expense", "amount": 0}).status_code == 422
    # Income category on an expense
    r = client.post("/api/transactions", json={**base, "kind": "expense", "amount": 100, "category_id": cats["Salary"]["id"]})
    assert r.status_code == 422
    # Transfer to the same account
    r = client.post("/api/transactions", json={**base, "kind": "transfer", "amount": 100, "to_account_id": bank["id"]})
    assert r.status_code == 422


def test_edit_and_delete_are_audited(client, bank, cats):
    t = add_txn(client, kind="expense", amount=500_00, account_id=bank["id"], category_id=cats["Eating out"]["id"], merchant="Swiggy")
    body = {**{k: t[k] for k in ("date", "kind", "account_id", "category_id", "merchant")}, "amount": 450_00}
    assert client.put(f"/api/transactions/{t['id']}", json=body).json()["amount"] == 450_00
    assert client.delete(f"/api/transactions/{t['id']}").status_code == 204

    from sqlalchemy import select

    from app.models import AuditLog

    with client.app.state.sessionmaker() as s:
        logs = s.scalars(
            select(AuditLog)
            .where(AuditLog.entity == "transaction", AuditLog.entity_id == t["id"])
            .order_by(AuditLog.id)
        ).all()
    assert [l.action for l in logs] == ["create", "update", "delete"]
    assert json.loads(logs[1].changes) == {"amount": {"from": 500_00, "to": 450_00}}


def test_account_with_history_cannot_be_deleted(client, bank, cats):
    add_txn(client, kind="expense", amount=100, account_id=bank["id"], category_id=cats["Food"]["id"])
    assert client.delete(f"/api/accounts/{bank['id']}").status_code == 409


def test_filters_include_subcategories_and_search(client, bank, cats):
    add_txn(client, kind="expense", amount=300_00, account_id=bank["id"], category_id=cats["Groceries"]["id"], merchant="BigBasket")
    add_txn(client, kind="expense", amount=200_00, account_id=bank["id"], category_id=cats["Eating out"]["id"], merchant="Zomato")
    add_txn(client, kind="expense", amount=900_00, account_id=bank["id"], category_id=cats["Shopping"]["id"], merchant="Amazon")

    food = client.get("/api/transactions", params={"category_id": cats["Food"]["id"]}).json()
    assert food["total"] == 2 and food["sum_expense"] == 500_00
    found = client.get("/api/transactions", params={"q": "basket"}).json()
    assert [t["merchant"] for t in found["items"]] == ["BigBasket"]


def test_budgets_roll_up_subcategories(client, bank, cats):
    add_txn(client, kind="expense", amount=300_00, account_id=bank["id"], category_id=cats["Groceries"]["id"])
    add_txn(client, kind="expense", amount=200_00, account_id=bank["id"], category_id=cats["Eating out"]["id"])
    r = client.put("/api/budgets", json={"category_id": cats["Food"]["id"], "month": MONTH, "amount": 1_000_00})
    row = next(x for x in r.json()["rows"] if x["name"] == "Food")
    assert row == {"category_id": cats["Food"]["id"], "name": "Food", "color": cats["Food"]["color"], "budget": 1_000_00, "spent": 500_00}

    nxt = finance.shift_month(MONTH, 1)
    copied = client.post("/api/budgets/copy", params={"from_month": MONTH, "to_month": nxt}).json()
    assert next(x for x in copied["rows"] if x["name"] == "Food")["budget"] == 1_000_00

    # amount 0 removes it
    r = client.put("/api/budgets", json={"category_id": cats["Food"]["id"], "month": MONTH, "amount": 0})
    assert next(x for x in r.json()["rows"] if x["name"] == "Food")["budget"] is None


def test_recurring_post_creates_transaction_and_advances(client, bank, cats):
    start = date(TODAY.year, TODAY.month, 1)
    rule = client.post("/api/recurring", json={
        "name": "Rent", "kind": "expense", "amount": 14_000_00, "account_id": bank["id"],
        "category_id": cats["Rent"]["id"], "frequency": "monthly", "next_date": start.isoformat(),
    }).json()
    up = client.get("/api/upcoming").json()
    assert up[0]["name"] == "Rent"

    txn = client.post(f"/api/recurring/{rule['id']}/post").json()
    assert txn["amount"] == 14_000_00 and txn["source"] == "recurring" and txn["date"] == start.isoformat()
    rules = client.get("/api/recurring").json()
    assert rules[0]["next_date"] == finance.add_months(start, 1).isoformat()


def test_investments_portfolio_and_oversell_guard(client, bank):
    fund = client.post("/api/investments/instruments", json={
        "kind": "mutual_fund", "name": "Index Fund", "symbol": "149373",
    }).json()
    d0 = TODAY - timedelta(days=400)
    r = client.post("/api/investments/txns", json={
        "instrument_id": fund["id"], "account_id": bank["id"], "date": d0.isoformat(),
        "type": "buy", "units": "1000", "price": "10", "amount": 10_000_00,
    })
    assert r.status_code == 201, r.text
    # Oversell is rejected
    r = client.post("/api/investments/txns", json={
        "instrument_id": fund["id"], "date": TODAY.isoformat(), "type": "sell", "units": "2000", "amount": 100,
    })
    assert r.status_code == 422

    client.post("/api/investments/prices", json={"instrument_id": fund["id"], "date": TODAY.isoformat(), "price": "12.5"})
    pf = client.get("/api/investments/portfolio").json()
    h = pf["holdings"][0]
    assert h["units"] == "1000" and h["invested"] == 10_000_00
    assert h["value"] == 12_500_00 and h["unrealized"] == 2_500_00
    assert h["xirr"] is not None and 0.2 < h["xirr"] < 0.3
    assert pf["totals"]["value"] == 12_500_00

    # Buy was funded from the bank account
    bal = {a["name"]: a["balance"] for a in client.get("/api/accounts").json()}
    assert bal["Bank"] == 100_000_00 - 10_000_00


def test_vest_adds_shares_without_touching_accounts_or_invested(client, bank):
    qcom = client.post("/api/investments/instruments", json={
        "kind": "stock", "name": "Qualcomm", "symbol": "QCOM", "exchange": "NASDAQ",
    }).json()
    base = {"instrument_id": qcom["id"], "date": TODAY.isoformat(), "type": "vest", "units": "10", "amount": 1_50_000_00}

    # A vest is never paid from an account, and needs units
    assert client.post("/api/investments/txns", json={**base, "account_id": bank["id"]}).status_code == 422
    assert client.post("/api/investments/txns", json={**base, "units": None}).status_code == 422
    assert client.post("/api/investments/txns", json=base).status_code == 201

    h = client.get("/api/investments/portfolio").json()["holdings"][0]
    assert h["units"] == "10" and h["invested"] == 1_50_000_00

    # Vested shares can be sold like bought ones (FIFO cost = vest value)
    r = client.post("/api/investments/txns", json={**base, "type": "sell", "units": "4", "amount": 70_000_00})
    assert r.status_code == 201, r.text
    h = client.get("/api/investments/portfolio").json()["holdings"][0]
    assert h["units"] == "6" and h["realized"] == 70_000_00 - 60_000_00

    # Bank balance untouched; Overview's "invested" excludes vests
    bal = {a["name"]: a["balance"] for a in client.get("/api/accounts").json()}
    assert bal["Bank"] == 100_000_00
    assert client.get("/api/dashboard", params={"month": MONTH}).json()["invested"] == 0


def test_dashboard_numbers(client, bank, cats):
    add_txn(client, kind="income", amount=80_000_00, account_id=bank["id"], category_id=cats["Salary"]["id"])
    add_txn(client, kind="expense", amount=20_000_00, account_id=bank["id"], category_id=cats["Rent"]["id"])
    d = client.get("/api/dashboard", params={"month": MONTH}).json()
    assert d["income"]["total"] == 80_000_00
    assert d["spent"]["total"] == 20_000_00
    assert d["savings"]["rate"] == 0.75
    assert d["net_worth"]["value"] == 100_000_00 + 60_000_00
    assert d["spend_by_category"][0]["name"] == "Housing"
    assert len(d["cash_flow"]) == 6
    assert d["net_worth_trend"][-1]["value"] == 160_000_00


def test_daily_spend_is_cumulative_and_stops_today(client, bank, cats):
    add_txn(client, kind="expense", amount=100_00, account_id=bank["id"], category_id=cats["Rent"]["id"])
    add_txn(client, kind="expense", amount=50_00, account_id=bank["id"], category_id=cats["Rent"]["id"])
    add_txn(client, kind="income", amount=999_00, account_id=bank["id"], category_id=cats["Salary"]["id"])
    wallet = client.post("/api/accounts", json={"name": "W", "type": "wallet"}).json()
    add_txn(client, kind="transfer", amount=70_00, account_id=bank["id"], to_account_id=wallet["id"])

    days = client.get("/api/dashboard", params={"month": MONTH}).json()["daily_spend"]
    by_day = {d["day"]: d for d in days}
    assert by_day[TODAY.day]["current"] == 150_00  # income and transfers are not spend
    assert by_day[1]["current"] in (0, 150_00)
    assert all(d["current"] is None for d in days if d["day"] > TODAY.day)
    cur = [d["current"] for d in days if d["current"] is not None]
    assert cur == sorted(cur)  # cumulative never goes down


def test_portfolio_history_value_vs_cost(client, bank):
    assert client.get("/api/investments/history").json() == []
    fund = client.post(
        "/api/investments/instruments", json={"kind": "mutual_fund", "name": "Fund", "symbol": "1"}
    ).json()
    start = TODAY - timedelta(days=30)
    client.post(
        "/api/investments/txns",
        json={"instrument_id": fund["id"], "account_id": bank["id"], "date": start.isoformat(),
              "type": "buy", "units": "1000", "price": "10", "amount": 10_000_00},
    )
    client.post("/api/investments/prices", json={"instrument_id": fund["id"], "date": TODAY.isoformat(), "price": "12"})
    h = client.get("/api/investments/history").json()
    assert h[0]["date"] == start.isoformat() and h[-1]["date"] == TODAY.isoformat()
    assert all(p["invested"] == 10_000_00 for p in h)
    assert h[-1]["value"] == 12_000_00


def test_bad_month_is_422(client):
    assert client.get("/api/dashboard", params={"month": "2026-13"}).status_code == 422
