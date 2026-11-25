"""Accounts, categories, transactions, budgets, recurring rules, dashboard."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import finance, services
from ..db import get_session
from ..models import Account, Budget, Category, Friend, RecurringRule, Transaction, TransactionSplit
from ..schemas import (
    AccountIn,
    AccountOut,
    BudgetIn,
    BudgetMonth,
    CategoryIn,
    CategoryOut,
    FriendIn,
    FriendOut,
    RecurringIn,
    RecurringOut,
    TransactionIn,
    TransactionOut,
    TransactionPage,
    UpcomingItem,
)

router = APIRouter()
DB = Depends(get_session)

TXN_FIELDS = ["date", "kind", "amount", "account_id", "to_account_id", "friend_id", "category_id", "merchant", "note"]


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


# ------------------------------------------------------------------- friends


def _friend_out(session: Session, friend: Friend) -> FriendOut:
    return FriendOut.model_validate(friend).model_copy(
        update={
            "balance": services.friend_balances(session).get(friend.id, 0),
            "last_activity": services.friend_last_activity(session).get(friend.id),
        }
    )


def _check_friend_name(session: Session, name: str, self_id: int | None = None) -> None:
    clash = session.scalar(
        select(Friend).where(func.lower(Friend.name) == name.lower(), Friend.id != (self_id or 0))
    )
    if clash:
        raise HTTPException(409, f"You already have a friend called {clash.name}")


@router.get("/friends", response_model=list[FriendOut])
def list_friends(session: Session = DB):
    balances = services.friend_balances(session)
    last = services.friend_last_activity(session)
    friends = session.scalars(select(Friend).order_by(Friend.archived, func.lower(Friend.name))).all()
    return [
        FriendOut.model_validate(f).model_copy(update={"balance": balances.get(f.id, 0), "last_activity": last.get(f.id)})
        for f in friends
    ]


@router.post("/friends", response_model=FriendOut, status_code=201)
def create_friend(body: FriendIn, session: Session = DB):
    _check_friend_name(session, body.name)
    friend = Friend(**body.model_dump())
    session.add(friend)
    session.flush()
    services.audit(session, "friend", friend.id, "create", body.model_dump(mode="json"))
    session.commit()
    return _friend_out(session, friend)


@router.put("/friends/{friend_id}", response_model=FriendOut)
def update_friend(friend_id: int, body: FriendIn, session: Session = DB):
    friend = _get(session, Friend, friend_id, "friend")
    _check_friend_name(session, body.name, self_id=friend_id)
    if body.archived and not friend.archived:
        balance = services.friend_balances(session).get(friend_id, 0) - friend.opening_balance + body.opening_balance
        if balance != 0:
            who = f"{friend.name} owes you" if balance > 0 else f"You owe {friend.name}"
            raise HTTPException(409, f"{who} {_rupees(abs(balance))}. Settle up or write it off before archiving.")
    before = services.snapshot(friend, list(FriendIn.model_fields))
    for k, v in body.model_dump().items():
        setattr(friend, k, v)
    services.audit(session, "friend", friend.id, "update", {"before": before, "after": body.model_dump(mode="json")})
    session.commit()
    return _friend_out(session, friend)


@router.delete("/friends/{friend_id}", status_code=204)
def delete_friend(friend_id: int, session: Session = DB):
    friend = _get(session, Friend, friend_id, "friend")
    used = session.scalar(select(func.count()).select_from(Transaction).where(Transaction.friend_id == friend_id))
    used = used or session.scalar(
        select(func.count()).select_from(TransactionSplit).where(TransactionSplit.friend_id == friend_id)
    )
    if used:
        raise HTTPException(409, f"{friend.name} has transactions. Archive them instead, so history is kept.")
    services.audit(session, "friend", friend.id, "delete", services.snapshot(friend, ["name", "opening_balance"]))
    session.delete(friend)
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


def _rupees(paise: int) -> str:
    return f"₹{paise / 100:,.2f}"


def _validate_txn(session: Session, body: TransactionIn, existing: Transaction | None = None) -> None:
    # Archived accounts/friends can't be newly used, but an edit may keep the ones it already had.
    had_accounts = {existing.account_id, existing.to_account_id} - {None} if existing else set()
    had_friends = ({existing.friend_id} | {s.friend_id for s in existing.splits}) - {None} if existing else set()

    def check_account(acct_id: int | None, label: str) -> None:
        if acct_id is None:
            return
        acct = _get(session, Account, acct_id, label)
        if acct.archived and acct_id not in had_accounts:
            raise HTTPException(422, f"Account '{acct.name}' is archived")

    def check_friend(friend_id: int) -> None:
        friend = _get(session, Friend, friend_id, "friend")
        if friend.archived and friend_id not in had_friends:
            raise HTTPException(422, f"{friend.name} is archived. Restore them on the Friends page first.")

    check_account(body.account_id, "account")
    check_account(body.to_account_id, "destination account")
    if body.friend_id is not None:
        check_friend(body.friend_id)

    if body.kind == "transfer":
        if body.category_id is not None:
            raise HTTPException(422, "Transfers do not have a category")
        if body.splits:
            raise HTTPException(422, "Transfers cannot be split")
        if body.friend_id is None:
            if body.account_id is None:
                raise HTTPException(422, "Transfer needs a source account")
            if body.to_account_id is None:
                raise HTTPException(422, "Transfer needs a destination account")
            if body.to_account_id == body.account_id:
                raise HTTPException(422, "Transfer needs two different accounts")
        elif (body.account_id is None) == (body.to_account_id is None):
            raise HTTPException(
                422, "Settling up moves money between a friend and one of your accounts: pick exactly one account"
            )
        return

    if body.to_account_id is not None:
        raise HTTPException(422, "Only transfers have a destination account")
    if body.category_id is not None:
        cat = _get(session, Category, body.category_id, "category")
        if cat.kind != body.kind:
            raise HTTPException(422, f"Category '{cat.name}' is for {cat.kind}, not {body.kind}")

    if body.friend_id is None:
        if body.account_id is None:
            raise HTTPException(422, "Pick the account the money came from or went to")
    else:
        if body.account_id is not None:
            raise HTTPException(422, "When a friend paid, no money moves in your accounts: leave the account empty")
        if body.splits:
            raise HTTPException(422, "A bill a friend paid cannot also be split. Record only your share.")

    if body.splits:
        if body.kind != "expense":
            raise HTTPException(422, "Only expenses can be split")
        ids = [s.friend_id for s in body.splits]
        if len(ids) != len(set(ids)):
            raise HTTPException(422, "Each friend can appear only once in a split")
        for fid in ids:
            check_friend(fid)
        shared = sum(s.amount for s in body.splits)
        if shared > body.amount:
            raise HTTPException(
                422, f"Friends' shares ({_rupees(shared)}) add up to more than the total ({_rupees(body.amount)})"
            )


def _txn_snapshot(txn: Transaction) -> dict:
    snap = services.snapshot(txn, TXN_FIELDS)
    snap["splits"] = sorted((s.friend_id, s.amount) for s in txn.splits)
    return snap


def _save_splits(session: Session, txn: Transaction, splits) -> None:
    """Replace the transaction's splits (delete first: (txn, friend) is unique)."""
    session.execute(delete(TransactionSplit).where(TransactionSplit.transaction_id == txn.id))
    session.flush()
    for s in splits:
        session.add(TransactionSplit(transaction_id=txn.id, friend_id=s.friend_id, amount=s.amount))
    session.flush()
    session.expire(txn)


