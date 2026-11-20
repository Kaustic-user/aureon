"""Accounts, categories, transactions, budgets, recurring rules, dashboard."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import finance, services
from ..db import get_session
from ..models import Account, Budget, Category, RecurringRule, Transaction
from ..schemas import (
    AccountIn,
    AccountOut,
    BudgetIn,
    BudgetMonth,
    CategoryIn,
    CategoryOut,
    RecurringIn,
    RecurringOut,
    TransactionIn,
    TransactionOut,
    TransactionPage,
    UpcomingItem,
)

router = APIRouter()
DB = Depends(get_session)

TXN_FIELDS = ["date", "kind", "amount", "account_id", "to_account_id", "category_id", "merchant", "note"]


def _get(session: Session, model, obj_id: int, label: str):
    obj = session.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{label} {obj_id} not found")
    return obj


def _current_month() -> str:
    return finance.month_key(date.today())


def _check_month(month: str) -> str:
    try:
        finance.parse_month(month)
    except ValueError:
        raise HTTPException(422, "month must be YYYY-MM")
    return month


# ------------------------------------------------------------------ accounts


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(session: Session = DB):
    balances = services.account_balances(session)
    accounts = session.scalars(select(Account).order_by(Account.archived, Account.name)).all()
    return [AccountOut.model_validate(a).model_copy(update={"balance": balances.get(a.id, 0)}) for a in accounts]


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(body: AccountIn, session: Session = DB):
    acct = Account(**body.model_dump())
    session.add(acct)
    session.flush()
    services.audit(session, "account", acct.id, "create", body.model_dump(mode="json"))
    session.commit()
    return AccountOut.model_validate(acct).model_copy(update={"balance": acct.opening_balance})


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, body: AccountIn, session: Session = DB):
    acct = _get(session, Account, account_id, "account")
    before = services.snapshot(acct, list(body.model_fields))
    for k, v in body.model_dump().items():
        setattr(acct, k, v)
    services.audit(session, "account", acct.id, "update", {"before": before, "after": body.model_dump(mode="json")})
    session.commit()
    return AccountOut.model_validate(acct).model_copy(
        update={"balance": services.account_balances(session).get(acct.id, 0)}
    )


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, session: Session = DB):
    acct = _get(session, Account, account_id, "account")
    used = session.scalar(
        select(func.count()).select_from(Transaction).where(
            or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id)
        )
    )
    if used:
        raise HTTPException(409, "Account has transactions. Archive it instead, so history is kept.")
    services.audit(session, "account", acct.id, "delete", services.snapshot(acct, ["name", "type", "opening_balance"]))
    session.delete(acct)
    session.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- categories


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(session: Session = DB):
    return session.scalars(select(Category).order_by(Category.kind, Category.name)).all()


def _validate_category(session: Session, body: CategoryIn, self_id: int | None = None) -> None:
    if body.parent_id is not None:
        parent = _get(session, Category, body.parent_id, "parent category")
        if parent.kind != body.kind:
            raise HTTPException(422, "Sub-category must have the same kind as its parent")
        if parent.parent_id is not None:
            raise HTTPException(422, "Only two levels of categories are supported")
        if self_id is not None and parent.id == self_id:
            raise HTTPException(422, "A category cannot be its own parent")


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, session: Session = DB):
    _validate_category(session, body)
    cat = Category(**body.model_dump())
    session.add(cat)
    session.commit()
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryIn, session: Session = DB):
    cat = _get(session, Category, category_id, "category")
    _validate_category(session, body, self_id=category_id)
    if body.kind != cat.kind:
        used = session.scalar(select(func.count()).select_from(Transaction).where(Transaction.category_id == category_id))
        if used:
            raise HTTPException(409, "Category is used by transactions; its kind cannot change")
    for k, v in body.model_dump().items():
        setattr(cat, k, v)
    session.commit()
    return cat


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, session: Session = DB):
    cat = _get(session, Category, category_id, "category")
    used = session.scalar(select(func.count()).select_from(Transaction).where(Transaction.category_id == category_id))
    children = session.scalar(select(func.count()).select_from(Category).where(Category.parent_id == category_id))
    if used or children:
        raise HTTPException(409, "Category is in use. Archive it instead.")
    session.query(Budget).filter(Budget.category_id == category_id).delete()
    session.delete(cat)
    session.commit()
    return Response(status_code=204)


# -------------------------------------------------------------- transactions


def _validate_txn(session: Session, body: TransactionIn, existing: Transaction | None = None) -> None:
    acct = _get(session, Account, body.account_id, "account")
    if acct.archived and (existing is None or existing.account_id != acct.id):
        raise HTTPException(422, "Account is archived")
    if body.kind == "transfer":
        if body.to_account_id is None:
            raise HTTPException(422, "Transfer needs a destination account")
        if body.to_account_id == body.account_id:
            raise HTTPException(422, "Transfer needs two different accounts")
        _get(session, Account, body.to_account_id, "destination account")
        if body.category_id is not None:
            raise HTTPException(422, "Transfers do not have a category")
    else:
        if body.to_account_id is not None:
            raise HTTPException(422, "Only transfers have a destination account")
        if body.category_id is not None:
            cat = _get(session, Category, body.category_id, "category")
            if cat.kind != body.kind:
                raise HTTPException(422, f"Category '{cat.name}' is for {cat.kind}, not {body.kind}")


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    session: Session = DB,
    month: str | None = None,
    start: date | None = None,
    end: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    kind: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    min_amount: int | None = None,
    max_amount: int | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    conds = []
    if month:
        ms, me = finance.month_bounds(_check_month(month))
        conds += [Transaction.date >= ms, Transaction.date <= me]
    if start:
        conds.append(Transaction.date >= start)
    if end:
        conds.append(Transaction.date <= end)
    if account_id:
        conds.append(or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id))
    if category_id:
        conds.append(Transaction.category_id.in_(services.descendant_ids(session, category_id)))
    if kind:
        conds.append(Transaction.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Transaction.merchant.ilike(like), Transaction.note.ilike(like)))
    if min_amount is not None:
        conds.append(Transaction.amount >= min_amount)
    if max_amount is not None:
        conds.append(Transaction.amount <= max_amount)

    total = session.scalar(select(func.count()).select_from(Transaction).where(*conds))
    sums = dict(
        session.execute(
            select(Transaction.kind, func.sum(Transaction.amount)).where(*conds).group_by(Transaction.kind)
        ).all()
    )
    items = session.scalars(
        select(Transaction)
        .where(*conds)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return TransactionPage(
        items=items, total=total, sum_income=sums.get("income", 0) or 0, sum_expense=sums.get("expense", 0) or 0
    )


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionIn, session: Session = DB):
    _validate_txn(session, body)
    txn = Transaction(**body.model_dump())
    session.add(txn)
    session.flush()
    services.audit(session, "transaction", txn.id, "create", body.model_dump(mode="json"))
    session.commit()
    return txn


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(txn_id: int, body: TransactionIn, session: Session = DB):
    txn = _get(session, Transaction, txn_id, "transaction")
    _validate_txn(session, body, existing=txn)
    before = services.snapshot(txn, TXN_FIELDS)
    for k, v in body.model_dump().items():
        setattr(txn, k, v)
    after = services.snapshot(txn, TXN_FIELDS)
    changed = {k: {"from": before[k], "to": after[k]} for k in TXN_FIELDS if before[k] != after[k]}
    if changed:
        services.audit(session, "transaction", txn.id, "update", changed)
    session.commit()
    return txn


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, session: Session = DB):
    txn = _get(session, Transaction, txn_id, "transaction")
    services.audit(session, "transaction", txn.id, "delete", services.snapshot(txn, TXN_FIELDS))
    session.delete(txn)
    session.commit()
    return Response(status_code=204)


# -------------------------------------------------------------------- budgets


@router.get("/budgets", response_model=BudgetMonth)
def get_budgets(month: str | None = None, session: Session = DB):
    return services.budget_month(session, _check_month(month or _current_month()))


@router.put("/budgets", response_model=BudgetMonth)
def set_budget(body: BudgetIn, session: Session = DB):
    cat = _get(session, Category, body.category_id, "category")
    if cat.kind != "expense":
        raise HTTPException(422, "Budgets are only for expense categories")
    existing = session.scalar(
        select(Budget).where(Budget.category_id == body.category_id, Budget.month == body.month)
    )
    if body.amount == 0:
        if existing:
            session.delete(existing)
    elif existing:
        existing.amount = body.amount
    else:
        session.add(Budget(category_id=body.category_id, month=body.month, amount=body.amount))
    session.commit()
    return services.budget_month(session, body.month)


@router.post("/budgets/copy", response_model=BudgetMonth)
def copy_budgets(from_month: str, to_month: str, session: Session = DB):
    """Copy budgets into a month. Categories that already have a budget keep theirs."""
    _check_month(from_month)
    _check_month(to_month)
    have = set(session.scalars(select(Budget.category_id).where(Budget.month == to_month)))
    for b in session.scalars(select(Budget).where(Budget.month == from_month)).all():
        if b.category_id not in have:
            session.add(Budget(category_id=b.category_id, month=to_month, amount=b.amount))
    session.commit()
    return services.budget_month(session, to_month)


# ------------------------------------------------------------------ recurring


def _validate_rule(session: Session, body: RecurringIn) -> None:
    if body.kind == "transfer":
        raise HTTPException(422, "Recurring transfers are not supported yet")
    _get(session, Account, body.account_id, "account")
    if body.category_id is not None:
        cat = _get(session, Category, body.category_id, "category")
        if cat.kind != body.kind:
            raise HTTPException(422, f"Category '{cat.name}' is for {cat.kind}")


@router.get("/recurring", response_model=list[RecurringOut])
def list_recurring(session: Session = DB):
    return session.scalars(select(RecurringRule).order_by(RecurringRule.next_date)).all()


@router.post("/recurring", response_model=RecurringOut, status_code=201)
def create_recurring(body: RecurringIn, session: Session = DB):
    _validate_rule(session, body)
    rule = RecurringRule(**body.model_dump())
    session.add(rule)
    session.commit()
    return rule


@router.put("/recurring/{rule_id}", response_model=RecurringOut)
def update_recurring(rule_id: int, body: RecurringIn, session: Session = DB):
    rule = _get(session, RecurringRule, rule_id, "recurring rule")
    _validate_rule(session, body)
    for k, v in body.model_dump().items():
        setattr(rule, k, v)
    session.commit()
    return rule


@router.delete("/recurring/{rule_id}", status_code=204)
def delete_recurring(rule_id: int, session: Session = DB):
    session.delete(_get(session, RecurringRule, rule_id, "recurring rule"))
    session.commit()
    return Response(status_code=204)


@router.post("/recurring/{rule_id}/post", response_model=TransactionOut, status_code=201)
def post_recurring(rule_id: int, session: Session = DB):
    """Confirm the next occurrence: record it as a transaction and advance the rule."""
    rule = _get(session, RecurringRule, rule_id, "recurring rule")
    txn = Transaction(
        date=rule.next_date,
        kind=rule.kind,
        amount=rule.amount,
        account_id=rule.account_id,
        category_id=rule.category_id,
        merchant=rule.name,
        source="recurring",
    )
    session.add(txn)
    session.flush()
    services.audit(session, "transaction", txn.id, "create", {"from_recurring": rule.id})
    rule.next_date = finance.next_occurrence(rule.next_date, rule.frequency, rule.next_date.day)
    session.commit()
    return txn


@router.post("/recurring/{rule_id}/skip", response_model=RecurringOut)
def skip_recurring(rule_id: int, session: Session = DB):
    rule = _get(session, RecurringRule, rule_id, "recurring rule")
    rule.next_date = finance.next_occurrence(rule.next_date, rule.frequency, rule.next_date.day)
    session.commit()
    return rule


@router.get("/upcoming", response_model=list[UpcomingItem])
def get_upcoming(days: int = Query(default=30, ge=1, le=366), session: Session = DB):
    return services.upcoming(session, days=days)


# ------------------------------------------------------------------ dashboard


@router.get("/dashboard")
def get_dashboard(month: str | None = None, session: Session = DB):
    return services.dashboard(session, _check_month(month or _current_month()))
