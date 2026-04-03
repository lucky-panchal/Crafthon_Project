# app/routes/detection.py

from __future__ import annotations

import asyncio
import json
import random
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.detection import detect_hybrid
from app.services.state import set_mode

router = APIRouter()

# ── Active demo mode ──────────────────────────────────────────────────────────
# "auto"     — weighted random mix (default)
# "jamming"  — every frame is a jamming scenario
# "spoofing" — every frame is a spoofing scenario
# "normal"   — every frame is clean traffic

_detection_mode: str = "auto"
_ALLOWED_MODES = {"auto", "jamming", "spoofing", "normal"}

# ── REST input schema ─────────────────────────────────────────────────────────

class TelemetryInput(BaseModel):
    timestamp:   float = Field(default_factory=time.time)
    source_id:   str   = Field(default="node-1")
    dest_id:     str   = Field(default="node-2")
    packet_rate: float = Field(..., ge=0)
    snr:         float = Field(..., ge=0)
    packet_loss: float = Field(..., ge=0, le=1)


# ── Mode control endpoints ────────────────────────────────────────────────────

class ModeBody(BaseModel):
    mode: str


@router.post("/set-mode")
def set_mode_body(body: ModeBody):
    """
    Switch simulation mode via JSON body.
    Accepts: { "mode": "NORMAL" | "JAMMING" | "SPOOFING" | "normal" | ... }
    Normalises to lowercase internally.
    """
    return set_detection_mode(body.mode.lower())


@router.post("/mode/{mode}")
def set_detection_mode(mode: str):
    """
    Switch the WebSocket detection stream scenario.

    Modes
    -----
    auto     — weighted random mix (default)
    jamming  — force every frame to be a jamming scenario
    spoofing — force every frame to be a spoofing scenario
    normal   — force every frame to be clean traffic
    """
    global _detection_mode
    if mode not in _ALLOWED_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode '{mode}'. Allowed: {sorted(_ALLOWED_MODES)}",
        )
    _detection_mode = mode
    # Sync simulator state so /simulate and /ws/telemetry stay consistent
    sim_mode = mode if mode in {"normal", "jamming", "spoofing"} else "normal"
    try:
        set_mode(sim_mode)
    except ValueError:
        pass
    return {"mode": _detection_mode}


@router.get("/mode")
def get_detection_mode():
    return {"mode": _detection_mode}


# ── REST detect endpoint ──────────────────────────────────────────────────────

@router.post("/detect")
def detect(payload: TelemetryInput) -> dict:
    try:
        return detect_hybrid(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── WebSocket scenario generator ──────────────────────────────────────────────

_SPOOF_DESTS = ["node-A", "node-B", "node-C", "node-D", "node-E"]
_spoof_dest_idx = 0


def _next_frame() -> dict:
    global _spoof_dest_idx

    # Forced mode overrides random selection
    if _detection_mode == "jamming":
        scenario = "snr_drop"
    elif _detection_mode == "spoofing":
        scenario = "spoofing"
    elif _detection_mode == "normal":
        scenario = "normal"
    else:  # auto
        scenario = random.choices(
            ["normal", "snr_drop", "spoofing", "spike"],
            weights=[70, 15, 10, 5],
        )[0]

    base = {
        "timestamp":   time.time(),
        "source_id":   "node-1",
        "dest_id":     "node-2",
        "packet_rate": round(random.uniform(100, 200), 1),
        "snr":         round(random.uniform(22, 32), 2),
        "packet_loss": round(random.uniform(0.0, 0.05), 4),
    }

    if scenario == "snr_drop":
        base["snr"]         = round(random.uniform(4, 13), 2)
        base["packet_loss"] = round(random.uniform(0.35, 0.65), 4)
    elif scenario == "spoofing":
        base["source_id"] = "999"
        base["dest_id"]   = _SPOOF_DESTS[_spoof_dest_idx % len(_SPOOF_DESTS)]
        _spoof_dest_idx  += 1
    elif scenario == "spike":
        base["packet_rate"] = round(random.uniform(350, 500), 1)

    return base


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/detection")
async def ws_detection(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            frame  = _next_frame()
            result = detect_hybrid(frame)
            result["telemetry"] = {
                "packet_rate": frame["packet_rate"],
                "snr":         frame["snr"],
                "packet_loss": round(frame["packet_loss"] * 100, 2),
                "source_id":   frame["source_id"],
                "dest_id":     frame["dest_id"],
            }
            result["mode"] = _detection_mode
            await websocket.send_text(json.dumps(result))
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()
