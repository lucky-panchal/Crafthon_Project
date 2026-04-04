"""
detection_service.py

Two-stage detection pipeline:
  Stage 1 — Rule-based  : fast, deterministic, always runs
  Stage 2 — ML          : Isolation Forest, runs only when model is ready

Canonical detection object (every return from analyze_telemetry):
  {
    "anomaly":    bool,
    "type":       "NORMAL" | "ANOMALY",
    "confidence": float (0-100),
    "risk":       "LOW" | "MEDIUM" | "HIGH",
    "source":     "RULE" | "ML" | "HYBRID" | "RULE_FALLBACK",
    "reason":     str,
    "score":      float,
    "timestamp":  float  (unix epoch)
  }
"""

import logging
import math
import time
from typing import Any, Dict

from ml.model import predict_anomaly, is_model_ready

logger = logging.getLogger(__name__)

MODEL_INPUT_SIZE = 77  # must match training

# Ordered feature keys — supports both snake_case (live telemetry)
# and camelCase (dataset upload rows).  Each entry is a tuple of aliases;
# first match wins.  Missing → 0.0.
FEATURE_ALIASES = [
    ("packet_rate", "packetRate", "rate"),
    ("snr",),
    ("packet_loss", "packetLoss"),
    # slots 3-76 padded with 0.0 — extend as dataset grows
]


# ── Feature extraction ────────────────────────────────────────────────────────

def _safe_float(v: Any) -> float:
    """Convert to float, replace NaN/Inf/None with 0.0."""
    try:
        f = float(v)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return 0.0


def build_feature_vector(row: Dict[str, Any]) -> list:
    """
    Extract a fixed-length (MODEL_INPUT_SIZE) feature vector from any row dict.
    Handles snake_case, camelCase, and missing keys safely.
    No NaN or Inf values — all replaced with 0.0.
    """
    vector: list[float] = []
    for aliases in FEATURE_ALIASES:
        val = 0.0
        for key in aliases:
            if key in row:
                val = _safe_float(row[key])
                break
        vector.append(val)

    # Pad remaining slots to MODEL_INPUT_SIZE
    if len(vector) < MODEL_INPUT_SIZE:
        vector += [0.0] * (MODEL_INPUT_SIZE - len(vector))

    return vector[:MODEL_INPUT_SIZE]


# ── Risk / reason helpers ─────────────────────────────────────────────────────

def risk_level(confidence: float) -> str:
    """Single source of truth for risk thresholds."""
    if confidence > 80:
        return "HIGH"
    if confidence >= 50:
        return "MEDIUM"
    return "LOW"


def _resolve_keys(row: Dict[str, Any]) -> tuple:
    """Return (snr, packet_loss, packet_rate, source_id) handling both key styles."""
    snr  = _safe_float(row.get("snr",         row.get("snr",         99)))
    loss = _safe_float(row.get("packet_loss",  row.get("packetLoss",  0)))
    rate = _safe_float(row.get("packet_rate",  row.get("packetRate",  0)))
    sid  = row.get("source_id")
    return snr, loss, rate, sid


def _build_reason(row: Dict[str, Any], anomaly: bool, source: str) -> str:
    if not anomaly:
        return "Signal within normal parameters."

    snr, loss, rate, sid = _resolve_keys(row)
    loss_pct = loss if loss > 1.0 else loss * 100
    parts = []
    if snr < 15:
        parts.append(f"SNR critically low ({snr} dB)")
    if loss_pct > 5:
        parts.append(f"packet loss elevated ({round(loss_pct, 1)}%)")
    if rate > 120:
        parts.append(f"packet rate spike ({rate} pps)")
    if sid == 999:
        parts.append("source_id 999 (known spoofed identifier)")

    suffix = {
        "RULE":          " (rule-based).",
        "ML":            " (ML detected).",
        "HYBRID":        " (rule + ML confirmed).",
        "RULE_FALLBACK": " (rule-based, ML unavailable).",
    }.get(source, ".")

    base = ", ".join(parts)
    return (base + suffix) if parts else f"Anomaly detected ({source})."


