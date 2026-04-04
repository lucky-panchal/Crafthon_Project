"""
detection.py

Routes:
  /ws/detection      — 1s cadence, ML-enriched frame
  /detection/latest  — GET, full ML snapshot
  /analyse           — POST, dataset batch: JSON rows (frontend) OR file upload (CSV/XLSX)
  /detect            — POST, single snapshot (unchanged)
  /test/ml           — GET, ML health check (unchanged)

All existing field names preserved. New fields are additive only.
"""

import asyncio
import io
import logging
import time

from fastapi import APIRouter, File, UploadFile, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Optional

from app.services.simulator import generate_with_attack
from app.services.attack_engine import resolve_attack
from app.services.alerts import get_alerts, trigger_alert_if_needed, reset_dedup
from app.services.state import (
    get_mode, get_last_detection, get_system_status, update_detection_state,
)
from app.services.detection_service import analyze_telemetry
from ml.model import predict_anomaly, is_model_ready

logger = logging.getLogger(__name__)
router = APIRouter()


# ── /ws/detection ─────────────────────────────────────────────────────────────

@router.websocket("/ws/detection")
async def detection_ws(websocket: WebSocket):
    """
    1-second cadence. ML result pulled from generate_with_attack() —
    zero extra inference latency on the WS tick.
    """
    await websocket.accept()
    try:
        while True:
            attack = resolve_attack()
            data   = generate_with_attack()
            mode   = get_mode()
            det    = data.get("detection") or {}

            await websocket.send_json({
                # Original fields
                "packet_rate": data["packet_rate"],
                "snr":         data["snr"],
                "packet_loss": data["packet_loss"],
                "attack":      attack,
                "risk":        80 if attack else 0,
                "mode":        mode,
                "type":        det.get("type", attack.upper() if attack else "NONE"),
                "status":      "ALERT" if det.get("anomaly") else "NORMAL",
                "confidence":  det.get("confidence", 80 if attack else 10),
                "alerts":      get_alerts()[:5],
                # ML-enriched additions
                "anomaly":     det.get("anomaly",  False),
                "source":      det.get("source",   "RULE_FALLBACK"),
                "reason":      det.get("reason",   ""),
                "score":       det.get("score",    0.0),
                "ml_risk":     det.get("risk",     "LOW"),
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


# ── /detection/latest ─────────────────────────────────────────────────────────

@router.get("/detection/latest")
def latest_detection():
    det = get_last_detection()
    return {
        # Original keys
        "detection":     det,
        "risk_level":    det.get("risk",       "LOW"),
        "system_status": get_system_status(),
        "mode":          get_mode(),
        # ML additions
        "anomaly":       det.get("anomaly",    False),
        "confidence":    det.get("confidence", 0.0),
        "source":        det.get("source",     "RULE_FALLBACK"),
        "timestamp":     det.get("timestamp"),
        "updated_at":    det.get("updated_at"),
    }


# ── /analyse — dataset batch ──────────────────────────────────────────────────

class DatasetRow(BaseModel):
    time:       Optional[str]   = None
    snr:        Optional[float] = None
    packetLoss: Optional[float] = None
    packetRate: Optional[float] = None

    # Accept any extra columns without error
    model_config = {"extra": "allow"}


class AnalyseRequest(BaseModel):
    rows:     List[DatasetRow]
    filename: Optional[str] = ""


@router.post("/analyse")
def analyse_dataset(body: AnalyseRequest):
    """
    Per-row ML pipeline:
      1. Normalize row → snake_case dict
      2. analyze_telemetry(row)  — rule + ML
      3. update_detection_state(result)
      4. trigger_alert_if_needed(result)
      5. Aggregate → risk_distribution, final_threat, avg/max confidence
    """
    rows = body.rows
    if not rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    # Reset dedup so dataset alerts aren't suppressed by live-stream history
    reset_dedup()

    total        = len(rows)
    anomaly_count = 0
    confidences: list[float] = []
    risk_dist    = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    last_result: Optional[Dict[str, Any]] = None

    # Signal stats accumulators
    snr_vals, loss_vals, rate_vals = [], [], []

    logger.info(f"[DATASET] Starting analysis: {total} rows, file='{body.filename}'")
    print(f"[DATASET] Starting analysis: {total} rows, file='{body.filename}'")

    for i, r in enumerate(rows):
        # Normalize to snake_case — handles both camelCase upload and snake_case
        row_dict: Dict[str, Any] = {
            "snr":         r.snr        if r.snr        is not None else 0.0,
            "packet_loss": r.packetLoss if r.packetLoss is not None else 0.0,
            "packet_rate": r.packetRate if r.packetRate is not None else 0.0,
        }
        # Carry through any extra fields (source_id, etc.)
        for k, v in (r.model_extra or {}).items():
            row_dict.setdefault(k, v)

        # Collect signal stats
        if r.snr        is not None: snr_vals.append(r.snr)
        if r.packetLoss is not None: loss_vals.append(r.packetLoss)
        if r.packetRate is not None: rate_vals.append(r.packetRate)

        # ── ML inference ──────────────────────────────────────────────────────
        result = analyze_telemetry(row_dict)
        last_result = result
        print(f"[ROW {i}] snr={row_dict['snr']} loss={row_dict['packet_loss']} rate={row_dict['packet_rate']} → anomaly={result['anomaly']} conf={result['confidence']} risk={result['risk']}")

        # ── State update (every row — latest row wins) ────────────────────────
        update_detection_state(result)

        # ── Alert triggering ──────────────────────────────────────────────────
        if result["anomaly"] is True:
            trigger_alert_if_needed(result)
            anomaly_count += 1
            print(f"[ALERT] Triggered for row {i}: type={result['type']} risk={result['risk']}")

        # ── Aggregation ───────────────────────────────────────────────────────
        risk_dist[result["risk"]] += 1
        if result["anomaly"]:
            confidences.append(result["confidence"])

    # ── Compute aggregates ────────────────────────────────────────────────────
    avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.0
    max_conf = round(max(confidences), 2)                    if confidences else 0.0

    high_pct   = risk_dist["HIGH"]   / total * 100
    medium_pct = risk_dist["MEDIUM"] / total * 100

    if high_pct > 20:
        final_threat = "HIGH"
    elif medium_pct > 30:
        final_threat = "MEDIUM"
    else:
        final_threat = "LOW"

    logger.info(
        f"[DATASET] Done: rows={total} anomalies={anomaly_count} "
        f"avg_conf={avg_conf}% max_conf={max_conf}% "
        f"final_threat={final_threat} ml_active={is_model_ready()}"
    )
    print(f"[SUMMARY] anomalies={anomaly_count} avg_conf={avg_conf} max_conf={max_conf} final_threat={final_threat} ml_active={is_model_ready()}")

    def _stats(vals):
        if not vals:
            return {"min": None, "max": None, "avg": None, "count": 0}
        return {
            "min":   round(min(vals), 2),
            "max":   round(max(vals), 2),
            "avg":   round(sum(vals) / len(vals), 2),
            "count": len(vals),
        }

    # Build legacy threats list for backward compat with frontend
    threats = _build_threats_list(rows, risk_dist, final_threat)

    return {
        # ── New aggregated fields ─────────────────────────────────────────────
        "total_rows":        total,
        "anomalies":         anomaly_count,
        "avg_confidence":    avg_conf,
        "max_confidence":    max_conf,
        "risk_distribution": risk_dist,
        "final_threat":      final_threat,
        "ml_active":         is_model_ready(),
        # ── Legacy fields (frontend backward compat) ──────────────────────────
        "status":            200,
        "filename":          body.filename,
        "overall_risk":      final_threat,
        "threats":           threats,
        "last_detection":    last_result,
        "stats": {
            "snr":        _stats(snr_vals),
            "packetLoss": _stats(loss_vals),
            "packetRate": _stats(rate_vals),
        },
        "summary": (
            f"Dataset '{body.filename}' analysed — {total} rows, "
            f"{anomaly_count} anomalies detected. "
            f"Threat level: {final_threat}."
        ),
    }


def _build_threats_list(rows, risk_dist: dict, final_threat: str) -> list:
    """
    Build the legacy threats[] array the frontend DatasetUploader expects.
    Derives threat types from signal values in the rows.
    """
    jamming_count  = sum(
        1 for r in rows
        if r.snr is not None and r.snr < 15
    )
    spoofing_count = sum(
        1 for r in rows
        if r.packetLoss is not None and r.packetLoss > 20
    )
    threats = []
    if jamming_count:
        threats.append({
            "type":       "JAMMING",
            "risk":       "HIGH",
            "count":      jamming_count,
            "confidence": min(99, 70 + jamming_count),
            "reason":     f"SNR < 15 dB in {jamming_count} rows.",
        })
    if spoofing_count:
        threats.append({
            "type":       "SPOOFING",
            "risk":       "HIGH",
            "count":      spoofing_count,
            "confidence": min(99, 65 + spoofing_count),
            "reason":     f"Packet loss > 20% in {spoofing_count} rows.",
        })
    return threats


# ── /detect (unchanged) ───────────────────────────────────────────────────────

@router.post("/detect")
def detect():
    attack = resolve_attack()
    data   = generate_with_attack()
    return {
        "packet_rate": data["packet_rate"],
        "snr":         data["snr"],
        "packet_loss": data["packet_loss"],
        "attack":      attack,
        "risk":        80 if attack else 0,
    }


# ── /test/ml (unchanged) ──────────────────────────────────────────────────────

@router.get("/test/ml")
def test_ml():
    sample    = [0.0] * 77
    sample[0] = 75.0
    sample[1] = 25.0
    sample[2] = 0.02
    try:
        prediction = predict_anomaly(sample)
        return {"status": "ML working", "sample_prediction": prediction}
    except Exception as e:
        return {"status": "ML unavailable", "error": str(e)}
