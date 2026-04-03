from fastapi import APIRouter
from app.services.simulator import generate_data

router = APIRouter()


@router.get("/simulate")
def simulate():
    return {
        "data": generate_data(),
        "attack": None,
        "risk": 0,
    }
