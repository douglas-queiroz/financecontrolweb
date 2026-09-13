from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.expenses.repository import ExpenseNotFoundError, ExpenseRepository
from app.expenses.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate, MonthlyTotal

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def get_repository(db: Session = Depends(get_db)) -> ExpenseRepository:
    return ExpenseRepository(db)


@router.get("/monthly-totals", response_model=list[MonthlyTotal])
def monthly_totals(repo: ExpenseRepository = Depends(get_repository)):
    return repo.fetch_monthly_totals(date.today())


@router.get("", response_model=list[ExpenseRead])
def list_by_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    repo: ExpenseRepository = Depends(get_repository),
):
    return repo.fetch_by_month(year=year, month=month)


@router.post("", response_model=ExpenseRead, status_code=201)
def create_expense(data: ExpenseCreate, repo: ExpenseRepository = Depends(get_repository)):
    return repo.create(data)


@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.get(expense_id)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{expense_id}", response_model=ExpenseRead)
def update_expense(expense_id: UUID, data: ExpenseUpdate, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.update(expense_id, data)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        repo.delete(expense_id)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{expense_id}/mark-paid", response_model=ExpenseRead)
def mark_as_paid(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.mark_as_paid(expense_id, datetime.now(timezone.utc))
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{expense_id}/reverse-payment", response_model=ExpenseRead)
def reverse_payment(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.reverse_payment(expense_id)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc