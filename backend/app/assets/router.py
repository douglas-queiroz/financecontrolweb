from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.assets.repository import (
    AssetNotFoundError,
    AssetRepository,
    InsufficientQuantityError,
    MissingFxRateError,
    NotABondError,
)
from app.assets.schemas import (
    AssetCreate,
    AssetRead,
    AssetTransactionCreate,
    AssetTransactionRead,
    AssetUpdate,
    AssetValueUpdate,
    MonthlyTotal,
)
from app.core.database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])


def get_repository(db: Session = Depends(get_db)) -> AssetRepository:
    return AssetRepository(db)


@router.get("", response_model=list[AssetRead])
def list_assets(repo: AssetRepository = Depends(get_repository)):
    return repo.list_assets()


@router.post("", response_model=AssetRead, status_code=201)
def create_asset(data: AssetCreate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.create_asset(data)
    except MissingFxRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/monthly-totals", response_model=list[MonthlyTotal])
def monthly_totals(repo: AssetRepository = Depends(get_repository)):
    return repo.fetch_monthly_totals(date.today())


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: UUID, data: AssetUpdate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.update_asset_name(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: UUID, repo: AssetRepository = Depends(get_repository)):
    try:
        repo.delete_asset(asset_id)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{asset_id}/transactions", response_model=list[AssetTransactionRead])
def list_transactions(asset_id: UUID, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.list_transactions(asset_id)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{asset_id}/transactions", response_model=AssetTransactionRead, status_code=201)
def create_transaction(
    asset_id: UUID, data: AssetTransactionCreate, repo: AssetRepository = Depends(get_repository)
):
    try:
        return repo.create_transaction(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InsufficientQuantityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except MissingFxRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{asset_id}/value", response_model=AssetRead)
def update_value(asset_id: UUID, data: AssetValueUpdate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.create_manual_value(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotABondError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc