# backend/app/main.py
from fastapi import FastAPI, status
import logging.config
from contextlib import asynccontextmanager

from .database import connect_to_mongo, close_mongo_connection, get_database
from .routers import surveys # Import the survey router

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Use lifespan context manager for startup/shutdown events (recommended in modern FastAPI)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Code to run on startup
    logger.info("Application startup...")
    await connect_to_mongo()
    yield # The application runs while yielding
    # Code to run on shutdown
    logger.info("Application shutdown...")
    await close_mongo_connection()

# Create the FastAPI application instance with lifespan manager
app = FastAPI(
    title="Family Feud Survey App",
    description="API for managing and analyzing Family Feud style surveys.",
    version="0.1.0",
    lifespan=lifespan # Attach the lifespan context manager
)

# Include the API routers
app.include_router(surveys.router)

# Simple root endpoint for health check / basic info
@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def root():
    """Basic health check endpoint."""
    return {"status": "ok", "message": "Welcome to the Family Feud Survey API!"} #, "database": db_status}
