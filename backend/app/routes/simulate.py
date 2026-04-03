# Route handler for simulation endpoints.
# Calls the simulator service and returns live signal data.

from fastapi import APIRouter
from app.services.simulator import generate_data

router = APIRouter()


# GET /api/simulate — returns a fresh snapshot of simulated signal metrics
@router.get("/simulate")
def simulate():
    return {
        "data": generate_data(),
        "attack": None,
        "risk": 0,
    }
