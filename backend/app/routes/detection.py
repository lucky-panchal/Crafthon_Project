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
import logging
import re
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

DATASET_FIELD_ALIASES = {
    "time": {"time", "timestamp", "datetime", "date", "eventtime", "recordedat"},
    "snr": {"snr", "snrdb", "signaltonoiseratio", "signaltonoise", "signalnoise"},
    "packet_loss": {
        "packetloss", "packetlosspct", "packetlosspercent", "losspct",
        "losspercentage", "losspercent", "loss", "pktloss", "droprate",
    },
    "packet_rate": {
        "packetrate", "packetspersecond", "pps", "pktrate", "rate",
        "trafficrate", "throughput", "packets",
    },
    "source_id": {"sourceid", "srcid", "deviceid"},
}


def _normalize_key(value: Any) -> str:
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na", "null", "none", "nan", "undefined", "unknown", "-", "--"}:
        return None

    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        pass

    match = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _find_alias_value(data: Dict[str, Any], aliases: set[str], numeric: bool = True) -> Any:
    for key, value in data.items():
        if _normalize_key(key) not in aliases:
            continue
        if not numeric:
            return value
        parsed = _coerce_float(value)
        if parsed is not None:
            return parsed
    return None


def _generic_numeric_values(data: Dict[str, Any]) -> list[float]:
    values: list[float] = []
    for key, value in data.items():
        normalized = _normalize_key(key)
        if normalized in {"id", "idx", "index", "row", "line", "year"}:
            continue
        parsed = _coerce_float(value)
        if parsed is not None:
            values.append(parsed)
    return values


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

    @field_validator("snr", "packetLoss", "packetRate", mode="before")
    @classmethod
    def _parse_numeric_field(cls, value: Any) -> Optional[float]:
        return _coerce_float(value)


def _normalize_dataset_row(row: DatasetRow) -> tuple[Dict[str, Any], Dict[str, Optional[float]]]:
    raw = row.model_dump(exclude_none=True)
    extras = row.model_extra or {}
    merged: Dict[str, Any] = {**extras, **raw}
    generic_values = _generic_numeric_values(merged)

    snr = row.snr if row.snr is not None else _find_alias_value(merged, DATASET_FIELD_ALIASES["snr"])
    packet_loss = (
        row.packetLoss if row.packetLoss is not None
        else _find_alias_value(merged, DATASET_FIELD_ALIASES["packet_loss"])
    )
    packet_rate = (
        row.packetRate if row.packetRate is not None
        else _find_alias_value(merged, DATASET_FIELD_ALIASES["packet_rate"])
    )
    time_value = row.time if row.time not in (None, "") else _find_alias_value(
        merged, DATASET_FIELD_ALIASES["time"], numeric=False
    )
    source_id = _find_alias_value(merged, DATASET_FIELD_ALIASES["source_id"])

    if snr is None and packet_loss is None and packet_rate is None and generic_values:
        snr = generic_values[0] if len(generic_values) > 0 else None
        packet_loss = generic_values[1] if len(generic_values) > 1 else None
        packet_rate = generic_values[2] if len(generic_values) > 2 else None

    normalized: Dict[str, Any] = {
        **merged,
        "snr": snr if snr is not None else 25.0,
        "packet_loss": packet_loss if packet_loss is not None else 0.0,
        "packet_rate": packet_rate if packet_rate is not None else 0.0,
    }
    if time_value not in (None, ""):
        normalized["time"] = str(time_value)
    if source_id is not None:
        normalized["source_id"] = int(source_id)

    observed = {
        "snr": snr,
        "packet_loss": packet_loss,
        "packet_rate": packet_rate,
    }
    return normalized, observed


def _build_baseline_dataset_row() -> tuple[Dict[str, Any], Dict[str, Optional[float]]]:
    return (
        {
            "time": "T+0",
            "snr": 25.0,
            "packet_loss": 0.0,
            "packet_rate": 0.0,
            "_fallback": True,
        },
        {
            "snr": 25.0,
            "packet_loss": 0.0,
            "packet_rate": 0.0,
        },
    )


class AnalyseRequest(BaseModel):
    rows:     List[DatasetRow]
    filename: Optional[str] = ""
    original_total: Optional[int] = None


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

    normalized_rows: list[tuple[Dict[str, Any], Dict[str, Optional[float]]]] = []
    for row in rows:
        row_dict, observed = _normalize_dataset_row(row)
        if all(value is None for value in observed.values()):
            continue
        normalized_rows.append((row_dict, observed))

    if not normalized_rows:
        normalized_rows.append(_build_baseline_dataset_row())

    # Reset dedup so dataset alerts aren't suppressed by live-stream history
    reset_dedup()

    analyzed_total = len(normalized_rows)
    total = body.original_total or analyzed_total
    anomaly_count = 0
    confidences: list[float] = []
    risk_dist    = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    last_result: Optional[Dict[str, Any]] = None

    # Signal stats accumulators
    snr_vals, loss_vals, rate_vals = [], [], []

    logger.info(
        f"[DATASET] Starting analysis: uploaded={total} analyzed={analyzed_total} file='{body.filename}'"
    )

    for row_dict, observed in normalized_rows:
        # Collect signal stats
        if observed["snr"] is not None:
            snr_vals.append(observed["snr"])
        if observed["packet_loss"] is not None:
            loss_vals.append(observed["packet_loss"])
        if observed["packet_rate"] is not None:
            rate_vals.append(observed["packet_rate"])

        # ── ML inference ──────────────────────────────────────────────────────
        result = analyze_telemetry(row_dict)
        last_result = result

        # ── State update (every row — latest row wins) ────────────────────────
        update_detection_state(result)

        # ── Alert triggering ──────────────────────────────────────────────────
        if result["anomaly"] is True:
            trigger_alert_if_needed(result)
            anomaly_count += 1

        # ── Aggregation ───────────────────────────────────────────────────────
        risk_dist[result["risk"]] += 1
        if result["anomaly"]:
            confidences.append(result["confidence"])

    # ── Compute aggregates ────────────────────────────────────────────────────
    avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.0
    max_conf = round(max(confidences), 2)                    if confidences else 0.0

    high_pct   = risk_dist["HIGH"]   / analyzed_total * 100
    medium_pct = risk_dist["MEDIUM"] / analyzed_total * 100

    if high_pct > 20:
        final_threat = "HIGH"
    elif medium_pct > 30:
        final_threat = "MEDIUM"
    else:
        final_threat = "LOW"

    logger.info(
        f"[DATASET] Done: uploaded={total} analyzed={analyzed_total} anomalies={anomaly_count} "
        f"avg_conf={avg_conf}% max_conf={max_conf}% "
        f"final_threat={final_threat} ml_active={is_model_ready()}"
    )

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
    threats = _build_threats_list([row for row, _ in normalized_rows], risk_dist, final_threat)

    return {
        # ── New aggregated fields ─────────────────────────────────────────────
        "total_rows":        total,
        "analyzed_rows":     analyzed_total,
        "sampled":           total != analyzed_total,
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
            f"Dataset '{body.filename}' analysed — {analyzed_total} of {total} rows, "
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
        if r.get("snr") is not None and r.get("snr") < 15
    )
    spoofing_count = sum(
        1 for r in rows
        if r.get("packet_loss") is not None and r.get("packet_loss") > 20
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
