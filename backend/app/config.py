from pydantic_settings import BaseSettings
from functools import lru_cache


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
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
