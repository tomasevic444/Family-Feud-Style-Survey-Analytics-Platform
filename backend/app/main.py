# backend/app/main.py
from fastapi import FastAPI, status
import logging.config
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from .database import connect_to_mongo, close_mongo_connection
from .routers import surveys
from .routers import responses

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup...")
    await connect_to_mongo()
    yield
    logger.info("Application shutdown...")
    await close_mongo_connection()

app = FastAPI(
    title="Family Feud Survey App",
    description="API for managing and analyzing Family Feud style surveys.",
    version="0.1.0",
    lifespan=lifespan
)


origins = [
    "http://localhost:5173",
    "http://localhost:5174", 
    "http://localhost:3000", 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"], 
)

app.include_router(surveys.router)
app.include_router(responses.router)

@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def root():
    return {"status": "ok", "message": "Welcome to the Family Feud Survey API!"}