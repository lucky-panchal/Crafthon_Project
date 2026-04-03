# Entry point for the DefComm Shield backend.
# Initializes the FastAPI app and registers all routers.

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import simulate, telemetry, detection

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: warm up the ML model before the first request hits ──────────
    # get_model() loads from disk if isolation_forest.joblib exists,
    # otherwise trains from scratch (~1 s).  Either way the model is
    # cached in-process so every subsequent call is instant.
    logger.info("Warming up ML model...")
    from ml.model import get_model
    get_model()
    logger.info("ML model ready.")
    yield
    # ── Shutdown (nothing to clean up) ───────────────────────────────────────


app = FastAPI(title="DefComm Shield Backend", lifespan=lifespan)

# Allow all origins during hackathon — tighten after demo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check — confirms the server is up
@app.get("/")
def root():
    return {"message": "Backend running"}


# Mounted twice — with and without /api prefix, same handlers, no duplication
app.include_router(simulate.router, prefix="/api")
app.include_router(simulate.router)

# WebSocket telemetry — no prefix, path is /ws/telemetry
app.include_router(telemetry.router)

# Hybrid detection — POST /detect  +  WebSocket /ws/detection
app.include_router(detection.router)
