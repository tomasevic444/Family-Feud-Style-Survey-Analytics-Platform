# backend/app/main.py
from fastapi import FastAPI, status
import logging.config
from contextlib import asynccontextmanager

# --- Add this import ---
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

# --- Add CORS Middleware ---
# List of origins allowed to make requests (React dev server default port)
origins = [
    "http://localhost:5173", # Default Vite port
    "http://localhost:5174", # Common alternative Vite port
    "http://localhost:3000", # Default Create React App port (just in case)
    # Add your deployed frontend URL here later if needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Allows specified origins
    allow_credentials=True, # Allows cookies (if you use auth later)
    allow_methods=["*"], # Allows all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Allows all headers
)
# --- End CORS Middleware ---


app.include_router(surveys.router)
app.include_router(responses.router)

@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def root():
    return {"status": "ok", "message": "Welcome to the Family Feud Survey API!"}