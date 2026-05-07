from functools import lru_cache

from pydantic import Field, field_validator
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
    CORS_ORIGIN_REGEX: str | None = None

    # Auth cookie (HttpOnly, sustituye a localStorage en frontend)
    AUTH_COOKIE_NAME: str = 'energyflow_session'
    AUTH_COOKIE_DOMAIN: str | None = None  # None = host actual; setear en prod si frontend/backend están en subdominios distintos
    AUTH_COOKIE_SAMESITE: str = 'lax'  # 'lax' | 'strict' | 'none' (none requiere secure=true)

    @staticmethod
    def _strip_wrapping_quotes(value: str) -> str:
        text = value.strip()
        if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
            return text[1:-1].strip()
        return text

    @field_validator(
        'APP_NAME',
        'ENV',
        'API_PREFIX',
        'JWT_SECRET_KEY',
        'JWT_ALGORITHM',
        'MONGODB_URI',
        'MONGODB_DB_NAME',
        'CORS_ORIGINS',
        'CORS_ORIGIN_REGEX',
        'AUTH_COOKIE_NAME',
        'AUTH_COOKIE_DOMAIN',
        'AUTH_COOKIE_SAMESITE',
        mode='before',
    )
    @classmethod
    def normalize_string_env(cls, value: str) -> str:
        if isinstance(value, str):
            return cls._strip_wrapping_quotes(value)
        return value

    @field_validator('CORS_ORIGIN_REGEX', mode='before')
    @classmethod
    def normalize_cors_regex(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = cls._strip_wrapping_quotes(value) if isinstance(value, str) else str(value)
        return cleaned or None

    @field_validator('ACCESS_TOKEN_EXPIRE_MINUTES', mode='before')
    @classmethod
    def normalize_expire_minutes(cls, value: int | str) -> int:
        if isinstance(value, str):
            cleaned = cls._strip_wrapping_quotes(value)
            return int(cleaned)
        return int(value)

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(',') if origin.strip()]

    @property
    def auth_cookie_secure(self) -> bool:
        # En prod siempre Secure=True (requiere HTTPS). En dev/ci permitimos http://localhost.
        return self.ENV.lower() in {'prod', 'production'}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
