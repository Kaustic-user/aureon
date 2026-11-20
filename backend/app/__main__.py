"""`python -m app` starts Aureon on http://127.0.0.1:8000 (localhost only)."""

import uvicorn

from . import config
from .main import create_app


def main() -> None:
    app = create_app()
    print(f"Aureon running at http://{config.HOST}:{config.port()}  (database: {app.state.db_path})")
    uvicorn.run(app, host=config.HOST, port=config.port(), log_level="warning")


if __name__ == "__main__":
    main()
