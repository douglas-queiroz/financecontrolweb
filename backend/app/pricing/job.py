import logging
from datetime import date

from sqlalchemy.orm import Session

from app.assets.models import BTC_CURRENCY_CODE, AssetCategory, Currency
from app.assets.repository import AssetRepository
from app.core.config import settings
from app.pricing.clients import (
    BrapiClient,
    CoinGeckoClient,
    FrankfurterClient,
    TwelveDataClient,
)

logger = logging.getLogger(__name__)


def run_daily_price_update(
    db: Session,
    *,
    brapi: BrapiClient | None = None,
    twelvedata: TwelveDataClient | None = None,
    frankfurter: FrankfurterClient | None = None,
    coingecko: CoinGeckoClient | None = None,
) -> None:
    repo = AssetRepository(db)
    brapi = brapi or BrapiClient(settings.brapi_api_token)
    twelvedata = twelvedata or TwelveDataClient(settings.twelve_data_api_key)
    frankfurter = frankfurter or FrankfurterClient()
    coingecko = coingecko or CoinGeckoClient(settings.coingecko_api_key)
    today = date.today()

    assets = repo.priceable_assets()
    if assets:
        _update_prices(repo, assets, brapi, twelvedata, today)
    db.commit()

    all_assets = repo.all_assets()
    has_bitcoin = any(a.category == AssetCategory.bitcoin.value for a in all_assets)
    non_brl_currencies = {
        a.currency for a in all_assets if a.currency in (Currency.USD.value, Currency.EUR.value)
    }
    if not has_bitcoin and not non_brl_currencies:
        logger.info("No bitcoin or non-BRL assets; skipping FX rate fetch")
        return
    _update_fx_rates(repo, frankfurter, coingecko, non_brl_currencies, has_bitcoin, today)
    db.commit()


def _update_prices(
    repo: AssetRepository,
    assets,
    brapi: BrapiClient,
    twelvedata: TwelveDataClient,
    today: date,
) -> None:
    brapi_codes = {a.code for a in assets if a.currency == Currency.BRL.value}
    for code in sorted(brapi_codes):
        try:
            price = brapi.fetch_quote(code)
        except Exception as exc:
            logger.warning("brapi.dev failed for %s: %s", code, exc)
            continue
        if price is None:
            continue
        for asset in assets:
            if asset.code == code:
                repo.record_market_price(asset.id, price, today)

    usd_eur_codes = {a.code for a in assets if a.currency in (Currency.USD.value, Currency.EUR.value)}
    for code in sorted(usd_eur_codes):
        try:
            price = twelvedata.fetch_price(code)
        except Exception as exc:
            logger.warning("Twelve Data failed for %s: %s", code, exc)
            continue
        if price is None:
            continue
        for asset in assets:
            if asset.code == code:
                repo.record_market_price(asset.id, price, today)


def _update_fx_rates(
    repo: AssetRepository,
    frankfurter: FrankfurterClient,
    coingecko: CoinGeckoClient,
    non_brl_currencies: set[str],
    has_bitcoin: bool,
    today: date,
) -> None:
    for base in (Currency.USD.value, Currency.EUR.value):
        if base not in non_brl_currencies:
            continue
        try:
            rate = frankfurter.fetch_rate(base)
        except Exception as exc:
            logger.warning("Frankfurter failed for %s: %s", base, exc)
            continue
        repo.record_market_fx_rate(base, rate, today)

    if has_bitcoin:
        try:
            rate = coingecko.fetch_btc_brl()
        except Exception as exc:
            logger.warning("CoinGecko failed for BTC: %s", exc)
            return
        if rate is not None:
            repo.record_market_fx_rate(BTC_CURRENCY_CODE, rate, today)