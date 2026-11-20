# Aureon

A personal finance app that runs on your own machine. It tracks expenses and income, budgets, accounts, recurring bills, mutual funds and stocks. You get net worth, cash flow and XIRR from one local database.

- **Local only.** The server binds to `127.0.0.1` and rejects any other `Host` header. There is no cloud and no account.
- **Your data:** `data/aureon.db` inside this project folder. The folder is git-ignored. Back it up by copying `data/` while Aureon is stopped.
  - **OneDrive warning:** this project sits in OneDrive. If OneDrive syncs a SQLite file while Aureon is writing to it, you can get conflict copies or a corrupt database. Pause OneDrive sync while Aureon is running, or mark `data/` "Always keep on this device" and only let it sync when the app is stopped.
- **Derived numbers:** balances, net worth and portfolio value are always calculated from your transactions. Nothing is typed in twice.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the feature plan and [docs/UI_DESIGN.md](docs/UI_DESIGN.md) for the design decisions.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, SQLite (WAL) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, Recharts, lucide-react |
| Prices | Mutual funds come from AMFI `NAVAll.txt`. Stock prices are entered manually for now. |

## Run it (everyday use)

```bash
cd backend
.venv/Scripts/python -m app          # → http://127.0.0.1:8000
```

FastAPI serves the built UI from `frontend/dist`. Rebuild the UI after changing frontend code (see below).

## First-time setup

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest        # 25 tests

# Frontend (Node 20+)
cd ../frontend
npm install
npm run build                         # writes frontend/dist
```

The database schema is created and migrated automatically on startup (Alembic).

## Development

Run the API with auto-reload in one terminal and the Vite dev server in another. Vite proxies `/api` to port 8000.

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1
cd frontend && npm run dev            # → http://127.0.0.1:5173
```

`npm run typecheck` checks types without building. API docs are at http://127.0.0.1:8000/api/docs.

## Try it with sample data

```bash
cd backend
.venv/Scripts/python -m app.seed --db ../data/aureon-demo.db
AUREON_DB_PATH=../data/aureon-demo.db .venv/Scripts/python -m app
```

The seed script refuses to write into a database that already has transactions, so it can't mix demo data into your real file.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AUREON_DB_PATH` | `<project>/data/aureon.db` | Database file |
| `AUREON_PORT` | `8000` | Local port (host is always 127.0.0.1) |
| `AUREON_CA_BUNDLE` | — | PEM bundle for the AMFI download on networks that inspect TLS |

### Corporate network notes (this machine)

Everything lives inside this folder. `tools/` is git-ignored and holds:

- `tools/node-v26.13.1-win-x64/`: a portable Node. Put it on `PATH` before running npm:
  `export PATH="$PWD/tools/node-v26.13.1-win-x64:$PATH"` (from the project root).
- `tools/win-ca-bundle.pem`: a PEM export of the Windows certificate store. The network inspects TLS, so pip and npm need it to avoid "self-signed certificate in chain" errors.
- `tools/cache/`: the npm and pip download caches.

These are already wired up:

- `frontend/.npmrc` points npm's cache and `cafile` into `tools/`. Run npm from inside `frontend/`.
- `backend/.venv/pip.ini` points pip's `cert` and `cache-dir` into `tools/`. If you recreate the venv, copy that file back in.
- **Refresh NAVs fails?** Start the server with `AUREON_CA_BUNDLE=../tools/win-ca-bundle.pem`.
- **Your environment sets `NODE_TLS_REJECT_UNAUTHORIZED=0`.** That turns off certificate checking for every Node program. Removing it and using the CA bundle above is safer.

Python itself (the Microsoft Store install the venv was created from) is the one dependency outside this folder.

## How the numbers work

- **Money:** stored as integer paise. Units and prices are exact decimals, never floats.
- **Cost basis:** FIFO. Sells consume the oldest lots first, and a sell that exceeds the units you hold is rejected.
- **XIRR:** annualised from dated cash flows. It is hidden until a holding is 30 days old, because annualising a few days of movement is misleading.
- **Budgets:** a budget on a parent category (Food) includes its subcategories (Groceries, Eating out…). "Projected" extrapolates this month's pace to month-end.
- **Audit log:** every transaction edit and delete is recorded in the `audit_log` table.

## Not done yet

- Database encryption (SQLCipher). For now, rely on Windows account security and BitLocker.
- Automatic stock prices; prices are entered from the holding dialog.
- CSV and bank statement import, reports, goals, and an average-cost option for cost basis.
