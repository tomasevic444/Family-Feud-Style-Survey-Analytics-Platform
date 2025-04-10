# backend/app/main.py
from fastapi import FastAPI, status
import logging.config
from contextlib import asynccontextmanager

from .database import connect_to_mongo, close_mongo_connection
# --- Import routers ---
from .routers import surveys
from .routers import responses 

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup...")
    await connect_to_mongo()
    yield
    logger.info("Application shutdown...")
    await close_mongo_connection()

# Create the FastAPI application instance
app = FastAPI(
    title="Family Feud Survey App",
    description="API for managing and analyzing Family Feud style surveys.",
    version="0.1.0",
    lifespan=lifespan
)

# --- Include the API routers ---
app.include_router(surveys.router)
app.include_router(responses.router) 

# Simple root endpoint
@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def root():
    return {"status": "ok", "message": "Welcome to the Family Feud Survey API!"}

