"""Database models.

Money convention: every monetary amount is an integer number of paise
(1 rupee = 100 paise). Never store money as a float (NFR-04).
Fund units and prices are exact decimals (DecimalText).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from .db import Base, DecimalText


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AccountType(StrEnum):
    bank = "bank"
    credit_card = "credit_card"
    cash = "cash"
    wallet = "wallet"
    investment = "investment"
    loan = "loan"
    other = "other"


class CategoryKind(StrEnum):
    expense = "expense"
    income = "income"


class TxnKind(StrEnum):
    expense = "expense"
    income = "income"
    transfer = "transfer"


class InstrumentKind(StrEnum):
    mutual_fund = "mutual_fund"
    stock = "stock"


class InvTxnType(StrEnum):
    buy = "buy"
    sell = "sell"
    dividend = "dividend"
    # Shares received from an employer (RSU/ESPP vest). Adds units at market
    # value like a buy, but no money leaves any account.
    vest = "vest"


class Frequency(StrEnum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    opening_balance: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    color: Mapped[str] = mapped_column(String(9), default="#71717a")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Friend(Base):
    """Someone you split bills with. Their balance is derived, never typed in
    (apart from the opening balance, for what was owed before you started)."""

    __tablename__ = "friends"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    # Positive: they owed you this when you started. Negative: you owed them.
    opening_balance: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Transaction(Base):
    """One money event.

    With a friend involved (friend_id set), one side is the friend instead of
    an account:
      expense, no account   -> the friend paid your share (you owe them), or a write-off
      income,  no account   -> the friend let go of what you owed them
      transfer, from account -> you paid the friend (settle up / lend)
      transfer, to account   -> the friend paid you back
    Splits (TransactionSplit) are friends' shares of an expense you paid.
    """

    __tablename__ = "transactions"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(10))
    # Full amount that moved. For a split expense your own share is own_amount.
    amount: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    friend_id: Mapped[int | None] = mapped_column(ForeignKey("friends.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    splits: Mapped[list[TransactionSplit]] = relationship(
        viewonly=True, lazy="selectin", order_by="TransactionSplit.id"
    )


class TransactionSplit(Base):
    """A friend's share of an expense you paid: they owe you this much."""

    __tablename__ = "transaction_splits"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_splits_amount_positive"),
        UniqueConstraint("transaction_id", "friend_id", name="uq_transaction_splits_txn_friend"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    friend_id: Mapped[int] = mapped_column(ForeignKey("friends.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)


# Your own part of a transaction: the amount minus friends' shares. Every
# spending/income report uses this; account balances use the full amount.
Transaction.own_amount = column_property(
    Transaction.amount
    - select(func.coalesce(func.sum(TransactionSplit.amount), 0))
    .where(TransactionSplit.transaction_id == Transaction.id)
    .correlate_except(TransactionSplit)
    .scalar_subquery()
)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("category_id", "month", name="uq_budgets_category_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    month: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    amount: Mapped[int] = mapped_column(Integer)


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10))  # expense | income
    amount: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    frequency: Mapped[str] = mapped_column(String(10))
    next_date: Mapped[date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    # Stock ticker (e.g. INFY) or AMFI scheme code for mutual funds.
    symbol: Mapped[str] = mapped_column(String(40))
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Fund category (e.g. "Index") or stock sector.
    sub_category: Mapped[str | None] = mapped_column(String(60), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class InvestmentTxn(Base):
    __tablename__ = "investment_txns"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_investment_txns_amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    # Bank/cash account the money came from or went to. Optional; when set,
    # buys reduce that account's balance and sells/dividends increase it.
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(10))
    units: Mapped[Decimal | None] = mapped_column(DecimalText, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(DecimalText, nullable=True)
    # buy: total paid incl. charges; vest: market value on vest date;
    # sell: net proceeds; dividend: received.
    amount: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"
    __table_args__ = (UniqueConstraint("instrument_id", "date", name="uq_price_instrument_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    price: Mapped[Decimal] = mapped_column(DecimalText)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(10))  # create | update | delete
    changes: Mapped[str] = mapped_column(Text)  # JSON
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
