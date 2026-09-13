from pydantic import BaseModel


class PricingStatus(BaseModel):
    last_price_update: str | None = None
    last_fx_update: str | None = None
    has_brapi_key: bool = False
    has_twelvedata_key: bool = False
    has_coingecko_key: bool = False