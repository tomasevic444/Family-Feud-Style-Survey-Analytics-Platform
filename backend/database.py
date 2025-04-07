# backend/app/database.py
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from .config import settings
import logging

logger = logging.getLogger(__name__)

class MongoDB:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

db_manager = MongoDB()

async def connect_to_mongo():
    """Establishes connection to the MongoDB database."""
    logger.info("Connecting to MongoDB...")
    try:
        db_manager.client = AsyncIOMotorClient(settings.mongo_connection_string)
        db_manager.db = db_manager.client[settings.database_name]
        # Ping the server to verify connection
        await db_manager.client.admin.command('ping')
        logger.info(f"Successfully connected to MongoDB database: {settings.database_name}")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise # Reraise the exception to prevent app startup if connection fails

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

# Collection names 
SURVEY_COLLECTION = "surveys"