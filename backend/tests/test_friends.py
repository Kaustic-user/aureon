"""Friends and split bills: balances, reports and every rule that guards them."""

from datetime import date

import pytest

R = 100  # paise per rupee
TODAY = date.today().isoformat()
MONTH = TODAY[:7]


@pytest.fixture
def friends(client):
    out = {}
    for name in ("Asha", "Ben"):
        r = client.post("/api/friends", json={"name": name})
        assert r.status_code == 201, r.text
        out[name] = r.json()
    return out


def txn(client, expect=201, **body):
    body.setdefault("date", TODAY)
    body.setdefault("kind", "expense")
    r = client.post("/api/transactions", json=body)
    assert r.status_code == expect, r.text
    return r.json()


def balances(client):
    return {f["name"]: f["balance"] for f in client.get("/api/friends").json()}


def bank_balance(client, bank):
    return next(a["balance"] for a in client.get("/api/accounts").json() if a["id"] == bank["id"])


def spent(client):
    return client.get("/api/dashboard", params={"month": MONTH}).json()["spent"]["total"]


def test_full_lifecycle(client, bank, cats, friends):
    asha, ben = friends["Asha"]["id"], friends["Ben"]["id"]
    food = cats["Eating out"]["id"]
    start_bank = bank_balance(client, bank)
    start_nw = client.get("/api/dashboard", params={"month": MONTH}).json()["net_worth"]["value"]

    # 1. I pay a ₹1,200 dinner for three; Asha and Ben owe ₹400 each.
    dinner = txn(client, amount=1200 * R, account_id=bank["id"], category_id=food,
                 splits=[{"friend_id": asha, "amount": 400 * R}, {"friend_id": ben, "amount": 400 * R}])
    assert dinner["own_amount"] == 400 * R
    assert bank_balance(client, bank) == start_bank - 1200 * R  # the bank paid it all
    assert spent(client) == 400 * R  # but only my share is spending
    assert balances(client) == {"Asha": 400 * R, "Ben": 400 * R}
    dash = client.get("/api/dashboard", params={"month": MONTH}).json()
    assert dash["net_worth"]["value"] == start_nw - 400 * R  # money owed to me is still mine
    assert dash["budgets"]["total_spent"] == 400 * R
    assert {c["name"]: c["amount"] for c in dash["spend_by_category"]}["Food"] == 400 * R
    page = client.get("/api/transactions", params={"month": MONTH}).json()
    assert page["sum_expense"] == 400 * R

    # 2. Asha pays for my ₹150 coffee: no account moves, I now owe her back from her ₹400.
    txn(client, amount=150 * R, friend_id=asha, category_id=food)
    assert bank_balance(client, bank) == start_bank - 1200 * R
    assert spent(client) == 550 * R
    assert balances(client)["Asha"] == 250 * R

    # 3. Asha settles ₹250 into my bank: not income, balance clears.
    txn(client, kind="transfer", amount=250 * R, to_account_id=bank["id"], friend_id=asha)
    assert balances(client)["Asha"] == 0
    assert bank_balance(client, bank) == start_bank - 950 * R
    dash = client.get("/api/dashboard", params={"month": MONTH}).json()
    assert dash["income"]["total"] == 0 and dash["spent"]["total"] == 550 * R

    # 4. I lend Ben ₹100 more: transfer out of my bank to him.
    txn(client, kind="transfer", amount=100 * R, account_id=bank["id"], friend_id=ben)
    assert balances(client)["Ben"] == 500 * R

    # 5. Ben never pays: write it off. It becomes my spending.
    txn(client, amount=500 * R, friend_id=ben, category_id=cats["Gifts & donations"]["id"], note="Written off")
    assert balances(client)["Ben"] == 0
    assert spent(client) == 1050 * R

    # Ben's history: the dinner (split), the loan, the write-off.
    ben_txns = client.get("/api/transactions", params={"friend_id": ben}).json()
    assert ben_txns["total"] == 3

    # Net worth: everything I actually lost is exactly my total spending.
    nw = client.get("/api/dashboard", params={"month": MONTH}).json()["net_worth"]["value"]
    assert nw == start_nw - 1050 * R


def test_split_where_friend_owes_everything(client, bank, friends):
    t = txn(client, amount=500 * R, account_id=bank["id"], splits=[{"friend_id": friends["Asha"]["id"], "amount": 500 * R}])
    assert t["own_amount"] == 0
    assert spent(client) == 0
    assert balances(client)["Asha"] == 500 * R


def test_friend_forgives_what_i_owe(client, friends):
    asha = friends["Asha"]["id"]
    txn(client, amount=300 * R, friend_id=asha)  # she paid for me
    assert balances(client)["Asha"] == -300 * R
    txn(client, kind="income", amount=300 * R, friend_id=asha)  # she says forget it
    assert balances(client)["Asha"] == 0


