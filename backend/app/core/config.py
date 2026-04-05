from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    APP_NAME: str = 'EnergyFlow API'
    ENV: str = 'dev'
    API_PREFIX: str = '/api/v1'

    JWT_SECRET_KEY: str = Field(..., min_length=16)
    JWT_ALGORITHM: str = 'HS256'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    MONGODB_URI: str
    MONGODB_DB_NAME: str = 'energyflow'

    CORS_ORIGINS: str = 'http://localhost:3000'

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(',') if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
