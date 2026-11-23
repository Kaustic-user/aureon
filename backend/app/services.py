"""Queries and derived numbers.

Rule from the requirements: balances, net worth and portfolio values are
always derived from transactions and price snapshots, never typed in.
"""

from __future__ import annotations

import bisect
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import finance
from .models import (
    Account,
    AuditLog,
    Budget,
    Category,
    Instrument,
    InvestmentTxn,
    PriceSnapshot,
    RecurringRule,
    Transaction,
)
from .schemas import (
    BudgetMonth,
    BudgetRow,
    HoldingOut,
    InstrumentOut,
    PortfolioOut,
    PortfolioTotals,
    UpcomingItem,
)

# ------------------------------------------------------------------ audit


def audit(session: Session, entity: str, entity_id: int, action: str, changes: dict) -> None:
    session.add(
        AuditLog(
            entity=entity,
            entity_id=entity_id,
            action=action,
            changes=json.dumps(changes, default=str, sort_keys=True),
        )
    )


def snapshot(obj, fields: list[str]) -> dict:
    return {f: getattr(obj, f) for f in fields}


# --------------------------------------------------------------- defaults

DEFAULT_EXPENSE_CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("Food", "#f59e0b", ["Groceries", "Eating out", "Coffee & snacks"]),
    ("Transport", "#38bdf8", ["Local travel", "Fuel"]),
    ("Travel", "#818cf8", ["Flights & trains", "Hotels"]),
    ("Housing", "#a78bfa", ["Rent", "Utilities", "Maintenance"]),
    ("Bills", "#f472b6", ["Phone & internet", "EMIs", "Insurance"]),
    ("Shopping", "#fb7185", []),
    ("Health", "#34d399", []),
    ("Entertainment", "#facc15", []),
    ("Subscriptions", "#c084fc", []),
    ("Education", "#60a5fa", []),
    ("Personal care", "#2dd4bf", []),
    ("Gifts & donations", "#fda4af", []),
    ("Taxes", "#94a3b8", []),
    ("Other", "#71717a", []),
]
DEFAULT_INCOME_CATEGORIES: list[tuple[str, str]] = [
    ("Salary", "#4ade80"),
    ("Freelance", "#22d3ee"),
    ("Interest", "#a3e635"),
    ("Dividends", "#86efac"),
    ("Refunds", "#67e8f9"),
    ("Gifts received", "#fde047"),
    ("Other income", "#a1a1aa"),
]


def ensure_defaults(session: Session) -> None:
    """First run only: create the default category tree."""
    if session.scalar(select(func.count()).select_from(Category)):
        return
    for name, color, children in DEFAULT_EXPENSE_CATEGORIES:
        parent = Category(name=name, kind="expense", color=color)
        session.add(parent)
        session.flush()
        for child in children:
            session.add(Category(name=child, kind="expense", color=color, parent_id=parent.id))
    for name, color in DEFAULT_INCOME_CATEGORIES:
        session.add(Category(name=name, kind="income", color=color))
    session.commit()


# --------------------------------------------------------------- accounts


def account_balances(session: Session, as_of: date | None = None) -> dict[int, int]:
    """Balance per account in paise, including investment cash flows."""
    bal: dict[int, int] = {
        a.id: a.opening_balance for a in session.scalars(select(Account))
    }

    q = select(Transaction.account_id, Transaction.kind, func.sum(Transaction.amount)).group_by(
        Transaction.account_id, Transaction.kind
    )
    if as_of:
        q = q.where(Transaction.date <= as_of)
    for account_id, kind, total in session.execute(q):
        bal[account_id] = bal.get(account_id, 0) + (total if kind == "income" else -total)

    q = (
        select(Transaction.to_account_id, func.sum(Transaction.amount))
        .where(Transaction.kind == "transfer", Transaction.to_account_id.is_not(None))
        .group_by(Transaction.to_account_id)
    )
    if as_of:
        q = q.where(Transaction.date <= as_of)
    for account_id, total in session.execute(q):
        bal[account_id] = bal.get(account_id, 0) + total

    q = (
        select(InvestmentTxn.account_id, InvestmentTxn.type, func.sum(InvestmentTxn.amount))
        .where(InvestmentTxn.account_id.is_not(None))
        .group_by(InvestmentTxn.account_id, InvestmentTxn.type)
    )
    if as_of:
        q = q.where(InvestmentTxn.date <= as_of)
    for account_id, typ, total in session.execute(q):
        bal[account_id] = bal.get(account_id, 0) + (-total if typ == "buy" else total)

    return bal


