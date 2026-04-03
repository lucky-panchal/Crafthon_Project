# WebSocket telemetry endpoint.
# Streams one JSON frame per second to every connected client.
# Reuses existing simulator + attack_engine so data is consistent
# with what the REST /simulate endpoint returns.

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack

router = APIRouter()

# How often to push a frame (seconds)
PUSH_INTERVAL = 1.0


def _build_frame() -> str:
    """Generate one telemetry frame and serialise to JSON string."""
    data = generate_with_attack()
    attack = resolve_attack()
    risk = 80 if attack else 0

    frame = {
        "time": datetime.now().strftime("%H:%M:%S"),
        "packetRate": data["packet_rate"],
        "snr": round(data["snr"], 2),
        "packetLoss": round(data["packet_loss"] * 100, 2),  # send as %
        "attack": attack,
        "risk": risk,
    }
    return json.dumps(frame)


@router.websocket("/ws/telemetry")
async def telemetry(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = _build_frame()
            await websocket.send_text(payload)
            await asyncio.sleep(PUSH_INTERVAL)
    except WebSocketDisconnect:
        # Client closed the connection — nothing to clean up
        pass
    except Exception:
        # Any other send error — close gracefully
        await websocket.close()