def _out(session: Session, txn: Transaction) -> TransactionOut:
    session.refresh(txn)
    return TransactionOut.model_validate(txn)


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    session: Session = DB,
    month: str | None = None,
    start: date | None = None,
    end: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    kind: str | None = None,
    friend_id: int | None = None,
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
    if friend_id:
        conds.append(
            or_(
                Transaction.friend_id == friend_id,
                Transaction.id.in_(select(TransactionSplit.transaction_id).where(TransactionSplit.friend_id == friend_id)),
            )
        )
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
            # Your own share: a ₹1,200 dinner split three ways is ₹400 of spending.
            select(Transaction.kind, func.sum(Transaction.own_amount)).where(*conds).group_by(Transaction.kind)
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
    txn = Transaction(**body.model_dump(exclude={"splits"}))
    session.add(txn)
    session.flush()
    _save_splits(session, txn, body.splits)
    services.audit(session, "transaction", txn.id, "create", body.model_dump(mode="json"))
    session.commit()
    return _out(session, txn)


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(txn_id: int, body: TransactionIn, session: Session = DB):
    txn = _get(session, Transaction, txn_id, "transaction")
    _validate_txn(session, body, existing=txn)
    before = _txn_snapshot(txn)
    for k, v in body.model_dump(exclude={"splits"}).items():
        setattr(txn, k, v)
    session.flush()
    _save_splits(session, txn, body.splits)
    after = _txn_snapshot(txn)
    changed = {k: {"from": before[k], "to": after[k]} for k in before if before[k] != after[k]}
    if changed:
        services.audit(session, "transaction", txn.id, "update", changed)
    session.commit()
    return _out(session, txn)


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, session: Session = DB):
    txn = _get(session, Transaction, txn_id, "transaction")
    services.audit(session, "transaction", txn.id, "delete", _txn_snapshot(txn))
    session.execute(delete(TransactionSplit).where(TransactionSplit.transaction_id == txn.id))
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
