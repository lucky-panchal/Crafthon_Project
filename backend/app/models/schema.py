# Pydantic models for request/response validation.
# Extend these as new endpoints are added.

from pydantic import BaseModel


class SimulationRequest(BaseModel):
    scenario: str


class SimulationResponse(BaseModel):
    status: str
    result: dict
