"""FastAPI application factory.

Run for development (auto-reload):
    .venv/Scripts/python -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1
Run normally (also serves the built frontend):
    .venv/Scripts/python -m app
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import make_engine, make_sessionmaker, run_migrations
from .routers import core, investments
from .services import ensure_defaults


def create_app(db_path: Path | None = None, allowed_hosts: list[str] | None = None) -> FastAPI:
    path = db_path or config.db_path()
    run_migrations(path)
    engine = make_engine(path)
    Session = make_sessionmaker(engine)
    with Session() as s:
        ensure_defaults(s)

    app = FastAPI(title="Aureon", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.sessionmaker = Session
    app.state.db_path = path
    # Rejects requests whose Host header isn't localhost, which blocks
    # DNS-rebinding attacks from web pages open in your browser.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts or config.ALLOWED_HOSTS)

    app.include_router(core.router, prefix="/api")
    app.include_router(investments.router, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "db": str(path)}

    dist = config.FRONTEND_DIST
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404)
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")
    return app
