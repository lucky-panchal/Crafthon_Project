from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            attack = resolve_attack()
            data = generate_with_attack()
            await websocket.send_json({
                "packet_rate": data["packet_rate"],
                "snr": data["snr"],
                "packet_loss": data["packet_loss"],
                "attack": attack,
                "risk": 80 if attack else 0,
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
