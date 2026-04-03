from pydantic import BaseModel


class SimulationRequest(BaseModel):
    scenario: str


class SimulationResponse(BaseModel):
    status: str
    result: dict
