from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncio
from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.alerts import get_alerts
from app.services.state import get_mode

router = APIRouter()


# ── Dataset analysis ──────────────────────────────────────────────────────────

class DatasetRow(BaseModel):
    time:        Optional[str]   = None
    snr:         Optional[float] = None
    packetLoss:  Optional[float] = None
    packetRate:  Optional[float] = None

class AnalyseRequest(BaseModel):
    rows:     List[DatasetRow]
    filename: Optional[str] = ""

@router.post("/analyse")
def analyse_dataset(body: AnalyseRequest):
    rows = body.rows
    if not rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    snr_vals  = [r.snr         for r in rows if r.snr         is not None]
    loss_vals = [r.packetLoss  for r in rows if r.packetLoss  is not None]
    rate_vals = [r.packetRate  for r in rows if r.packetRate  is not None]

    def stats(vals):
        if not vals: return {"min": None, "max": None, "avg": None, "count": 0}
        return {
            "min":   round(min(vals), 2),
            "max":   round(max(vals), 2),
            "avg":   round(sum(vals) / len(vals), 2),
            "count": len(vals),
        }

    snr_stats  = stats(snr_vals)
    loss_stats = stats(loss_vals)
    rate_stats = stats(rate_vals)

    # Threat detection on dataset
    jamming_rows  = [r for r in rows if r.snr is not None and r.snr < 15]
    spoofing_rows = [r for r in rows if r.packetLoss is not None and r.packetLoss > 20]

    threats = []
    if jamming_rows:
        threats.append({
            "type":       "JAMMING",
            "risk":       "HIGH",
            "count":      len(jamming_rows),
            "confidence": min(99, 70 + len(jamming_rows)),
            "reason":     f"SNR dropped below 15 dB in {len(jamming_rows)} rows — RF jamming pattern detected.",
        })
    if spoofing_rows:
        threats.append({
            "type":       "SPOOFING",
            "risk":       "HIGH",
            "count":      len(spoofing_rows),
            "confidence": min(99, 65 + len(spoofing_rows)),
            "reason":     f"Packet loss exceeded 20% in {len(spoofing_rows)} rows — spoofing/injection pattern detected.",
        })

    overall_risk = "HIGH" if threats else ("MEDIUM" if (snr_stats["avg"] or 99) < 20 else "LOW")

    return {
        "status":       200,
        "filename":     body.filename,
        "total_rows":   len(rows),
        "overall_risk": overall_risk,
        "threats":      threats,
        "stats": {
            "snr":        snr_stats,
            "packetLoss": loss_stats,
            "packetRate": rate_stats,
        },
        "summary": (
            f"Dataset '{body.filename}' analysed — {len(rows)} rows. "
            f"{'Threats detected: ' + ', '.join(t['type'] for t in threats) + '.' if threats else 'No threats detected — signal appears clean.'}"
        ),
    }


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
