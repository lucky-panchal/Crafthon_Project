import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import simulate, telemetry, detection
from app.routes.auth import router as auth_router

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Warming up ML model...")
    from ml.model import get_model
    get_model()
    logger.info("ML model ready.")
    yield


app = FastAPI(title="RAKSHA Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Backend running"}


# Auth — JWT + Google + GitHub OAuth
app.include_router(auth_router)

# Simulation endpoints — mounted with and without /api prefix
app.include_router(simulate.router, prefix="/api")
app.include_router(simulate.router)

# WebSocket telemetry
app.include_router(telemetry.router)

# Detection WebSocket + POST /detect
app.include_router(detection.router)