# -------------------------------------------------------------- categories


def category_rollup_map(session: Session) -> dict[int, Category]:
    """category id -> its top-level category (itself if top-level)."""
    cats = {c.id: c for c in session.scalars(select(Category))}
    out: dict[int, Category] = {}
    for cid, c in cats.items():
        top = c
        seen = set()
        while top.parent_id is not None and top.parent_id in cats and top.id not in seen:
            seen.add(top.id)
            top = cats[top.parent_id]
        out[cid] = top
    return out


def descendant_ids(session: Session, category_id: int) -> list[int]:
    children: dict[int | None, list[int]] = defaultdict(list)
    for cid, pid in session.execute(select(Category.id, Category.parent_id)):
        children[pid].append(cid)
    out, stack = [], [category_id]
    while stack:
        cid = stack.pop()
        if cid in out:
            continue
        out.append(cid)
        stack.extend(children.get(cid, []))
    return out


# ------------------------------------------------------------ portfolio


@dataclass
class _PriceSeries:
    dates: list[date]
    prices: list[Decimal]
    sources: list[str]

    def at(self, d: date) -> tuple[Decimal, date, str] | None:
        i = bisect.bisect_right(self.dates, d) - 1
        if i < 0:
            return None
        return self.prices[i], self.dates[i], self.sources[i]

    def previous(self, d: date) -> Decimal | None:
        i = bisect.bisect_right(self.dates, d) - 2
        return self.prices[i] if i >= 0 else None


def _price_series(session: Session) -> dict[int, _PriceSeries]:
    series: dict[int, _PriceSeries] = {}
    for p in session.scalars(select(PriceSnapshot).order_by(PriceSnapshot.date)):
        s = series.setdefault(p.instrument_id, _PriceSeries([], [], []))
        s.dates.append(p.date)
        s.prices.append(p.price)
        s.sources.append(p.source)
    return series


def _inv_inputs(session: Session) -> dict[int, list[finance.InvTxnInput]]:
    out: dict[int, list[finance.InvTxnInput]] = defaultdict(list)
    for t in session.scalars(select(InvestmentTxn)):
        out[t.instrument_id].append(
            finance.InvTxnInput(date=t.date, type=t.type, amount=t.amount, units=t.units, id=t.id)
        )
    return out


def _pct(part: int, whole: int) -> float | None:
    return part / whole if whole else None


def _totals(holdings: list[HoldingOut], flows: list[tuple[date, int]], today: date) -> PortfolioTotals:
    invested = sum(h.invested for h in holdings)
    value = sum(h.value if h.value is not None else h.invested for h in holdings)
    unrealized = value - invested
    all_flows = list(flows)
    if value:
        all_flows.append((today, value))
    return PortfolioTotals(
        invested=invested,
        value=value,
        unrealized=unrealized,
        unrealized_pct=_pct(unrealized, invested),
        realized=sum(h.realized for h in holdings),
        dividends=sum(h.dividends for h in holdings),
        day_change=sum(h.day_change or 0 for h in holdings),
        xirr=finance.xirr(all_flows),
        missing_prices=sum(1 for h in holdings if h.value is None and h.units > 0),
    )


