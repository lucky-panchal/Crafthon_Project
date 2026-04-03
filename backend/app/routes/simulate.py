# Route handler for simulation endpoints.
# Uses generate_with_attack() for data and resolve_attack() for the attack field.

from fastapi import APIRouter
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


# POST /api/mode/normal — switch simulation to normal mode
@router.post("/mode/normal")
def mode_normal():
    set_mode("normal")
    return {"mode": get_mode()}


# POST /api/mode/jamming — switch simulation to jamming mode
@router.post("/mode/jamming")
def mode_jamming():
    set_mode("jamming")
    return {"mode": get_mode()}


# POST /api/mode/spoofing — switch simulation to spoofing mode
@router.post("/mode/spoofing")
def mode_spoofing():
    set_mode("spoofing")
    return {"mode": get_mode()}
