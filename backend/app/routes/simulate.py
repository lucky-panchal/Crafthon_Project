# Route handler for simulation endpoints.
# Uses generate_with_attack() for data and resolve_attack() for the attack field.

from fastapi import APIRouter, HTTPException
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.state import set_mode, get_mode
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


# POST /api/mode/{mode} — generic mode switch with validation guard
@router.post("/mode/{new_mode}")
def set_simulation_mode(new_mode: str):
    try:
        set_mode(new_mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"mode": get_mode()}
