# Route handler for simulation endpoints.
# Uses generate_with_attack() for data and resolve_attack() for the attack field.

from fastapi import APIRouter
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.models.schema import SimulateResponse

router = APIRouter()


# GET /api/simulate — returns attacked signal data with attack label and risk score
@router.get("/simulate", response_model=SimulateResponse)
def simulate():
    return SimulateResponse(
        data=generate_with_attack(),
        attack=resolve_attack(),
        risk=0,
    )
