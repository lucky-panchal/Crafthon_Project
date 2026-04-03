# Route handler for simulation endpoints.
# Combines base signal data + attack resolution into a standardized response.

from fastapi import APIRouter
from app.services.simulator import generate_data
from app.services.attack_engine import resolve_attack
from app.models.schema import SimulateResponse

router = APIRouter()


# GET /api/simulate — returns live signal snapshot with attack and risk fields
@router.get("/simulate", response_model=SimulateResponse)
def simulate():
    return SimulateResponse(
        data=generate_data(),
        attack=resolve_attack(),
        risk=0,
    )
