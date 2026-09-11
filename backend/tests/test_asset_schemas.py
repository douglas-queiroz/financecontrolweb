import pytest
from datetime import date
from decimal import Decimal

from pydantic import ValidationError

from app.assets.models import AssetCategory, Currency, TransactionType
from app.assets.schemas import AssetCreate, AssetTransactionCreate, AssetValueUpdate


def test_valid_stock_create():
    asset = AssetCreate(
        name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
        quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
    )
    assert asset.code == "PETR4"


def test_stock_requires_code():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code=None, currency=Currency.BRL,
            quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )


def test_bond_rejects_code():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Tesouro", category=AssetCategory.bond, code="X", currency=Currency.BRL,
            quantity=Decimal("1"), unit_price=Decimal("100.00"), date=date(2026, 1, 1),
        )


def test_bond_requires_currency():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Tesouro", category=AssetCategory.bond, code=None, currency=None,
            quantity=Decimal("1"), unit_price=Decimal("100.00"), date=date(2026, 1, 1),
        )


def test_bitcoin_rejects_code_and_currency():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=Currency.BRL,
            quantity=Decimal("0.01"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )


def test_valid_bitcoin_create():
    asset = AssetCreate(
        name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
        quantity=Decimal("0.01"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
    )
    assert asset.currency is None


def test_rejects_non_positive_quantity():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
            quantity=Decimal("0"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )


def test_transaction_rejects_non_positive_unit_price():
    with pytest.raises(ValidationError):
        AssetTransactionCreate(
            type=TransactionType.buy, quantity=Decimal("1"), unit_price=Decimal("0"), date=date(2026, 1, 1),
        )


def test_value_update_requires_positive_price():
    with pytest.raises(ValidationError):
        AssetValueUpdate(price=Decimal("0"), date=date(2026, 1, 1))