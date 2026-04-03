from fastapi import APIRouter

router = APIRouter()


@router.get("/simulate")
def simulate():
    return {
        "packet_rate": 80,
        "snr": 25,
        "packet_loss": 0.02,
        "attack": None,
        "risk": 10,
    }
