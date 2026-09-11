from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.assets.models import BTC_CURRENCY_CODE, AssetValueHistory, Currency, FxRateHistory, ValueSource
from app.assets.repository import AssetRepository
from app.assets.schemas import AssetCreate, AssetCategory
from app.pricing.clients import BrapiClient, CoinGeckoClient, FrankfurterClient, TwelveDataClient
from app.pricing.job import run_daily_price_update


class FakeBrapi:
    def __init__(self, prices=None):
        self.prices = prices or {}

    def fetch_quote(self, code):
        return self.prices.get(code)


class FakeTwelveData:
    def __init__(self, prices=None, fail_codes=None):
        self.prices = prices or {}
        self.fail_codes = fail_codes or set()

    def fetch_price(self, symbol):
        if symbol in self.fail_codes:
            raise RuntimeError("boom")
        return self.prices.get(symbol)


class FakeFrankfurter:
    def __init__(self, rates=None):
        self.rates = rates or {}

    def fetch_rate(self, base):
        return self.rates.get(base)


class FakeCoinGecko:
    def __init__(self, rate=None):
        self.rate = rate

    def fetch_btc_brl(self):
        return self.rate


def _quote_rows(db, asset_id):
    return list(
        db.scalars(
            select(AssetValueHistory).where(AssetValueHistory.asset_id == asset_id)
        )
    )


def _fx_rows(db, currency):
    return list(db.scalars(select(FxRateHistory).where(FxRateHistory.currency == currency)))


def _market_fx_rows(db, currency):
    rows = _fx_rows(db, currency)
    return [row for row in rows if row.source == ValueSource.market.value]


def _create(db, **inputs):
    return AssetRepository(db).create_asset(AssetCreate(**inputs))


def test_job_writes_market_prices_and_fx_rates(db_session, monkeypatch):
    repo = AssetRepository(db_session)
    brl_asset = repo.create_asset(
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
            quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )
    )
    usd_asset = repo.create_asset(
        AssetCreate(
            name="VOO", category=AssetCategory.stock, code="VOO", currency=Currency.USD,
            quantity=Decimal("5"), unit_price=Decimal("450.00"), date=date(2026, 1, 1),
            fx_rate_to_brl=Decimal("5.00"),
        )
    )
    btc_asset = repo.create_asset(
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
            quantity=Decimal("0.1"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )
    )

    brapi = FakeBrapi({"PETR4": Decimal("32.46")})
    twelvedata = FakeTwelveData({"VOO": Decimal("478.29")})
    frankfurter = FakeFrankfurter({"USD": Decimal("5.30")})
    coingecko = FakeCoinGecko(Decimal("260000.00"))

    run_daily_price_update(
        db_session, brapi=brapi, twelvedata=twelvedata, frankfurter=frankfurter, coingecko=coingecko
    )

    petr_rows = _quote_rows(db_session, brl_asset.id)
    assert len(petr_rows) == 1
    assert petr_rows[0].price == Decimal("32.46")
    assert petr_rows[0].source == ValueSource.market.value

    voo_rows = _quote_rows(db_session, usd_asset.id)
    assert len(voo_rows) == 1
    assert voo_rows[0].price == Decimal("478.29")

    assert len(_quote_rows(db_session, btc_asset.id)) == 0

    usd_fx = _market_fx_rows(db_session, "USD")
    assert len(usd_fx) == 1
    assert usd_fx[0].rate_to_brl == Decimal("5.30")
    assert usd_fx[0].source == ValueSource.market.value

    btc_fx = _market_fx_rows(db_session, BTC_CURRENCY_CODE)
    assert len(btc_fx) == 1
    assert btc_fx[0].rate_to_brl == Decimal("260000.00")