def portfolio(session: Session, today: date | None = None, include_closed: bool = False) -> PortfolioOut:
    today = today or date.today()
    prices = _price_series(session)
    inputs = _inv_inputs(session)
    holdings: list[HoldingOut] = []
    flows_by_kind: dict[str, list[tuple[date, int]]] = defaultdict(list)

    for inst in session.scalars(select(Instrument).order_by(Instrument.name)):
        txns = inputs.get(inst.id, [])
        res = finance.compute_holding(txns)
        if not include_closed and res.units == 0 and inst.archived:
            continue
        if not txns and inst.archived:
            continue

        priced = prices.get(inst.id)
        quote = priced.at(today) if priced else None
        value = unrealized = day_change = None
        unrealized_pct = None
        price = price_date = price_source = None
        if quote:
            price, price_date, price_source = quote
            value = finance.market_value(res.units, price)
            unrealized = value - res.invested
            unrealized_pct = _pct(unrealized, res.invested)
            prev = priced.previous(today) if priced else None
            if prev is not None:
                day_change = finance.market_value(res.units, price - prev)

        flows = list(res.flows)
        if res.units > 0 and value is not None:
            flows.append((today, value))
        holdings.append(
            HoldingOut(
                instrument=InstrumentOut.model_validate(inst),
                units=res.units,
                invested=res.invested,
                value=value,
                price=price,
                price_date=price_date,
                price_source=price_source,
                unrealized=unrealized,
                unrealized_pct=unrealized_pct,
                realized=res.realized,
                dividends=res.dividends,
                day_change=day_change,
                xirr=finance.xirr(flows) if res.units > 0 and value is not None else None,
            )
        )
        flows_by_kind[inst.kind].extend(res.flows)

    all_flows = [f for fl in flows_by_kind.values() for f in fl]
    by_kind = {
        kind: _totals([h for h in holdings if h.instrument.kind == kind], flows_by_kind[kind], today)
        for kind in ("mutual_fund", "stock")
    }
    return PortfolioOut(holdings=holdings, totals=_totals(holdings, all_flows, today), by_kind=by_kind)


def portfolio_value_at(
    d: date,
    inputs: dict[int, list[finance.InvTxnInput]],
    prices: dict[int, _PriceSeries],
) -> int:
    """Market value of all holdings on date d (cost basis if no price yet)."""
    total = 0
    for inst_id, txns in inputs.items():
        upto = [t for t in txns if t.date <= d]
        if not upto:
            continue
        res = finance.compute_holding(upto)
        if res.units == 0:
            continue
        quote = prices[inst_id].at(d) if inst_id in prices else None
        total += finance.market_value(res.units, quote[0]) if quote else res.invested
    return total


def portfolio_history(session: Session, today: date | None = None) -> list[dict]:
    """Portfolio market value vs cost basis over time, for the Investments chart.

    Weekly points while the history is under ~13 months, month-ends after that,
    always ending today. Cost basis is what is still held (same as 'invested' in
    the portfolio totals), so the gap between the two lines is the unrealised gain.
    """
    today = today or date.today()
    inputs = _inv_inputs(session)
    firsts = [min(t.date for t in txns) for txns in inputs.values() if txns]
    if not firsts:
        return []
    first = min(firsts)
    prices = _price_series(session)

    points: list[date] = []
    if (today - first).days <= 400:
        d = first
        while d < today:
            points.append(d)
            d += timedelta(days=7)
    else:
        m = finance.month_key(first)
        while finance.month_bounds(m)[1] < today:
            points.append(finance.month_bounds(m)[1])
            m = finance.shift_month(m, 1)
    points.append(today)

    out = []
    for d in points:
        invested = 0
        for txns in inputs.values():
            upto = [t for t in txns if t.date <= d]
            if upto:
                invested += finance.compute_holding(upto).invested
        out.append({"date": d.isoformat(), "value": portfolio_value_at(d, inputs, prices), "invested": invested})
    return out


# --------------------------------------------------------------- months


def daily_spend(session: Session, month: str, today: date | None = None) -> list[dict]:
    """Cumulative spend by day-of-month for `month` and the month before it.

    `current` is None for days that haven't happened yet, so the line stops at today.
    Transfers are not spending and are excluded, like everywhere else.
    """
    today = today or date.today()

    def cumulative(m: str) -> dict[int, int]:
        ms, me = finance.month_bounds(m)
        rows = session.execute(
            select(Transaction.date, func.sum(Transaction.amount))
            .where(Transaction.kind == "expense", Transaction.date >= ms, Transaction.date <= me)
            .group_by(Transaction.date)
        ).all()
        per_day = {d.day: total for d, total in rows}
        out, running = {}, 0
        for day in range(1, me.day + 1):
            running += per_day.get(day, 0)
            out[day] = running
        return out

    cur, prev = cumulative(month), cumulative(finance.shift_month(month, -1))
    last_real = today.day if finance.month_key(today) == month else (len(cur) if month < finance.month_key(today) else 0)
    return [
        {
            "day": day,
            "current": cur.get(day) if day <= last_real and day in cur else None,
            "previous": prev.get(day),
        }
        for day in range(1, max(len(cur), len(prev)) + 1)
    ]


