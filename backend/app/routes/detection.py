from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.alerts import get_alerts
from app.services.state import get_mode

router = APIRouter()


@router.websocket("/ws/detection")
async def detection_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            attack = resolve_attack()
            data = generate_with_attack()
            mode = get_mode()
            await websocket.send_json({
                "packet_rate": data["packet_rate"],
                "snr": data["snr"],
                "packet_loss": data["packet_loss"],
                "attack": attack,
                "risk": 80 if attack else 0,
                "mode": mode,
                "type": attack.upper() if attack else "NONE",
                "status": "ALERT" if attack else "NORMAL",
                "confidence": 80 if attack else 10,
                "alerts": get_alerts()[:5],
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


@router.post("/detect")
def detect():
    attack = resolve_attack()
    data = generate_with_attack()
    return {
        "packet_rate": data["packet_rate"],
        "snr": data["snr"],
        "packet_loss": data["packet_loss"],
        "attack": attack,
        "risk": 80 if attack else 0,
    }
