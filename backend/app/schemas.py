"""API request/response models.

All `amount`, `balance`, `value`, `invested` etc. fields are integer paise.
Units and prices are decimal strings (e.g. "123.4567") to stay exact in JSON.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, StringConstraints

from .models import AccountType, CategoryKind, Frequency, InstrumentKind, InvTxnType, TxnKind

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
OptText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)]
Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Paise = Annotated[int, Field(gt=0, lt=10**15)]
DecStr = Annotated[Decimal, PlainSerializer(lambda v: str(v), return_type=str)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- accounts


class AccountIn(BaseModel):
    name: Name
    type: AccountType
    opening_balance: int = Field(default=0, gt=-(10**15), lt=10**15)
    archived: bool = False


class AccountOut(ORM):
    id: int
    name: str
    type: str
    currency: str
    opening_balance: int
    archived: bool
    balance: int = 0


# -------------------------------------------------------------- categories


class CategoryIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    kind: CategoryKind
    parent_id: int | None = None
    color: Color = "#71717a"
    archived: bool = False


class CategoryOut(ORM):
    id: int
    name: str
    kind: str
    parent_id: int | None
    color: str
    archived: bool


# ------------------------------------------------------------ transactions


class SplitIn(BaseModel):
    friend_id: int
    amount: Paise


class SplitOut(ORM):
    friend_id: int
    amount: int


class TransactionIn(BaseModel):
    date: date
    kind: TxnKind
    amount: Paise
    # Null only when a friend is the other side (see models.Transaction).
    account_id: int | None = None
    to_account_id: int | None = None
    friend_id: int | None = None
    category_id: int | None = None
    merchant: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    note: OptText = None
    # Friends' shares of an expense you paid. Saving replaces the whole list.
    splits: list[SplitIn] = Field(default_factory=list, max_length=50)


class TransactionOut(ORM):
    id: int
    date: date
    kind: str
    amount: int
    own_amount: int
    account_id: int | None
    to_account_id: int | None
    friend_id: int | None
    category_id: int | None
    merchant: str | None
    note: str | None
    source: str
    splits: list[SplitOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    sum_income: int
    sum_expense: int


# ----------------------------------------------------------------- friends


class FriendIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    opening_balance: int = Field(default=0, gt=-(10**15), lt=10**15)
    archived: bool = False


class FriendOut(ORM):
    id: int
    name: str
    opening_balance: int
    archived: bool
    # Positive: they owe you. Negative: you owe them.
    balance: int = 0
    last_activity: date | None = None


# ----------------------------------------------------------------- budgets


class BudgetIn(BaseModel):
    category_id: int
    month: Month
    amount: int = Field(ge=0, lt=10**15)  # 0 removes the budget


class BudgetRow(BaseModel):
    category_id: int
    name: str
    color: str
    budget: int | None
    spent: int


class BudgetMonth(BaseModel):
    month: str
    rows: list[BudgetRow]
    total_budget: int
    total_spent_budgeted: int
    total_spent: int
    projected_spent: int | None


# --------------------------------------------------------------- recurring


class RecurringIn(BaseModel):
    name: Name
    kind: Annotated[TxnKind, Field()]
    amount: Paise
    account_id: int
    category_id: int | None = None
    frequency: Frequency
    next_date: date
    active: bool = True


class RecurringOut(ORM):
    id: int
    name: str
    kind: str
    amount: int
    account_id: int
    category_id: int | None
    frequency: str
    next_date: date
    active: bool


class UpcomingItem(BaseModel):
    rule_id: int
    name: str
    kind: str
    amount: int
    date: date
    overdue: bool


# ------------------------------------------------------------- investments


class InstrumentIn(BaseModel):
    kind: InstrumentKind
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    symbol: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    isin: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=12)] = None
    exchange: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=10)] = None
    sub_category: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=60)] = (
        None
    )
    archived: bool = False


class InstrumentOut(ORM):
    id: int
    kind: str
    name: str
    symbol: str
    isin: str | None
    exchange: str | None
    sub_category: str | None
    archived: bool


class InvTxnIn(BaseModel):
    instrument_id: int
    account_id: int | None = None
    date: date
    type: InvTxnType
    units: Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=6)] | None = None
    price: Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=6)] | None = None
    usd_price: Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=6)] | None = None
    fx_rate: Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=6)] | None = None
    amount: Paise
    note: OptText = None


class InvTxnOut(ORM):
    id: int
    instrument_id: int
    account_id: int | None
    date: date
    type: str
    units: DecStr | None
    price: DecStr | None
    usd_price: DecStr | None
    fx_rate: DecStr | None
    amount: int
    note: str | None


class PriceIn(BaseModel):
    instrument_id: int
    date: date
    price: Annotated[Decimal, Field(gt=0, max_digits=20, decimal_places=6)]


class HoldingOut(BaseModel):
    instrument: InstrumentOut
    units: DecStr
    invested: int
    value: int | None  # None when no price is known
    price: DecStr | None
    price_date: date | None
    price_source: str | None
    unrealized: int | None
    unrealized_pct: float | None
    realized: int
    dividends: int
    day_change: int | None
    xirr: float | None


class PortfolioTotals(BaseModel):
    invested: int
    value: int  # uses cost for holdings with no price yet
    unrealized: int
    unrealized_pct: float | None
    realized: int
    dividends: int
    day_change: int
    xirr: float | None
    missing_prices: int


class PortfolioOut(BaseModel):
    holdings: list[HoldingOut]
    totals: PortfolioTotals
    by_kind: dict[str, PortfolioTotals]


class AmfiScheme(BaseModel):
    code: str
    isin: str | None
    name: str
    nav: DecStr | None
    nav_date: date | None


class FxRate(BaseModel):
    """USD→INR on `date`. `rate_date` is earlier when SBI published nothing that day (weekend, holiday)."""

    date: date
    rate_date: date
    rate: DecStr
    source: str


class RefreshResult(BaseModel):
    updated: int
    not_found: list[str]
    nav_date: date | None