def _month_sums(session: Session, start: date, end: date) -> tuple[int, int]:
    q = (
        select(Transaction.kind, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date <= end, Transaction.kind != "transfer")
        .group_by(Transaction.kind)
    )
    sums = dict(session.execute(q).all())
    return sums.get("income", 0) or 0, sums.get("expense", 0) or 0


def spend_by_top_category(session: Session, start: date, end: date) -> dict[int | None, int]:
    rollup = category_rollup_map(session)
    out: dict[int | None, int] = defaultdict(int)
    q = (
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(Transaction.kind == "expense", Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.category_id)
    )
    for cid, total in session.execute(q):
        top = rollup.get(cid) if cid is not None else None
        out[top.id if top else None] += total
    return out


def budget_month(session: Session, month: str, today: date | None = None) -> BudgetMonth:
    today = today or date.today()
    start, end = finance.month_bounds(month)
    spent_by_top = spend_by_top_category(session, start, end)

    budgets = {
        b.category_id: b.amount
        for b in session.scalars(select(Budget).where(Budget.month == month))
    }
    rollup = category_rollup_map(session)
    # A budget on a sub-category tracks only that sub-category.
    sub_spent: dict[int, int] = {}
    for cid in budgets:
        cat = session.get(Category, cid)
        if cat and cat.parent_id is not None:
            ids = descendant_ids(session, cid)
            sub_spent[cid] = session.scalar(
                select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                    Transaction.kind == "expense",
                    Transaction.category_id.in_(ids),
                    Transaction.date >= start,
                    Transaction.date <= end,
                )
            )

    rows: list[BudgetRow] = []
    cats = session.scalars(
        select(Category).where(Category.kind == "expense").order_by(Category.name)
    ).all()
    for c in cats:
        is_top = c.parent_id is None
        if not is_top and c.id not in budgets:
            continue
        if c.archived and c.id not in budgets and not spent_by_top.get(c.id):
            continue
        spent = spent_by_top.get(c.id, 0) if is_top else sub_spent.get(c.id, 0)
        rows.append(
            BudgetRow(
                category_id=c.id,
                name=c.name if is_top else f"{rollup[c.id].name} · {c.name}",
                color=c.color,
                budget=budgets.get(c.id),
                spent=spent,
            )
        )
    rows.sort(key=lambda r: (r.budget is None, -(r.spent or 0)))

    total_spent = sum(spent_by_top.values())
    projected = None
    if start <= today <= end:
        elapsed = (today - start).days + 1
        projected = round(total_spent * ((end - start).days + 1) / elapsed)

    return BudgetMonth(
        month=month,
        rows=rows,
        total_budget=sum(budgets.values()),
        total_spent_budgeted=sum(r.spent for r in rows if r.budget is not None),
        total_spent=total_spent,
        projected_spent=projected,
    )


# -------------------------------------------------------------- upcoming


def upcoming(session: Session, today: date | None = None, days: int = 30) -> list[UpcomingItem]:
    """Occurrences of active recurring rules from overdue up to today+days."""
    today = today or date.today()
    horizon = today + timedelta(days=days)
    items: list[UpcomingItem] = []
    for r in session.scalars(select(RecurringRule).where(RecurringRule.active.is_(True))):
        d = r.next_date
        anchor = r.next_date.day
        guard = 0
        while d <= horizon and guard < 60:
            items.append(
                UpcomingItem(
                    rule_id=r.id, name=r.name, kind=r.kind, amount=r.amount, date=d, overdue=d < today
                )
            )
            # Only the next due date is "overdue"; list future ones normally.
            d = finance.next_occurrence(d, r.frequency, anchor)
            guard += 1
            if items[-1].overdue:
                break
    items.sort(key=lambda i: i.date)
    return items


# ------------------------------------------------------------- dashboard


