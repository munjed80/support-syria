from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
from typing import Union


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@db:5432/municipal_requests"
    secret_key: str = "change-me-in-production-use-a-strong-random-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 hours

    # File storage
    upload_dir: str = "/app/uploads"

    # Rate limiting (public endpoints)
    rate_limit_per_hour: int = 3

    # CORS allowed origins (comma-separated in env var or a list in code)
    cors_origins: Union[list[str], str] = ["http://localhost:5173"]

    # Environment: "development" or "production"
    environment: str = "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
