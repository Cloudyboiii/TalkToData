from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"
    MAX_ROWS_PREVIEW: int = 5
    MAX_FILE_SIZE_MB: int = 25

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