def dashboard(session: Session, month: str, today: date | None = None) -> dict:
    today = today or date.today()
    start, end = finance.month_bounds(month)
    period_end = min(end, today) if start <= today else end

    income, spent = _month_sums(session, start, end)
    prev_start, prev_end = finance.month_bounds(finance.shift_month(month, -1))
    _, prev_spent = _month_sums(session, prev_start, prev_end)

    # Income split by category (top 2 for the KPI caption)
    rollup = category_rollup_map(session)
    inc_q = (
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(Transaction.kind == "income", Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.category_id)
    )
    income_by: dict[str, int] = defaultdict(int)
    for cid, total in session.execute(inc_q):
        top = rollup.get(cid) if cid is not None else None
        income_by[top.name if top else "Uncategorised"] += total
    income_split = sorted(
        ({"name": k, "amount": v} for k, v in income_by.items()), key=lambda x: -x["amount"]
    )

    invested = session.scalar(
        select(func.coalesce(func.sum(InvestmentTxn.amount), 0)).where(
            InvestmentTxn.type == "buy", InvestmentTxn.date >= start, InvestmentTxn.date <= end
        )
    )

    # Net worth trend: month-end values for 12 months ending at this month.
    prices = _price_series(session)
    inputs = _inv_inputs(session)

    def net_worth_at(d: date) -> int:
        return sum(account_balances(session, d).values()) + portfolio_value_at(d, inputs, prices)

    first_dates = [
        d
        for d in (
            session.scalar(select(func.min(Transaction.date))),
            session.scalar(select(func.min(InvestmentTxn.date))),
        )
        if d is not None
    ]
    first_month = finance.month_key(min(first_dates)) if first_dates else month

    trend = []
    for i in range(11, -1, -1):
        m = finance.shift_month(month, -i)
        m_start, m_end = finance.month_bounds(m)
        # Skip months before any data exists, and months in the future.
        if m_start > today or m < first_month:
            continue
        point = min(m_end, today)
        trend.append({"month": m, "date": point.isoformat(), "value": net_worth_at(point)})
    nw_now = net_worth_at(period_end)
    nw_3m_ago = net_worth_at(finance.month_bounds(finance.shift_month(month, -3))[1])

    cash_flow = []
    for i in range(5, -1, -1):
        m = finance.shift_month(month, -i)
        ms, me = finance.month_bounds(m)
        inc, sp = _month_sums(session, ms, me)
        cash_flow.append({"month": m, "income": inc, "spent": sp, "partial": ms <= today <= me})

    cats = {c.id: c for c in session.scalars(select(Category))}
    spend_cat = [
        {
            "category_id": cid,
            "name": cats[cid].name if cid in cats else "Uncategorised",
            "color": cats[cid].color if cid in cats else "#52525b",
            "amount": amt,
        }
        for cid, amt in spend_by_top_category(session, start, end).items()
    ]
    spend_cat.sort(key=lambda x: -x["amount"])

    top_q = (
        select(Transaction)
        .where(Transaction.date >= start, Transaction.date <= end, Transaction.kind != "transfer")
        .order_by(Transaction.amount.desc(), Transaction.date.desc())
        .limit(10)
    )
    top = [
        {
            "id": t.id,
            "date": t.date.isoformat(),
            "kind": t.kind,
            "amount": t.amount,
            "merchant": t.merchant,
            "note": t.note,
            "category": cats[t.category_id].name if t.category_id in cats else None,
        }
        for t in session.scalars(top_q)
    ]

    pf = portfolio(session, today)
    savings = income - spent

    return {
        "month": month,
        "as_of": period_end.isoformat(),
        "net_worth": {
            "value": nw_now,
            "change_3m": nw_now - nw_3m_ago,
            "change_3m_pct": _pct(nw_now - nw_3m_ago, abs(nw_3m_ago)),
        },
        "income": {"total": income, "split": income_split[:3]},
        "spent": {
            "total": spent,
            "previous": prev_spent,
            "change_pct": _pct(spent - prev_spent, prev_spent),
        },
        "savings": {"amount": savings, "rate": _pct(savings, income)},
        "invested": invested,
        "net_worth_trend": trend,
        "cash_flow": cash_flow,
        "daily_spend": daily_spend(session, month, today),
        "spend_by_category": spend_cat,
        "top_transactions": top,
        "budgets": budget_month(session, month, today).model_dump(),
        "upcoming": [u.model_dump(mode="json") for u in upcoming(session, today)[:6]],
        "portfolio": {
            "totals": pf.totals.model_dump(),
            "by_kind": {k: v.model_dump() for k, v in pf.by_kind.items()},
        },
    }
