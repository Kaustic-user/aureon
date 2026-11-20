"""Runtime configuration, read from environment variables.

AUREON_DB_PATH    Path to the SQLite database file.
                  Default: <project>/data/aureon.db, so the app and its data
                  live together in one folder. data/ is git-ignored.
AUREON_PORT       Port for the local server (default 8000). The server only
                  ever binds to 127.0.0.1.
AUREON_CA_BUNDLE  Optional PEM bundle for outbound HTTPS (NAV downloads),
                  for networks that inspect TLS with a private root CA.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
MIGRATIONS_DIR = BACKEND_DIR / "migrations"

HOST = "127.0.0.1"
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]


def default_data_dir() -> Path:
    # Inside the project folder (user's choice). Never %LOCALAPPDATA%: the
    # Microsoft Store build of Python silently redirects writes there into a
    # private package folder that Windows deletes on app reset/uninstall.
    return PROJECT_DIR / "data"


def db_path() -> Path:
    override = os.environ.get("AUREON_DB_PATH")
    return Path(override).expanduser().resolve() if override else default_data_dir() / "aureon.db"


def port() -> int:
    return int(os.environ.get("AUREON_PORT", "8000"))


def ca_bundle() -> str | None:
    return os.environ.get("AUREON_CA_BUNDLE") or None
