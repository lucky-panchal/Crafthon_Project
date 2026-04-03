# app/services/detection.py
#
# Hybrid detection pipeline:
#   TelemetryPoint → FeatureExtractor → RuleEngine + AnomalyModel → fused result
#
# Fusion strategy
# ---------------
#   Rule engine is the primary signal — it encodes domain knowledge and fires
#   with explicit reasons.  The ML model acts as a corroborating layer:
#
#   1. If rule fires with HIGH risk  → use rule result, attach ML score
#   2. If rule fires with MEDIUM     → use rule result, boost confidence if ML agrees
#   3. If rule is NONE but ML flags  → use ML result as TRAFFIC_ANOMALY
#   4. If both are clean             → NORMAL
#
# The in-memory history deque (maxlen=20) is owned here so both the REST
# endpoint and the WebSocket stream share the same rolling window.

from __future__ import annotations

import time
from collections import deque
from datetime import datetime, timezone
from typing import Deque

from ml.features import FeatureExtractor, TelemetryPoint
from ml.rule_engine import RuleEngine
from ml.model import get_model

# ── Shared stateful objects (module-level singletons) ─────────────────────────

_history:   Deque[dict]    = deque(maxlen=20)
_extractor: FeatureExtractor = FeatureExtractor()
_rules:     RuleEngine       = RuleEngine()


# ── Public API ────────────────────────────────────────────────────────────────

def detect_hybrid(raw: dict) -> dict:
    """
    Run the full hybrid detection pipeline on one raw telemetry frame.

    Parameters
    ----------
    raw : dict  — telemetry frame with keys:
        timestamp, source_id, dest_id, packet_rate, snr, packet_loss

    Returns
    -------
    dict::
        {
            "status":     "NORMAL" | "ALERT",
            "type":       str,
            "confidence": int,       # 0–100
            "risk":       "LOW" | "MEDIUM" | "HIGH",
            "reason":     str,
            "timestamp":  str,       # ISO-8601 UTC
            "ml": {                  # raw ML output, always present
                "is_anomaly":    bool,
                "confidence":    int,
                "anomaly_score": float,
                "risk":          str
            }
        }
    """
    history_list = list(_history)

    # ── 1. Feature extraction ─────────────────────────────────────────────────
    point = TelemetryPoint.from_dict(raw)
    fv    = _extractor.extract_features(point)

    # ── 2. Rule-based detection ───────────────────────────────────────────────
    rule = _rules.detect(raw, history_list)

    # ── 3. ML detection ───────────────────────────────────────────────────────
    ml = get_model().predict_anomaly(fv)

    # ── 4. Append to history after both detectors have run ───────────────────
    _history.append(raw)

    # ── 5. Fusion ─────────────────────────────────────────────────────────────
    result = _fuse(rule.to_dict(), ml)

    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    result["ml"]        = ml
    return result


def get_history() -> list[dict]:
    """Return a snapshot of the current rolling history."""
    return list(_history)


# ── Fusion logic ──────────────────────────────────────────────────────────────

def _fuse(rule: dict, ml: dict) -> dict:
    rule_fired = rule["type"] != "NONE"
    ml_fired   = ml["is_anomaly"]

    # Rule HIGH — authoritative, no override needed
    if rule_fired and rule["risk"] == "HIGH":
        return {
            "status":     "ALERT",
            "type":       rule["type"],
            "confidence": rule["confidence"],
            "risk":       "HIGH",
            "reason":     rule["reason"],
            "source":     "rule",
        }

    # Rule MEDIUM + ML agrees → elevate to HIGH
    if rule_fired and rule["risk"] == "MEDIUM" and ml_fired:
        boosted = min(100, rule["confidence"] + ml["confidence"] // 3)
        return {
            "status":     "ALERT",
            "type":       rule["type"],
            "confidence": boosted,
            "risk":       "HIGH",
            "reason":     rule["reason"] + f" (ML corroborated, score={ml['anomaly_score']:.4f})",
            "source":     "rule+ml",
        }

    # Rule MEDIUM alone — keep as-is
    if rule_fired and rule["risk"] == "MEDIUM":
        return {
            "status":     "ALERT",
            "type":       rule["type"],
            "confidence": rule["confidence"],
            "risk":       "MEDIUM",
            "reason":     rule["reason"],
            "source":     "rule",
        }

    # Rule LOW / NONE but ML flags — surface as generic anomaly
    if ml_fired and ml["risk"] in ("MEDIUM", "HIGH"):
        return {
            "status":     "ALERT",
            "type":       "TRAFFIC_ANOMALY",
            "confidence": ml["confidence"],
            "risk":       ml["risk"],
            "reason":     f"ML model flagged anomaly (score={ml['anomaly_score']:.4f}); no rule matched.",
            "source":     "ml",
        }

    # All clear
    return {
        "status":     "NORMAL",
        "type":       "NONE",
        "confidence": 0,
        "risk":       "LOW",
        "reason":     "All signals within normal parameters.",
        "source":     "none",
    }
