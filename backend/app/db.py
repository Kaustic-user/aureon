from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path

from fastapi import Request
from sqlalchemy import String, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from . import config


class Base(DeclarativeBase):
    pass


class DecimalText(TypeDecorator):
    """Exact decimal stored as TEXT.

    SQLite has no exact decimal type (NUMERIC is stored as a float), so fund
    units and NAVs are kept as strings and converted to Decimal on read.
    """

    impl = String(40)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(Decimal(value))

    def process_result_value(self, value, dialect):
        return None if value is None else Decimal(value)


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def make_engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(sqlite_url(path), connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=FULL")  # durability over speed (NFR-03)
        cur.close()

    return engine


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def run_migrations(path: Path) -> None:
    from alembic import command
    from alembic.config import Config

    path.parent.mkdir(parents=True, exist_ok=True)
    cfg = Config()
    cfg.set_main_option("script_location", str(config.MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", sqlite_url(path))
    command.upgrade(cfg, "head")


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.sessionmaker() as session:
        yield session