def test_edit_and_delete_keep_balances_right(client, bank, friends):
    asha, ben = friends["Asha"]["id"], friends["Ben"]["id"]
    t = txn(client, amount=900 * R, account_id=bank["id"], splits=[{"friend_id": asha, "amount": 300 * R}])
    body = {"date": TODAY, "kind": "expense", "amount": 900 * R, "account_id": bank["id"]}

    # Same friend with a new amount (the unique (txn, friend) pair must not clash), plus Ben.
    r = client.put(f"/api/transactions/{t['id']}", json={**body, "splits": [{"friend_id": asha, "amount": 450 * R}, {"friend_id": ben, "amount": 450 * R}]})
    assert r.status_code == 200, r.text
    assert r.json()["own_amount"] == 0 and len(r.json()["splits"]) == 2
    assert balances(client) == {"Asha": 450 * R, "Ben": 450 * R}

    # Remove the split entirely: back to a normal expense.
    r = client.put(f"/api/transactions/{t['id']}", json=body)
    assert r.json()["own_amount"] == 900 * R and r.json()["splits"] == []
    assert balances(client) == {"Asha": 0, "Ben": 0}

    # Delete a split transaction: its shares go too.
    client.put(f"/api/transactions/{t['id']}", json={**body, "splits": [{"friend_id": asha, "amount": 100 * R}]})
    assert client.delete(f"/api/transactions/{t['id']}").status_code == 204
    assert balances(client)["Asha"] == 0
    assert client.delete(f"/api/friends/{asha}").status_code == 204  # nothing references her now


@pytest.mark.parametrize(
    "body, message",
    [
        ({"amount": 100 * R, "account": True, "splits": [{"friend_id": "A", "amount": 101 * R}]}, "more than the total"),
        ({"amount": 100 * R, "account": True, "splits": [{"friend_id": "A", "amount": 10 * R}, {"friend_id": "A", "amount": 10 * R}]}, "only once"),
        ({"kind": "income", "amount": 100 * R, "account": True, "splits": [{"friend_id": "A", "amount": 10 * R}]}, "Only expenses"),
        ({"amount": 100 * R, "friend_id": "A", "account": True}, "leave the account empty"),
        ({"amount": 100 * R, "friend_id": "A", "splits": [{"friend_id": "B", "amount": 10 * R}]}, "cannot also be split"),
        ({"amount": 100 * R}, "Pick the account"),
        ({"kind": "transfer", "amount": 100 * R, "friend_id": "A"}, "pick exactly one account"),
        ({"kind": "transfer", "amount": 100 * R, "friend_id": "A", "account": True, "to_account": True}, "pick exactly one account"),
        ({"kind": "transfer", "amount": 100 * R, "account": True, "to_account": True, "splits": [{"friend_id": "A", "amount": 1 * R}]}, "cannot be split"),
        ({"kind": "transfer", "amount": 100 * R, "to_account": True}, "source account"),
    ],
)
def test_rejects_inconsistent_transactions(client, bank, friends, body, message):
    other = client.post("/api/accounts", json={"name": "Cash", "type": "cash"}).json()
    ids = {"A": friends["Asha"]["id"], "B": friends["Ben"]["id"]}
    body = dict(body)
    if body.pop("account", False):
        body["account_id"] = bank["id"]
    if body.pop("to_account", False):
        body["to_account_id"] = other["id"]
    if "friend_id" in body:
        body["friend_id"] = ids[body["friend_id"]]
    if "splits" in body:
        body["splits"] = [{**s, "friend_id": ids[s["friend_id"]]} for s in body["splits"]]
    r = client.post("/api/transactions", json={"date": TODAY, "kind": "expense", **body})
    assert r.status_code == 422
    assert message in r.json()["detail"], r.json()
    assert balances(client) == {"Asha": 0, "Ben": 0}  # nothing half-saved


def test_friend_rules(client, bank, friends):
    asha = friends["Asha"]

    # Names are unique, ignoring case and spaces.
    assert client.post("/api/friends", json={"name": "  asha "}).status_code == 409
    assert client.put(f"/api/friends/{friends['Ben']['id']}", json={"name": "ASHA"}).status_code == 409

    # Opening balance: she owed me ₹200 before I started tracking.
    r = client.put(f"/api/friends/{asha['id']}", json={"name": "Asha", "opening_balance": 200 * R})
    assert r.json()["balance"] == 200 * R

    # Can't archive while money is owed, or delete once there is history.
    r = client.put(f"/api/friends/{asha['id']}", json={"name": "Asha", "opening_balance": 200 * R, "archived": True})
    assert r.status_code == 409 and "owes you ₹200.00" in r.json()["detail"]
    t = txn(client, kind="transfer", amount=200 * R, to_account_id=bank["id"], friend_id=asha["id"])
    assert client.delete(f"/api/friends/{asha['id']}").status_code == 409

    # Settled: archive works; she can't be used for new bills, but old ones stay editable.
    r = client.put(f"/api/friends/{asha['id']}", json={"name": "Asha", "opening_balance": 200 * R, "archived": True})
    assert r.status_code == 200, r.text
    r = client.post("/api/transactions", json={"date": TODAY, "kind": "expense", "amount": 100 * R, "friend_id": asha["id"]})
    assert r.status_code == 422 and "archived" in r.json()["detail"]
    r = client.put(f"/api/transactions/{t['id']}", json={"date": TODAY, "kind": "transfer", "amount": 200 * R, "to_account_id": bank["id"], "friend_id": asha["id"], "note": "edited"})
    assert r.status_code == 200, r.text
    assert client.get("/api/friends").json()[-1]["last_activity"] == TODAY  # archived listed last


def test_unknown_friend_is_404(client, bank):
    r = client.post("/api/transactions", json={"date": TODAY, "kind": "expense", "amount": 100, "account_id": bank["id"], "splits": [{"friend_id": 999, "amount": 50}]})
    assert r.status_code == 404
