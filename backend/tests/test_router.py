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


def test_list_unpaid_sorted_by_due_date(client):
    client.post("/api/expenses", json={"description": "B", "amount": "10", "due_date": "2026-02-01"})
    client.post("/api/expenses", json={"description": "A", "amount": "10", "due_date": "2026-01-01"})

    response = client.get("/api/expenses/unpaid")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["A", "B"]


def test_mark_as_paid_moves_expense_to_paid_list(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.post(f"/api/expenses/{created['id']}/mark-paid")
    assert response.status_code == 200
    assert response.json()["paid_at"] is not None

    unpaid = client.get("/api/expenses/unpaid").json()
    assert all(item["id"] != created["id"] for item in unpaid)

    paid = client.get("/api/expenses/paid").json()
    assert any(item["id"] == created["id"] for item in paid)


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

    unpaid = client.get("/api/expenses/unpaid").json()
    assert any(item["due_date"] == "2026-02-01" for item in unpaid)


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

    unpaid = client.get("/api/expenses/unpaid").json()
    assert all(item["id"] != created["id"] for item in unpaid)


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