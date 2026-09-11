import pytest
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


def shift_months(year: int, month: int, months: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + months
    return divmod(index, 12)


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


def _create_stock(client, **overrides):
    body = {
        "name": "PETR4", "category": "stock", "code": "PETR4", "currency": "BRL",
        "quantity": "10", "unit_price": "30.00", "date": "2026-01-01",
    }
    body.update(overrides)
    return client.post("/api/assets", json=body)


def test_create_and_list_asset(client):
    response = _create_stock(client)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "PETR4"
    assert body["current_value_brl"] == "300.00"

    listed = client.get("/api/assets").json()
    assert len(listed) == 1


def test_create_stock_missing_code_rejected(client):
    response = client.post(
        "/api/assets",
        json={
            "name": "X", "category": "stock", "currency": "BRL", "quantity": "1",
            "unit_price": "1.00", "date": "2026-01-01",
        },
    )
    assert response.status_code == 422


def test_create_usd_asset_without_fx_rate_returns_422(client):
    response = client.post(
        "/api/assets",
        json={
            "name": "AAPL", "category": "stock", "code": "AAPL", "currency": "USD",
            "quantity": "1", "unit_price": "150.00", "date": "2026-01-01",
        },
    )
    assert response.status_code == 422


def test_buy_sell_transaction_flow(client):
    created = _create_stock(client).json()

    sell = client.post(
        f"/api/assets/{created['id']}/transactions",
        json={"type": "sell", "quantity": "4", "unit_price": "40.00", "date": "2026-02-01"},
    )
    assert sell.status_code == 201
    assert sell.json()["realized_gain_loss_brl"] == "40.00"

    transactions = client.get(f"/api/assets/{created['id']}/transactions").json()
    assert len(transactions) == 2


def test_sell_more_than_held_returns_422(client):
    created = _create_stock(client).json()
    response = client.post(
        f"/api/assets/{created['id']}/transactions",
        json={"type": "sell", "quantity": "11", "unit_price": "40.00", "date": "2026-02-01"},
    )
    assert response.status_code == 422


def test_update_asset_name(client):
    created = _create_stock(client).json()
    response = client.patch(f"/api/assets/{created['id']}", json={"name": "Petrobras"})
    assert response.status_code == 200
    assert response.json()["name"] == "Petrobras"


def test_update_missing_asset_returns_404(client):
    response = client.patch(
        "/api/assets/00000000-0000-0000-0000-000000000000", json={"name": "X"}
    )
    assert response.status_code == 404


def test_delete_asset(client):
    created = _create_stock(client).json()
    response = client.delete(f"/api/assets/{created['id']}")
    assert response.status_code == 204
    assert client.get("/api/assets").json() == []


def test_bond_manual_value_update(client):
    created = client.post(
        "/api/assets",
        json={
            "name": "Tesouro", "category": "bond", "currency": "BRL", "quantity": "1",
            "unit_price": "1000.00", "date": "2026-01-01",
        },
    ).json()
    response = client.post(
        f"/api/assets/{created['id']}/value", json={"price": "1050.00", "date": "2026-02-01"}
    )
    assert response.status_code == 200
    assert response.json()["current_value_brl"] == "1050.00"


def test_manual_value_update_rejected_for_non_bond(client):
    created = _create_stock(client).json()
    response = client.post(
        f"/api/assets/{created['id']}/value", json={"price": "35.00", "date": "2026-02-01"}
    )
    assert response.status_code == 400


def test_asset_monthly_totals_returns_12_entries_in_order(client):
    today = date.today()
    expected = []
    for offset in range(-11, 1):
        year, month = shift_months(today.year, today.month, offset)
        expected.append(f"{year}-{month + 1:02d}")

    response = client.get("/api/assets/monthly-totals")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 12
    assert [entry["month"] for entry in body] == expected
    assert all(entry["total"] == "0.00" for entry in body)


def test_asset_monthly_totals_sums_asset_in_current_month(client):
    today = date.today()
    response = client.post(
        "/api/assets",
        json={
            "name": "PETR4", "category": "stock", "code": "PETR4", "currency": "BRL",
            "quantity": "10", "unit_price": "30.00", "date": today.isoformat(),
        },
    )
    assert response.status_code == 201

    body = client.get("/api/assets/monthly-totals").json()

    assert body[-1]["month"] == today.strftime("%Y-%m")
    assert body[-1]["total"] == "300.00"
    assert all(entry["total"] == "0.00" for entry in body[:-1])