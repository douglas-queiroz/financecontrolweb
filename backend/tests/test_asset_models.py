import uuid
from datetime import date

from app.assets.models import Asset, AssetTransaction, AssetValueHistory, FxRateHistory


def _make_asset(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        name="PETR4",
        category="stock",
        code="PETR4",
        currency="BRL",
        quantity="10",
        average_cost="30.00",
        average_cost_brl="30.00",
    )
    defaults.update(overrides)
    return Asset(**defaults)


def test_create_and_read_asset(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    fetched = db_session.get(Asset, asset.id)
    assert fetched is not None
    assert fetched.name == "PETR4"
    assert fetched.category == "stock"


def test_create_and_read_asset_transaction(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    transaction = AssetTransaction(
        id=uuid.uuid4(),
        asset_id=asset.id,
        type="buy",
        quantity="10",
        unit_price="30.00",
        total_amount="300.00",
        realized_gain_loss_brl=None,
        date=date(2026, 1, 1),
    )
    db_session.add(transaction)
    db_session.commit()

    fetched = db_session.get(AssetTransaction, transaction.id)
    assert fetched is not None
    assert fetched.asset_id == asset.id
    assert fetched.realized_gain_loss_brl is None


def test_deleting_asset_cascades_transactions_and_value_history(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    transaction = AssetTransaction(
        id=uuid.uuid4(), asset_id=asset.id, type="buy", quantity="10", unit_price="30.00",
        total_amount="300.00", realized_gain_loss_brl=None, date=date(2026, 1, 1),
    )
    value = AssetValueHistory(
        id=uuid.uuid4(), asset_id=asset.id, price="31.00", date=date(2026, 1, 2), source="market",
    )
    db_session.add_all([transaction, value])
    db_session.commit()

    db_session.delete(asset)
    db_session.commit()

    assert db_session.get(AssetTransaction, transaction.id) is None
    assert db_session.get(AssetValueHistory, value.id) is None


def test_create_and_read_fx_rate_history(db_session):
    rate = FxRateHistory(
        id=uuid.uuid4(), currency="USD", rate_to_brl="5.10", date=date(2026, 1, 1), source="market",
    )
    db_session.add(rate)
    db_session.commit()

    fetched = db_session.get(FxRateHistory, rate.id)
    assert fetched is not None
    assert fetched.currency == "USD"