# Entry point for the DefComm Shield backend.
# Initializes the FastAPI app and registers all routers.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import simulate

app = FastAPI(title="DefComm Shield Backend")

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