def test_job_one_failing_ticker_does_not_block_others(db_session):
    repo = AssetRepository(db_session)
    ok_asset = repo.create_asset(
        AssetCreate(
            name="VOO", category=AssetCategory.stock, code="VOO", currency=Currency.USD,
            quantity=Decimal("5"), unit_price=Decimal("450.00"), date=date(2026, 1, 1),
            fx_rate_to_brl=Decimal("5.00"),
        )
    )
    repo.create_asset(
        AssetCreate(
            name="BND", category=AssetCategory.stock, code="BND", currency=Currency.USD,
            quantity=Decimal("5"), unit_price=Decimal("80.00"), date=date(2026, 1, 1),
            fx_rate_to_brl=Decimal("5.00"),
        )
    )

    twelvedata = FakeTwelveData({"VOO": Decimal("478.29")}, fail_codes={"BND"})
    frankfurter = FakeFrankfurter({"USD": Decimal("5.30")})
    coingecko = FakeCoinGecko(None)

    run_daily_price_update(
        db_session, brapi=FakeBrapi(), twelvedata=twelvedata,
        frankfurter=frankfurter, coingecko=coingecko,
    )

    ok_rows = _quote_rows(db_session, ok_asset.id)
    assert len(ok_rows) == 1
    assert ok_rows[0].price == Decimal("478.29")
    assert len(_market_fx_rows(db_session, "USD")) == 1


def test_job_skips_fx_when_no_bitcoin_and_no_non_brl_assets(db_session):
    AssetRepository(db_session).create_asset(
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
            quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )
    )

    class ExplodingFrankfurter:
        def fetch_rate(self, base):
            raise AssertionError("FX should not be fetched")

    run_daily_price_update(
        db_session, brapi=FakeBrapi({"PETR4": Decimal("32.46")}),
        twelvedata=FakeTwelveData(), frankfurter=ExplodingFrankfurter(),
        coingecko=FakeCoinGecko(None),
    )
    assert len(_fx_rows(db_session, "USD")) == 0


def test_job_does_not_touch_bonds(db_session):
    repo = AssetRepository(db_session)
    bond = repo.create_asset(
        AssetCreate(
            name="Tesouro IPCA", category=AssetCategory.bond, code=None, currency=Currency.BRL,
            quantity=Decimal("1"), unit_price=Decimal("1000.00"), date=date(2026, 1, 1),
        )
    )
    btc_asset = repo.create_asset(
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
            quantity=Decimal("0.1"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )
    )

    run_daily_price_update(
        db_session, brapi=FakeBrapi(), twelvedata=FakeTwelveData(),
        frankfurter=FakeFrankfurter({"USD": Decimal("5.30")}),
        coingecko=FakeCoinGecko(Decimal("260000.00")),
    )

    assert len(_quote_rows(db_session, bond.id)) == 0
    assert len(_quote_rows(db_session, btc_asset.id)) == 0
    assert len(_market_fx_rows(db_session, BTC_CURRENCY_CODE)) == 1


def test_job_is_idempotent_within_a_day(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
            quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )
    )

    run_daily_price_update(
        db_session, brapi=FakeBrapi({"PETR4": Decimal("32.46")}),
        twelvedata=FakeTwelveData(), frankfurter=FakeFrankfurter(),
        coingecko=FakeCoinGecko(None),
    )
    run_daily_price_update(
        db_session, brapi=FakeBrapi({"PETR4": Decimal("33.00")}),
        twelvedata=FakeTwelveData(), frankfurter=FakeFrankfurter(),
        coingecko=FakeCoinGecko(None),
    )

    assert len(_quote_rows(db_session, asset.id)) == 1


def test_job_noops_for_unconfigured_providers_but_writes_keyless_fx(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(
        AssetCreate(
            name="VOO", category=AssetCategory.stock, code="VOO", currency=Currency.USD,
            quantity=Decimal("5"), unit_price=Decimal("450.00"), date=date(2026, 1, 1),
            fx_rate_to_brl=Decimal("5.00"),
        )
    )
    btc_asset = repo.create_asset(
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
            quantity=Decimal("0.1"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )
    )

    run_daily_price_update(
        db_session,
        brapi=BrapiClient(None),
        twelvedata=TwelveDataClient(None),
        frankfurter=FakeFrankfurter({"USD": Decimal("5.30")}),
        coingecko=CoinGeckoClient(None),
    )

    assert len(_quote_rows(db_session, asset.id)) == 0
    assert len(_quote_rows(db_session, btc_asset.id)) == 0
    assert len(_market_fx_rows(db_session, "USD")) == 1
    assert len(_market_fx_rows(db_session, BTC_CURRENCY_CODE)) == 0