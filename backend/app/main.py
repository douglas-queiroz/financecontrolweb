import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.expenses.router import router as expenses_router
from app.assets.router import router as assets_router
from app.pricing.job import run_daily_price_update
from app.pricing.router import router as pricing_router

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")


def _run_pricing_job() -> None:
    with SessionLocal() as db:
        try:
            run_daily_price_update(db)
        except Exception:
            logger.exception("daily pricing job failed")


scheduler.add_job(
    _run_pricing_job,
    CronTrigger(hour=7, minute=0, timezone="America/Sao_Paulo"),
    id="daily-pricing",
    max_instances=1,
    coalesce=True,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.start()
    logger.info("daily pricing scheduler started (07:00 America/Sao_Paulo)")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Financial Control Web API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses_router)
app.include_router(assets_router)
app.include_router(pricing_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}