from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.assets.repository import AssetRepository
from app.core.config import settings
from app.core.database import get_db
from app.pricing.job import run_daily_price_update
from app.pricing.schemas import PricingStatus

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


@router.post("/refresh")
def refresh_prices(db: Session = Depends(get_db)) -> dict[str, str]:
    run_daily_price_update(db)
    return {"status": "ok"}


@router.get("/status", response_model=PricingStatus)
def pricing_status(db: Session = Depends(get_db)) -> PricingStatus:
    repo = AssetRepository(db)
    last_price = repo.latest_market_price()
    last_fx = repo.latest_market_fx_rate()
    return PricingStatus(
        last_price_update=last_price.isoformat() if last_price else None,
        last_fx_update=last_fx.isoformat() if last_fx else None,
        has_brapi_key=bool(settings.brapi_api_token),
        has_twelvedata_key=bool(settings.twelve_data_api_key),
        has_coingecko_key=bool(settings.coingecko_api_key),
    )