import os
from pydantic_settings import BaseSettings
from pydantic import Field # Import Field if needed for specific field configs, though not used here yet
from dotenv import load_dotenv

# Load .env file variables
load_dotenv()

class Settings(BaseSettings):
    """Loads application settings from environment variables."""
    mongo_connection_string: str = Field(..., alias='MONGO_CONNECTION_STRING')
    database_name: str = Field("familyFeudDB", alias='DATABASE_NAME')

    class Config:
        # Tells pydantic-settings to load from a .env file
        env_file = '.env'
        env_file_encoding = 'utf-8'

# Create a single instance to be imported elsewhere
settings = Settings()