# ── Stage 1: Rule-based ───────────────────────────────────────────────────────

def _rule_based(row: Dict[str, Any]) -> Dict[str, Any]:
    snr, loss, rate, sid = _resolve_keys(row)

    # packet_loss arrives as percentage (0-100) from frontend dataset
    # and as fraction (0.0-0.05) from simulator — normalise to percentage
    loss_pct = loss if loss > 1.0 else loss * 100

    if snr < 15 and loss_pct > 5:
        return {"anomaly": True, "confidence": 92.0, "rule": "JAMMING"}
    if sid == 999:
        return {"anomaly": True, "confidence": 89.0, "rule": "SPOOFING"}
    if snr < 15:
        return {"anomaly": True, "confidence": 70.0, "rule": "LOW_SNR"}
    if loss_pct > 20:
        return {"anomaly": True, "confidence": 75.0, "rule": "HIGH_LOSS"}
    if rate > 120:
        return {"anomaly": True, "confidence": 65.0, "rule": "TRAFFIC_SPIKE"}

    return {"anomaly": False, "confidence": 0.0, "rule": None}


# ── Main pipeline ─────────────────────────────────────────────────────────────

def analyze_telemetry(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Two-stage detection pipeline.
    Always returns the full canonical detection object including timestamp.
    Safe to call from WebSocket tick, dataset batch, and HTTP endpoints.
    """
    print(f"[ML PIPELINE] Running analyze_telemetry | keys={list(row.keys())} | snr={row.get('snr')} loss={row.get('packet_loss')} rate={row.get('packet_rate')}")
    t0 = time.perf_counter()

    # Stage 1
    rule_result = _rule_based(row)
    rule_hit    = rule_result["anomaly"]

    # Stage 2
    ml_hit   = False
    ml_conf  = 0.0
    ml_score = 0.0

    if is_model_ready():
        features = build_feature_vector(row)
        if sum(features) == 0:
            print("[WARNING] Feature vector is all zeros — check key mapping")
        ml_out   = predict_anomaly(features)
        ml_hit   = ml_out["anomaly"]
        ml_conf  = ml_out["confidence"]
        ml_score = ml_out["score"]
        print(f"[ML] model prediction: anomaly={ml_hit} confidence={ml_conf:.1f}% score={ml_score:.4f}")
    else:
        print("[ML] Model not ready — running RULE_FALLBACK")

    # Merge
    if not is_model_ready():
        anomaly    = rule_hit
        confidence = rule_result["confidence"] if rule_hit else 0.0
        source     = "RULE_FALLBACK"

    elif rule_hit and ml_hit:
        confidence = min(99.0, max(rule_result["confidence"], ml_conf) + 5.0)
        anomaly    = True
        source     = "HYBRID"

    elif rule_hit and not ml_hit:
        confidence = rule_result["confidence"] * 0.85
        anomaly    = True
        source     = "RULE"

    elif not rule_hit and ml_hit:
        confidence = ml_conf
        anomaly    = True
        source     = "ML"

    else:
        anomaly    = False
        confidence = 0.0
        source     = "ML" if is_model_ready() else "RULE_FALLBACK"

    risk   = risk_level(confidence) if anomaly else "LOW"
    reason = _build_reason(row, anomaly, source)

    elapsed = (time.perf_counter() - t0) * 1000
    print(f"[Detection] source={source} anomaly={anomaly} conf={confidence:.1f}% risk={risk} t={elapsed:.2f}ms")

    return {
        "anomaly":    anomaly,
        "type":       "ANOMALY" if anomaly else "NORMAL",
        "confidence": round(confidence, 2),
        "risk":       risk,
        "source":     source,
        "reason":     reason,
        "score":      round(ml_score, 6),
        "timestamp":  time.time(),
    }
