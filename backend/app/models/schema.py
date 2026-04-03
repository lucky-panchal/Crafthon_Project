# Pydantic models for request/response validation.
# SimulateResponse is the locked contract — frontend depends on this exact shape.

from pydantic import BaseModel
from typing import Optional


class SignalData(BaseModel):
    packet_rate: int
    snr: float
    packet_loss: float
    timestamp: float
    source_id: Optional[int] = None  # injected during spoofing attack


class SimulateResponse(BaseModel):
    data: SignalData
    attack: Optional[str]
    risk: int
