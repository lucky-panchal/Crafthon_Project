# Route handler for simulation endpoints.
# Flow: frontend polls /simulate, injects attacks via /inject/{type}, reads /alerts.
# Router is mounted twice in main.py — with and without /api prefix.

from fastapi import APIRouter, HTTPException
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.state import set_mode, get_mode
from app.services.alerts import get_alerts

router = APIRouter()


# GET /simulate — returns flat signal fields matching frontend SimulationData interface
@router.get("/simulate")
def simulate():
    attack = resolve_attack()
    risk = 80 if attack else 0
    data = generate_with_attack()
    return {
        "packet_rate": data["packet_rate"],
        "snr": data["snr"],
        "packet_loss": data["packet_loss"],
        "attack": attack,
        "risk": risk,
    }


# POST /mode/{mode} — switches global simulation mode, validates before applying
@router.post("/mode/{new_mode}")
def set_simulation_mode(new_mode: str):
    try:
        set_mode(new_mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"mode": get_mode()}


# POST /inject/jamming|spoofing — frontend-friendly aliases, reuse set_simulation_mode
@router.post("/inject/jamming")
def inject_jamming():
    return set_simulation_mode("jamming")


@router.post("/inject/spoofing")
def inject_spoofing():
    return set_simulation_mode("spoofing")


# GET /alerts — returns plain array matching frontend Alert[] type
@router.get("/alerts")
def alerts():
    return get_alerts()
