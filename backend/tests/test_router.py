import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import date

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


def test_create_expense(client):
    response = client.post(
        "/api/expenses",
        json={"description": "Rent", "amount": "1200.00", "due_date": "2026-01-01"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["description"] == "Rent"
    assert body["amount"] == "1200.00"
    assert body["paid_at"] is None


def test_create_expense_rejects_invalid_amount(client):
    response = client.post(
        "/api/expenses",
        json={"description": "Rent", "amount": "0", "due_date": "2026-01-01"},
    )
    assert response.status_code == 422


def test_list_by_month_sorted_by_due_date(client):
    client.post("/api/expenses", json={"description": "B", "amount": "10", "due_date": "2026-01-20"})
    client.post("/api/expenses", json={"description": "A", "amount": "10", "due_date": "2026-01-05"})

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["A", "B"]


def test_list_by_month_excludes_other_months(client):
    client.post("/api/expenses", json={"description": "January", "amount": "10", "due_date": "2026-01-15"})
    client.post("/api/expenses", json={"description": "February", "amount": "10", "due_date": "2026-02-15"})

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["January"]


def test_list_by_month_places_paid_after_unpaid(client):
    client.post("/api/expenses", json={"description": "Unpaid", "amount": "10", "due_date": "2026-01-20"})
    paid = client.post(
        "/api/expenses", json={"description": "Paid", "amount": "10", "due_date": "2026-01-05"}
    ).json()
    client.post(f"/api/expenses/{paid['id']}/mark-paid")

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["Unpaid", "Paid"]


def test_mark_as_paid_sets_paid_at_and_keeps_expense_in_month_list(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.post(f"/api/expenses/{created['id']}/mark-paid")
    assert response.status_code == 200
    assert response.json()["paid_at"] is not None

    month_list = client.get("/api/expenses?year=2026&month=1").json()
    matching = [item for item in month_list if item["id"] == created["id"]]
    assert len(matching) == 1
    assert matching[0]["paid_at"] is not None


def test_mark_as_paid_recurring_spawns_next_occurrence(client):
    created = client.post(
        "/api/expenses",
        json={
            "description": "Subscription",
            "amount": "10",
            "due_date": "2026-01-01",
            "is_recurring": True,
            "recurrence_frequency": "monthly",
        },
    ).json()

    client.post(f"/api/expenses/{created['id']}/mark-paid")

    next_month = client.get("/api/expenses?year=2026&month=2").json()
    assert any(item["due_date"] == "2026-02-01" for item in next_month)


def test_reverse_payment_returns_expense_to_unpaid(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()
    client.post(f"/api/expenses/{created['id']}/mark-paid")

    response = client.post(f"/api/expenses/{created['id']}/reverse-payment")
    assert response.status_code == 200
    assert response.json()["paid_at"] is None


def test_delete_expense(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.delete(f"/api/expenses/{created['id']}")
    assert response.status_code == 204

    month_list = client.get("/api/expenses?year=2026&month=1").json()
    assert all(item["id"] != created["id"] for item in month_list)


def test_get_expense_by_id(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.get(f"/api/expenses/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_missing_expense_returns_404(client):
    response = client.get("/api/expenses/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_update_missing_expense_returns_404(client):
    response = client.put(
        "/api/expenses/00000000-0000-0000-0000-000000000000",
        json={"description": "X", "amount": "10", "due_date": "2026-01-01"},
    )
    assert response.status_code == 404


def test_monthly_totals_returns_12_entries_in_order(client):
    today = date.today()
    expected_months = []
    for offset in range(-11, 1):
        year, month = shift_months(today.year, today.month, offset)
        expected_months.append(f"{year}-{month + 1:02d}")

    response = client.get("/api/expenses/monthly-totals")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 12
    assert [entry["month"] for entry in body] == expected_months


def test_monthly_totals_sums_due_amounts(client):
    today = date.today()
    start_year, start_month = shift_months(today.year, today.month, -11)
    due_date = f"{start_year}-{start_month + 1:02d}-15"

    client.post(
        "/api/expenses", json={"description": "Rent", "amount": "1200.50", "due_date": due_date}
    )
    client.post(
        "/api/expenses", json={"description": "Water", "amount": "100.00", "due_date": due_date}
    )

    response = client.get("/api/expenses/monthly-totals")
    assert response.status_code == 200
    body = response.json()

    assert body[0]["total"] == "1300.50"
    assert all(entry["total"] == "0.00" for entry in body[1:])


def test_monthly_totals_serializes_paid_flags_and_next_month_total(client):
    today = date.today()
    current_due = f"{today.year}-{today.month:02d}-05"
    next_year, next_month = shift_months(today.year, today.month, 1)
    next_due = f"{next_year}-{next_month + 1:02d}-10"

    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "100.00", "due_date": current_due}
    ).json()
    client.post(f"/api/expenses/{created['id']}/mark-paid")
    client.post(
        "/api/expenses", json={"description": "Next", "amount": "55.50", "due_date": next_due}
    )

    response = client.get("/api/expenses/monthly-totals")
    assert response.status_code == 200
    body = response.json()

    assert body[-1]["all_paid"] is True
    assert body[-1]["next_month_total"] == "55.50"
    assert all(entry["all_paid"] is None for entry in body[:-1])
    assert all(entry["next_month_total"] is None for entry in body[:-1])


def test_manual_pricing_refresh_runs_the_job(client, monkeypatch):
    from app.pricing import router as pricing_router

    calls = []

    def fake_run(db):
        calls.append(db)

    monkeypatch.setattr(pricing_router, "run_daily_price_update", fake_run)

    response = client.post("/api/pricing/refresh")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert len(calls) == 1


def test_pricing_status_empty(client):
    response = client.get("/api/pricing/status")
    assert response.status_code == 200
    body = response.json()
    assert body["last_price_update"] is None
    assert body["last_fx_update"] is None


def test_pricing_status_reports_latest_market_updates():
    from decimal import Decimal

    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.assets.models import Currency
    from app.assets.repository import AssetRepository
    from app.assets.schemas import AssetCategory, AssetCreate
    from app.core.database import Base, get_db
    from app.main import app

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
    try:
        db = TestingSessionLocal()
        asset = AssetRepository(db).create_asset(
            AssetCreate(
                name="VOO",
                category=AssetCategory.stock,
                code="VOO",
                currency=Currency.USD,
                quantity=Decimal("5"),
                unit_price=Decimal("450.00"),
                date=date(2026, 1, 1),
                fx_rate_to_brl=Decimal("5.00"),
            )
        )
        repo = AssetRepository(db)
        repo.record_market_price(asset.id, Decimal("478.29"), date(2026, 9, 13))
        repo.record_market_fx_rate("USD", Decimal("5.30"), date(2026, 9, 13))
        db.commit()
        db.close()

        response = TestClient(app).get("/api/pricing/status")
        assert response.status_code == 200
        body = response.json()
        assert body["last_price_update"] == "2026-09-13"
        assert body["last_fx_update"] == "2026-09-13"
    finally:
        app.dependency_overrides.clear()
        engine.dispose()