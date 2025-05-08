# backend/app/database.py
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from .config import settings
import logging
import certifi

logger = logging.getLogger(__name__)

class MongoDB:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

db_manager = MongoDB()

async def connect_to_mongo():
    """Establishes connection to the MongoDB database."""
    logger.info("Connecting to MongoDB...")
    try:
        ca_path = certifi.where()
        logger.info(f"Using CA bundle from certifi: {ca_path}")
        db_manager.client = AsyncIOMotorClient(
            settings.mongo_connection_string,
            tlsCAFile=ca_path
        )
        db_manager.db = db_manager.client[settings.database_name]
        await db_manager.client.admin.command('ping')
        logger.info(f"Successfully connected to MongoDB database: {settings.database_name}")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise

async def close_mongo_connection():
    """Closes the MongoDB connection."""
    logger.info("Closing MongoDB connection...")
    if db_manager.client:
        db_manager.client.close()
        logger.info("MongoDB connection closed.")

def get_database() -> AsyncIOMotorDatabase:
    """Returns the database instance."""
    if db_manager.db is None:
        raise Exception("Database not initialized. Call connect_to_mongo first.")
    return db_manager.db

# --- Collection Names ---
SURVEY_COLLECTION = "surveys"
RESPONSE_COLLECTION = "responses" 
GROUPED_RESULTS_COLLECTION = "grouped_results" # <-- Add this line