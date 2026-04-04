# Global simulation state.
# Controls what mode the backend is currently simulating.

import time
import logging

logger = logging.getLogger(__name__)

ALLOWED_MODES = {"normal", "jamming", "spoofing"}
FEATURES      = ["packet_rate", "snr", "packet_loss"]

mode = "normal"

# Full canonical detection snapshot — always has every field
_last_detection: dict = {
    "anomaly":    False,
    "type":       "NORMAL",
    "confidence": 0.0,
    "risk":       "LOW",
    "source":     "RULE_FALLBACK",
    "reason":     "",
    "score":      0.0,
    "timestamp":  None,
    "updated_at": None,
}
_system_status: str = "NORMAL"   # NORMAL | CRITICAL


def set_mode(new_mode: str) -> None:
    global mode
    if new_mode not in ALLOWED_MODES:
        raise ValueError(f"Invalid mode '{new_mode}'. Allowed: {ALLOWED_MODES}")
    mode = new_mode
    logger.info(f"[STATE] Mode changed to: {mode}")


def get_mode() -> str:
    return mode


def update_detection_state(detection: dict) -> None:
    """
    Store the canonical detection object.
    Fills any missing field with a safe default so callers always get
    a complete snapshot from get_last_detection().
    """
    global _last_detection, _system_status

    now = time.time()
    _last_detection = {
        "anomaly":    bool(detection.get("anomaly",    detection.get("type") == "ANOMALY")),
        "type":       detection.get("type",       "NORMAL"),
        "confidence": float(detection.get("confidence", 0.0)),
        "risk":       detection.get("risk",       "LOW"),
        "source":     detection.get("source",     "RULE_FALLBACK"),
        "reason":     detection.get("reason",     ""),
        "score":      float(detection.get("score",      0.0)),
        "timestamp":  detection.get("timestamp",  now),
        "updated_at": now,
    }
    _system_status = "CRITICAL" if _last_detection["risk"] == "HIGH" else "NORMAL"
    logger.debug(
        f"[STATE] Updated detection: type={_last_detection['type']} "
        f"risk={_last_detection['risk']} source={_last_detection['source']} "
        f"conf={_last_detection['confidence']:.1f}%"
    )


def get_last_detection() -> dict:
    return _last_detection


def get_system_status() -> str:
    return _system_status
