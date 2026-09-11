from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./financecontrol.db"
    cors_origins: list[str] = ["http://localhost:5173"]

    brapi_api_token: str | None = None
    coingecko_api_key: str | None = None
    twelve_data_api_key: str | None = None


settings = Settings()