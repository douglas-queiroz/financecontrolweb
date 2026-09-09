from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.expenses.router import router as expenses_router

app = FastAPI(title="Financial Control Web API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}