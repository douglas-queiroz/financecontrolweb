from app.core.config import Settings


def test_default_database_url():
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:///./financecontrol.db"


def test_default_cors_origins():
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["http://localhost:5173"]