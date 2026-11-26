"""usd_price and fx_rate on investment transactions

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-27

Stores per-share USD price and USD→INR rate directly on investment_txns
instead of encoding them in the note text. Existing rows keep NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("investment_txns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("usd_price", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("fx_rate", sa.String(length=40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("investment_txns", schema=None) as batch_op:
        batch_op.drop_column("fx_rate")
        batch_op.drop_column("usd_price")

