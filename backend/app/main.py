import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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


# Production static hosting: when the frontend build is copied next to the
# backend package (see Dockerfile.prod), serve it from here with an SPA
# fallback to index.html. Absent in dev/test, so those flows are unchanged.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        target = (STATIC_DIR / full_path).resolve()
        if full_path and target.is_file() and target.is_relative_to(STATIC_DIR):
            return FileResponse(target)
        # Unknown paths that look like files (e.g. missing assets) are 404s;
        # everything else falls back to the SPA entry point.
        if "." in Path(full_path).name:
            raise HTTPException(status_code=404, detail="Not Found")
        index = STATIC_DIR / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(index)