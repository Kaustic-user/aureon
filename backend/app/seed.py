"""Fill a database with ~7 months of realistic sample data, for trying the UI.

    .venv/Scripts/python -m app.seed --db ../data/aureon-demo.db

Refuses to run on a database that already has transactions, so it can never
mix sample data into your real records. Use a separate --db file for demos.
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from sqlalchemy import func, select

from . import config, finance
from .db import make_engine, make_sessionmaker, run_migrations
from .models import (
    Account,
    Budget,
    Category,
    Instrument,
    InvestmentTxn,
    PriceSnapshot,
    RecurringRule,
    Transaction,
)
from .services import ensure_defaults

R = 100  # paise per rupee


def _cat(cats: dict[str, Category], name: str) -> int:
    return cats[name].id


def seed(path: Path, today: date | None = None) -> None:
    today = today or date.today()
    rng = random.Random(42)
    run_migrations(path)
    Session = make_sessionmaker(make_engine(path))
    with Session() as s:
        ensure_defaults(s)
        if s.scalar(select(func.count()).select_from(Transaction)):
            sys.exit(f"Refusing to seed: {path} already has transactions.")

        cats = {c.name: c for c in s.scalars(select(Category))}
        bank = Account(name="HDFC Savings", type="bank", opening_balance=150_000 * R)
        card = Account(name="ICICI Amazon Card", type="credit_card", opening_balance=0)
        cash = Account(name="Cash", type="cash", opening_balance=3_000 * R)
        upi = Account(name="Paytm Wallet", type="wallet", opening_balance=500 * R)
        s.add_all([bank, card, cash, upi])
        s.flush()

        def txn(d, kind, amount_rs, account, category=None, merchant=None, note=None, to=None):
            s.add(
                Transaction(
                    date=d,
                    kind=kind,
                    amount=int(Decimal(str(amount_rs)) * R),
                    account_id=account.id,
                    to_account_id=to.id if to else None,
                    category_id=_cat(cats, category) if category else None,
                    merchant=merchant,
                    note=note,
                    source="demo",
                )
            )

        start_month = finance.shift_month(finance.month_key(today), -6)
        eating = ["Swiggy", "Zomato", "Blue Tokai", "Chai Point", "Third Wave Coffee", "Truffles"]
        grocery = ["BigBasket", "Zepto", "Blinkit", "DMart"]
        transport = ["Uber", "Ola", "Rapido", "Namma Metro"]
        shopping = ["Amazon", "Myntra", "Decathlon", "Croma"]

        for i in range(7):
            m = finance.shift_month(start_month, i)
            ms, me = finance.month_bounds(m)
            me = min(me, today)
            if ms > today:
                break

            def day(n: int) -> date | None:
                d = ms + timedelta(days=n - 1)
                return d if d <= me else None

            if d := day(1):
                txn(d, "income", 80_000, bank, "Salary", "Qualcomm", "Monthly salary")
                txn(d, "expense", 14_000, bank, "Rent", "Rent · Flat 204")
            if d := day(3):
                txn(d, "expense", 649, card, "Subscriptions", "Netflix")
            if d := day(7):
                txn(d, "expense", rng.choice([799, 999]), bank, "Phone & internet", "Airtel Fiber")
            if d := day(12):
                txn(d, "expense", rng.randint(900, 1600), bank, "Utilities", "BESCOM", "Electricity")
            if d := day(28):
                txn(d, "income", rng.randint(400, 600), bank, "Interest", "HDFC Bank", "Savings interest")
            if d := day(2):
                txn(d, "transfer", 4_000, bank, merchant="Wallet top-up", to=upi)
                txn(d, "transfer", 1_500, bank, merchant="ATM withdrawal", to=cash)

            n_days = (me - ms).days + 1
            for k in range(n_days):
                d = ms + timedelta(days=k)
                if rng.random() < 0.55:
                    txn(d, "expense", rng.choice([120, 180, 240, 320, 450, 600]), rng.choice([card, upi]),
                        rng.choice(["Eating out", "Coffee & snacks"]), rng.choice(eating))
                if rng.random() < 0.35:
                    txn(d, "expense", rng.choice([60, 90, 140, 220, 310]), rng.choice([upi, cash]),
                        "Local travel", rng.choice(transport))
                if d.weekday() == 5:
                    txn(d, "expense", rng.randint(900, 2_800), card, "Groceries", rng.choice(grocery))
            if (d := day(rng.randint(8, 25))):
                txn(d, "expense", rng.randint(1_200, 5_500), card, "Shopping", rng.choice(shopping))
            if (d := day(rng.randint(5, 25))) and rng.random() < 0.6:
                txn(d, "expense", rng.choice([450, 700, 1_200]), card, "Entertainment",
                    rng.choice(["PVR INOX", "BookMyShow", "Steam"]))
            if (d := day(rng.randint(10, 20))) and rng.random() < 0.4:
                txn(d, "expense", rng.randint(300, 1_800), bank, "Health", rng.choice(["Apollo Pharmacy", "Practo"]))
            if i == 3 and (d := day(18)):
                txn(d, "expense", 6_400, card, "Flights & trains", "IRCTC", "Goa trip")
                txn(d + timedelta(days=1), "expense", 7_800, card, "Hotels", "Zostel Goa", "Goa trip")

        s.flush()
        # Pay the credit card bill each month (transfer bank -> card) for the previous month.
        for i in range(1, 7):
            m = finance.shift_month(start_month, i)
            ms, _ = finance.month_bounds(m)
            pay_day = ms + timedelta(days=17)
            if pay_day > today:
                break
            pm_s, pm_e = finance.month_bounds(finance.shift_month(m, -1))
            owed = s.scalar(
                select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                    Transaction.account_id == card.id, Transaction.kind == "expense",
                    Transaction.date >= pm_s, Transaction.date <= pm_e,
                )
            )
            if owed:
                s.add(Transaction(date=pay_day, kind="transfer", amount=owed, account_id=bank.id,
                                  to_account_id=card.id, merchant="ICICI card bill", source="demo"))

        # ---------------------------------------------------- investments
        nifty = Instrument(kind="mutual_fund", name="Axis Nifty 50 Index Fund · Direct · Growth",
                           symbol="149373", isin="INF846K013D2", sub_category="Index")
        flexi = Instrument(kind="mutual_fund", name="Parag Parikh Flexi Cap Fund · Direct · Growth",
                           symbol="122639", isin="INF879O01027", sub_category="Flexi cap")
        infy = Instrument(kind="stock", name="Infosys", symbol="INFY", exchange="NSE", sub_category="IT")
        hdfcb = Instrument(kind="stock", name="HDFC Bank", symbol="HDFCBANK", exchange="NSE", sub_category="Banking")
        tata = Instrument(kind="stock", name="Tata Motors", symbol="TATAMOTORS", exchange="NSE", sub_category="Auto")
        s.add_all([nifty, flexi, infy, hdfcb, tata])
        s.flush()

        def price_walk(start_price: float, drift: float, vol: float, start: date, end: date) -> dict[date, Decimal]:
            out, p, d = {}, start_price, start
            while d <= end:
                if d.weekday() < 5:
                    p *= 1 + drift + rng.gauss(0, vol)
                    out[d] = Decimal(str(p)).quantize(Decimal("0.0001"), ROUND_HALF_UP)
                d += timedelta(days=1)
            return out

        first = finance.month_bounds(start_month)[0]
        series = {
            nifty.id: price_walk(14.20, 0.0006, 0.008, first, today),
            flexi.id: price_walk(78.0, 0.0008, 0.007, first, today),
            infy.id: price_walk(1_620.0, -0.0003, 0.013, first, today),
            hdfcb.id: price_walk(1_710.0, 0.0004, 0.010, first, today),
            tata.id: price_walk(930.0, -0.0006, 0.017, first, today),
        }
        for inst_id, ser in series.items():
            for d, p in ser.items():
                s.add(PriceSnapshot(instrument_id=inst_id, date=d, price=p, source="demo"))

        def price_on(inst_id: int, d: date) -> tuple[date, Decimal]:
            while d not in series[inst_id]:
                d += timedelta(days=1)
            return d, series[inst_id][d]

        def buy(inst, d, amount_rs=None, units=None):
            d, p = price_on(inst.id, d)
            if d > today:
                return
            if units is None:
                units = (Decimal(amount_rs) / p).quantize(Decimal("0.001"), ROUND_HALF_UP)
                amount = amount_rs * R
            else:
                units = Decimal(units)
                amount = finance.to_paise(units * p * 100) + 20 * R  # brokerage + charges
            s.add(InvestmentTxn(instrument_id=inst.id, account_id=bank.id, date=d, type="buy",
                                units=units, price=p, amount=amount, note="demo"))

        for i in range(7):
            ms, _ = finance.month_bounds(finance.shift_month(start_month, i))
            buy(nifty, ms + timedelta(days=4), 10_000)
            buy(flexi, ms + timedelta(days=4), 5_000)
        buy(infy, first + timedelta(days=9), units=10)
        buy(hdfcb, first + timedelta(days=40), units=8)
        buy(tata, first + timedelta(days=70), units=15)
        buy(infy, first + timedelta(days=120), units=5)
        sell_d, sell_p = price_on(tata.id, first + timedelta(days=150))
        if sell_d <= today:
            s.add(InvestmentTxn(instrument_id=tata.id, account_id=bank.id, date=sell_d, type="sell",
                                units=Decimal(5), price=sell_p, amount=finance.to_paise(5 * sell_p * 100) - 20 * R))
        div_d = first + timedelta(days=100)
        if div_d <= today:
            s.add(InvestmentTxn(instrument_id=infy.id, account_id=bank.id, date=div_d, type="dividend",
                                amount=10 * 21 * R, note="Interim dividend ₹21/share"))

        # ------------------------------------------------ recurring + budgets
        this_month = finance.month_key(today)
        nm_start = finance.month_bounds(finance.shift_month(this_month, 1))[0]
        s.add_all([
            RecurringRule(name="Rent", kind="expense", amount=14_000 * R, account_id=bank.id,
                          category_id=_cat(cats, "Rent"), frequency="monthly", next_date=nm_start),
            RecurringRule(name="Netflix", kind="expense", amount=649 * R, account_id=card.id,
                          category_id=_cat(cats, "Subscriptions"), frequency="monthly",
                          next_date=nm_start + timedelta(days=2)),
            RecurringRule(name="Salary", kind="income", amount=80_000 * R, account_id=bank.id,
                          category_id=_cat(cats, "Salary"), frequency="monthly", next_date=nm_start),
            RecurringRule(name="Car insurance", kind="expense", amount=8_200 * R, account_id=bank.id,
                          category_id=_cat(cats, "Insurance"), frequency="yearly",
                          next_date=today + timedelta(days=21)),
            RecurringRule(name="Airtel Fiber", kind="expense", amount=999 * R, account_id=bank.id,
                          category_id=_cat(cats, "Phone & internet"), frequency="monthly",
                          next_date=finance.add_months(date(today.year, today.month, 7), 1)),
        ])
        plan = {"Food": 9_000, "Transport": 2_500, "Housing": 16_000, "Bills": 2_000, "Shopping": 4_000,
                "Entertainment": 2_000, "Subscriptions": 800, "Health": 1_500, "Travel": 3_000}
        for back in (1, 0):
            m = finance.shift_month(this_month, -back)
            for name, amt in plan.items():
                s.add(Budget(category_id=_cat(cats, name), month=m, amount=amt * R))

        s.commit()
        n = s.scalar(select(func.count()).select_from(Transaction))
        print(f"Seeded {n} transactions, 5 instruments into {path}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, help="database file (default: AUREON_DB_PATH or the standard location)")
    args = ap.parse_args()
    seed(args.db or config.db_path())


if __name__ == "__main__":
    main()
