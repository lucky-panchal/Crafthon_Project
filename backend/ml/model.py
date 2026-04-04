"""
ml/model.py
Singleton loader for Isolation Forest + StandardScaler.

Guarantees:
- Load attempted exactly once (lazy, on first call to get_model())
- Never crashes the server if pkl files are missing
- predict_anomaly() always returns a valid dict
- Inference logged with timing
"""

import os
import time
import logging
import threading
from typing import Tuple, Optional, List

import numpy as np

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
_DIR         = os.path.dirname(__file__)
MODEL_PATH   = os.path.join(_DIR, "isolation_forest_model.pkl")
SCALER_PATH  = os.path.join(_DIR, "scaler.pkl")

# ── Singleton state ───────────────────────────────────────────────────────────
_model          = None
_scaler         = None
_load_attempted = False
_model_ready    = False          # True only when BOTH files loaded successfully
_lock           = threading.Lock()  # thread-safe lazy init


# ── Loader ────────────────────────────────────────────────────────────────────

def get_model() -> Tuple[Optional[object], Optional[object]]:
    """
    Lazy singleton loader.
    Returns (model, scaler). Either may be None if files are missing.
    Thread-safe — safe to call from multiple async workers.
    """
    global _model, _scaler, _load_attempted, _model_ready

    if _load_attempted:
        return _model, _scaler

    with _lock:
        # Double-checked locking
        if _load_attempted:
            return _model, _scaler

        _load_attempted = True
        t0 = time.perf_counter()

        try:
            import joblib

            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
            if not os.path.exists(SCALER_PATH):
                raise FileNotFoundError(f"Scaler not found: {SCALER_PATH}")

            _model  = joblib.load(MODEL_PATH)
            _scaler = joblib.load(SCALER_PATH)
            _model_ready = True

            elapsed = (time.perf_counter() - t0) * 1000
            logger.info(
                "[ML] Isolation Forest + scaler loaded successfully "
                f"(load time: {elapsed:.1f} ms)"
            )
            print(f"[MODEL] Loaded successfully (load time: {elapsed:.1f} ms)")
            print("[ML STATUS] ACTIVE")

        except FileNotFoundError as e:
            logger.warning(
                f"[ML] Model file not found — running in RULE_FALLBACK mode. "
                f"Detail: {e}"
            )
            print(f"[MODEL] Running in fallback mode — file not found: {e}")
        except Exception as e:
            logger.error(f"[ML] Failed to load model: {e}")
            print(f"[MODEL] Failed to load: {e}")

    return _model, _scaler


def is_model_ready() -> bool:
    """Returns True only when both model and scaler are loaded."""
    return _model_ready


# ── Inference ─────────────────────────────────────────────────────────────────

def predict_anomaly(features: List[float]) -> dict:
    """
    Run Isolation Forest inference on a fixed-length feature vector.

    Returns:
        {
            "anomaly":    bool,
            "score":      float,   # raw decision_function output
            "confidence": float,   # 0–100
        }

    Never raises — returns safe fallback dict on any error.
    """
    model, scaler = get_model()

    # Fallback: model unavailable
    if model is None or scaler is None:
        return {"anomaly": False, "score": 0.0, "confidence": 0.0, "source": "RULE_FALLBACK"}

    t0 = time.perf_counter()

    try:
        x = np.array(features, dtype=np.float64).reshape(1, -1)

        logger.debug(f"[ML] Features shape: {x.shape}")

        x_scaled = scaler.transform(x)
        pred     = model.predict(x_scaled)[0]          # 1 = normal, -1 = anomaly
        score    = float(model.decision_function(x_scaled)[0])

        # Isolation Forest: more negative score = more anomalous
        # Map to 0–100 confidence: invert and scale
        # score typically in [-0.5, 0.5]; clip then normalise
        raw_conf   = max(0.0, -score)                  # positive when anomalous
        confidence = min(100.0, round(raw_conf * 200, 2))  # scale to 0–100

        elapsed = (time.perf_counter() - t0) * 1000

        is_anomaly = bool(pred == -1)
        logger.info(
            f"[ML] Prediction: {'ANOMALY' if is_anomaly else 'NORMAL'} | "
            f"Confidence: {confidence:.1f}% | "
            f"Score: {score:.6f} | "
            f"Inference time: {elapsed:.2f} ms"
        )

        if elapsed > 50:
            logger.warning(f"[ML] Inference exceeded 50 ms budget: {elapsed:.2f} ms")

        return {
            "anomaly":    is_anomaly,
            "score":      round(score, 6),
            "confidence": confidence,
            "source":     "ML",
        }

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.error(f"[ML] Prediction error ({elapsed:.2f} ms): {e}")
        return {"anomaly": False, "score": 0.0, "confidence": 0.0, "source": "ERROR_FALLBACK"}
