"""friends and split transactions

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-26

- friends: people you split bills with.
- transactions.friend_id: the friend on the other side (friend paid / settle up).
- transactions.account_id becomes nullable: a bill a friend paid moves no
  money in your accounts.
- transaction_splits: friends' shares of an expense you paid.

Existing rows are untouched: no friend, no splits, account still set.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "friends",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("opening_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint("id"),
    )

    # SQLite cannot ALTER a column, so batch mode rebuilds the table, copying
    # every row, index, foreign key and the amount > 0 check.
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.alter_column("account_id", existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column("friend_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_transactions_friend_id", "friends", ["friend_id"], ["id"])
        batch_op.create_index("ix_transactions_friend_id", ["friend_id"], unique=False)

    op.create_table(
        "transaction_splits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("friend_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_transaction_splits_amount_positive"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["friend_id"], ["friends.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_id", "friend_id", name="uq_transaction_splits_txn_friend"),
    )
    op.create_index("ix_transaction_splits_transaction_id", "transaction_splits", ["transaction_id"])
    op.create_index("ix_transaction_splits_friend_id", "transaction_splits", ["friend_id"])


def downgrade() -> None:
    op.drop_index("ix_transaction_splits_friend_id", table_name="transaction_splits")
    op.drop_index("ix_transaction_splits_transaction_id", table_name="transaction_splits")
    op.drop_table("transaction_splits")
    # Account-less rows (friend paid / settlements) cannot exist without friends.
    op.execute("DELETE FROM transactions WHERE account_id IS NULL")
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_index("ix_transactions_friend_id")
        batch_op.drop_constraint("fk_transactions_friend_id", type_="foreignkey")
        batch_op.drop_column("friend_id")
        batch_op.alter_column("account_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("friends")
