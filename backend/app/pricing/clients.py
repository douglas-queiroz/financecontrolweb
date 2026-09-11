import logging
from decimal import Decimal

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(10.0)


class ProviderError(Exception):
    def __init__(self, provider: str, detail: str):
        self.provider = provider
        super().__init__(f"{provider}: {detail}")


class _KeyedClient:
    def __init__(self, api_key: str | None, key_env_name: str):
        self.api_key = api_key
        self.key_env_name = key_env_name
        self._warned = False

    def key(self) -> str | None:
        if self.api_key:
            return self.api_key
        if not self._warned:
            self._warned = True
            logger.warning(
                "%s API key is not configured (set %s in .env); skipping provider calls",
                type(self).__name__,
                self.key_env_name,
            )
        return None


class BrapiClient(_KeyedClient):
    def __init__(self, api_key: str | None):
        super().__init__(api_key, "BRAPI_API_TOKEN")

    def fetch_quote(self, code: str) -> Decimal | None:
        token = self.key()
        if token is None:
            return None
        try:
            response = httpx.get(
                f"https://brapi.dev/api/quote/{code}",
                params={"token": token},
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            results = response.json().get("results") or []
            if not results:
                raise ProviderError("brapi.dev", f"no quote returned for {code}")
            price = results[0].get("regularMarketPrice")
            if price is None:
                raise ProviderError("brapi.dev", f"no regularMarketPrice for {code}")
            return Decimal(str(price)).quantize(Decimal("0.01"))
        except httpx.HTTPError as exc:
            raise ProviderError("brapi.dev", f"request failed for {code}: {exc}") from exc


class TwelveDataClient(_KeyedClient):
    def __init__(self, api_key: str | None):
        super().__init__(api_key, "TWELVE_DATA_API_KEY")

    def fetch_price(self, symbol: str) -> Decimal | None:
        api_key = self.key()
        if api_key is None:
            return None
        try:
            response = httpx.get(
                "https://api.twelvedata.com/price",
                params={"symbol": symbol, "apikey": api_key},
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            if "price" not in data:
                raise ProviderError(
                    "Twelve Data", f"{data.get('message', 'no price returned')} for {symbol}"
                )
            return Decimal(str(data["price"])).quantize(Decimal("0.01"))
        except httpx.HTTPError as exc:
            raise ProviderError("Twelve Data", f"request failed for {symbol}: {exc}") from exc


class FrankfurterClient:
    def fetch_rate(self, base: str) -> Decimal:
        try:
            response = httpx.get(
                "https://api.frankfurter.dev/v1/latest",
                params={"base": base, "symbols": "BRL"},
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            rates = response.json().get("rates") or {}
            rate = rates.get("BRL")
            if rate is None:
                raise ProviderError("Frankfurter", f"no BRL rate for {base}")
            return Decimal(str(rate))
        except httpx.HTTPError as exc:
            raise ProviderError("Frankfurter", f"request failed for {base}: {exc}") from exc


class CoinGeckoClient(_KeyedClient):
    def __init__(self, api_key: str | None):
        super().__init__(api_key, "COINGECKO_API_KEY")

    def fetch_btc_brl(self) -> Decimal | None:
        api_key = self.key()
        if api_key is None:
            return None
        try:
            headers = {"x-cg-demo-api-key": api_key}
            response = httpx.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "bitcoin", "vs_currencies": "brl"},
                headers=headers,
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            rate = (data.get("bitcoin") or {}).get("brl")
            if rate is None:
                raise ProviderError("CoinGecko", "no BTC/BRL price returned")
            return Decimal(str(rate))
        except httpx.HTTPError as exc:
            raise ProviderError("CoinGecko", f"request failed: {exc}") from exc