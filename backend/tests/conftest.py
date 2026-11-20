import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(db_path=tmp_path / "test.db")
    with TestClient(app, base_url="http://127.0.0.1") as c:
        yield c


@pytest.fixture
def cats(client):
    return {c["name"]: c for c in client.get("/api/categories").json()}


@pytest.fixture
def bank(client):
    r = client.post("/api/accounts", json={"name": "Bank", "type": "bank", "opening_balance": 100_000_00})
    assert r.status_code == 201
    return r.json()
