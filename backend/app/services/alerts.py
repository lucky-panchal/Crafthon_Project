"""
alerts.py
In-memory alert store with ML-confidence-based escalation and dedup.

Dedup:
  Same alert type within DEDUP_WINDOW seconds → escalate existing entry
  Escalation: existing_conf + (new_conf * 0.1), capped at 99

All existing public signatures preserved.
"""

import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

DEDUP_WINDOW   = 5.0
MAX_ALERTS     = 50
CONFIDENCE_CAP = 99.0

alerts: list[dict] = []
_last_seen: dict[str, float] = {}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _find_recent(alert_type: str) -> Optional[int]:
    """Return list index of most recent alert of this type, or None."""
    for i, a in enumerate(reversed(alerts)):
        if a.get("type") == alert_type:
            return len(alerts) - 1 - i
    return None


def _trim():
    if len(alerts) > MAX_ALERTS:
        del alerts[0]


# ── Public API ────────────────────────────────────────────────────────────────

def add_alert(attack_type: str, confidence: int) -> None:
    """Original signature — rule-triggered alert from simulator."""
    now  = time.time()
    last = _last_seen.get(attack_type, 0)

    if now - last < DEDUP_WINDOW:
        idx = _find_recent(attack_type)
        if idx is not None:
            alerts[idx]["confidence"] = min(
                CONFIDENCE_CAP,
                alerts[idx]["confidence"] + float(confidence) * 0.1,
            )
            alerts[idx]["timestamp"] = now
            return

    _last_seen[attack_type] = now
    alerts.append({
        "type":       attack_type,
        "message":    f"{attack_type.capitalize()} attack detected",
        "confidence": float(confidence),
        "risk":       "HIGH",
        "source":     "RULE",
        "reason":     "",
        "timestamp":  now,
    })
    _trim()
    logger.debug(f"[ALERT] New rule alert: type={attack_type} conf={confidence}")


def get_alerts() -> list[dict]:
    """Returns alerts newest-first. Signature unchanged."""
    return list(reversed(alerts))


def trigger_alert_if_needed(detection: dict) -> None:
    """
    Called after every ML inference (live tick or dataset row).
    Fires on HIGH or MEDIUM risk.
    Escalation: existing_conf + (new_conf * 0.1)
    """
    risk       = detection.get("risk", "LOW")
    confidence = float(detection.get("confidence", 0))
    source     = detection.get("source", "RULE_FALLBACK")
    # Use specific type when available (JAMMING/SPOOFING), else ANOMALY
    alert_type = detection.get("type", "ANOMALY")
    if alert_type == "NORMAL":
        return
    if risk not in ("HIGH", "MEDIUM"):
        return

    now  = time.time()
    last = _last_seen.get(alert_type, 0)

    if now - last < DEDUP_WINDOW:
        idx = _find_recent(alert_type)
        if idx is not None:
            alerts[idx]["confidence"] = min(
                CONFIDENCE_CAP,
                alerts[idx]["confidence"] + confidence * 0.1,
            )
            alerts[idx]["timestamp"] = now
            alerts[idx]["risk"]      = risk
            logger.debug(
                f"[ALERT] Escalated: type={alert_type} "
                f"conf={alerts[idx]['confidence']:.1f}%"
            )
            return

    _last_seen[alert_type] = now
    alerts.append({
        "type":       alert_type,
        "message":    f"{'Critical' if risk == 'HIGH' else 'Elevated'} anomaly detected",
        "confidence": confidence,
        "risk":       risk,
        "source":     source,
        "reason":     detection.get("reason", ""),
        "timestamp":  now,
    })
    _trim()
    logger.info(f"[ALERT] Triggered: type={alert_type} risk={risk} conf={confidence:.1f}%")


def reset_dedup() -> None:
    """
    Reset dedup window — call before processing a dataset batch so each
    batch can generate fresh alerts regardless of prior live-stream alerts.
    """
    _last_seen.clear()
