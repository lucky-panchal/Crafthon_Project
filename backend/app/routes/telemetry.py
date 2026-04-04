"""
telemetry.py

/ws/telemetry      — 1s cadence, ML fields from simulator's detection result
/telemetry/analyze — POST, single-row ML pipeline + state update + alert trigger
"""

import asyncio
import time
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.detection_service import analyze_telemetry
from app.services.state import update_detection_state, get_last_detection
from app.services.alerts import trigger_alert_if_needed

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            attack = resolve_attack()
            data   = generate_with_attack()
            det    = data.get("detection") or {}

            await websocket.send_json({
                # Original fields (unchanged)
                "packet_rate": data["packet_rate"],
                "snr":         data["snr"],
                "packet_loss": data["packet_loss"],
                "attack":      attack,
                "risk":        80 if attack else 0,
                # ML-enriched detection block (additive)
                "detection": {
                    "anomaly":    det.get("anomaly",    False),
                    "type":       det.get("type",       "NORMAL"),
                    "confidence": det.get("confidence", 0.0),
                    "risk":       det.get("risk",       "LOW"),
                    "source":     det.get("source",     "RULE_FALLBACK"),
                    "reason":     det.get("reason",     ""),
                    "score":      det.get("score",      0.0),
                    "timestamp":  det.get("timestamp"),
                },
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


@router.post("/telemetry/analyze")
def analyze(body: dict):
    """
    Single-row ML pipeline.
    Updates global detection state and triggers alerts — same as live WS tick.
    Returns telemetry + full detection object + last_detection snapshot.
    """
    detection = analyze_telemetry(body)

    # Update state so /detection/latest reflects this upload
    update_detection_state(detection)

    # Trigger alert if warranted
    trigger_alert_if_needed(detection)

    logger.debug(
        f"[TELEMETRY/ANALYZE] type={detection['type']} "
        f"risk={detection['risk']} source={detection['source']}"
    )

    return {
        "telemetry":      body,
        "detection":      detection,
        "last_detection": get_last_detection(),
        "timestamp":      time.time(),
    }
