# backend/app/config.py
import os
from pydantic_settings import BaseSettings
from pydantic import Field
from dotenv import load_dotenv
# Load .env file variables
load_dotenv()

class Settings(BaseSettings):
    """Loads application settings from environment variables."""
    mongo_connection_string: str = Field(..., alias='MONGO_CONNECTION_STRING')
    database_name: str = Field("familyFeudDB", alias='DATABASE_NAME')

    # --- Added for Celery/Redis ---
    redis_host: str = Field("localhost", alias='REDIS_HOST')
    redis_port: int = Field(6379, alias='REDIS_PORT')
    # Celery broker and backend URLs
    celery_broker_url: str = ""
    celery_backend_url: str = ""

    def __init__(self, **data: dict):
        super().__init__(**data)
        # Construct URLs after validation
        self.celery_broker_url = f"redis://{self.redis_host}:{self.redis_port}/0" # DB 0
        self.celery_backend_url = f"redis://{self.redis_host}:{self.redis_port}/1" # DB 1

    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'

# Create a single instance
settings = Settings()