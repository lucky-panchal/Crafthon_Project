# Entry point for the DefComm Shield backend.
# Initializes the FastAPI app and registers all routers.

from fastapi import FastAPI
from app.routes import simulate

app = FastAPI(title="DefComm Shield Backend")


# Health check — confirms the server is up
@app.get("/")
def root():
    return {"message": "Backend running"}


# All simulation-related routes are served under /api
app.include_router(simulate.router, prefix="/api")
