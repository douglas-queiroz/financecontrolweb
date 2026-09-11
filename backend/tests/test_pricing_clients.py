from decimal import Decimal

import pytest

from app.pricing.clients import (
    BrapiClient,
    CoinGeckoClient,
    FrankfurterClient,
    ProviderError,
    TwelveDataClient,
)


class FakeResponse:
    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise ProviderError("http", f"status {self.status_code}")

    def json(self):
        return self._payload


def test_brapi_fetch_quote_returns_quantized_price(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        assert url == "https://brapi.dev/api/quote/PETR4"
        assert params == {"token": "secret"}
        return FakeResponse({"results": [{"regularMarketPrice": 32.456}]})

    monkeypatch.setattr("httpx.get", fake_get)
    client = BrapiClient("secret")

    assert client.fetch_quote("PETR4") == Decimal("32.46")


def test_brapi_fetch_quote_raises_when_no_results(monkeypatch):
    monkeypatch.setattr("httpx.get", lambda *a, **k: FakeResponse({"results": []}))
    with pytest.raises(ProviderError):
        BrapiClient("secret").fetch_quote("PETR4")


def test_brapi_returns_none_when_token_missing():
    assert BrapiClient(None).fetch_quote("PETR4") is None


def test_twelve_data_fetch_price_returns_quantized_price(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        assert url == "https://api.twelvedata.com/price"
        assert params == {"symbol": "VOO", "apikey": "secret"}
        return FakeResponse({"price": "478.29"})

    monkeypatch.setattr("httpx.get", fake_get)
    assert TwelveDataClient("secret").fetch_price("VOO") == Decimal("478.29")


def test_twelve_data_raises_when_no_price_field(monkeypatch):
    monkeypatch.setattr("httpx.get", lambda *a, **k: FakeResponse({"message": "unknown symbol"}))
    with pytest.raises(ProviderError):
        TwelveDataClient("secret").fetch_price("NOPE")


def test_twelve_data_returns_none_when_key_missing():
    assert TwelveDataClient(None).fetch_price("VOO") is None


def test_frankfurter_fetch_rate_returns_decimal(monkeypatch):
    def fake_get(url, params=None, timeout=None):
        assert params == {"base": "USD", "symbols": "BRL"}
        return FakeResponse({"rates": {"BRL": 5.1034}})

    monkeypatch.setattr("httpx.get", fake_get)
    assert FrankfurterClient().fetch_rate("USD") == Decimal("5.1034")


def test_frankfurter_raises_when_rate_missing(monkeypatch):
    monkeypatch.setattr("httpx.get", lambda *a, **k: FakeResponse({"rates": {}}))
    with pytest.raises(ProviderError):
        FrankfurterClient().fetch_rate("EUR")


def test_coingecko_fetch_btc_brl_returns_rate(monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        assert headers == {"x-cg-demo-api-key": "secret"}
        return FakeResponse({"bitcoin": {"brl": 250000.55}})

    monkeypatch.setattr("httpx.get", fake_get)
    assert CoinGeckoClient("secret").fetch_btc_brl() == Decimal("250000.55")


def test_coingecko_raises_when_price_missing(monkeypatch):
    monkeypatch.setattr("httpx.get", lambda *a, **k: FakeResponse({}))
    with pytest.raises(ProviderError):
        CoinGeckoClient("secret").fetch_btc_brl()


def test_coingecko_returns_none_when_key_missing():
    assert CoinGeckoClient(None).fetch_btc_brl() is None