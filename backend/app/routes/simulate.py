from fastapi import APIRouter
from app.models.schema import SimulationRequest, SimulationResponse
from app.services.simulator import run_simulation

router = APIRouter()


@router.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    result = run_simulation(request.scenario)
    return SimulationResponse(status="success", result=result)
