"""
ml/model.py
===========
Isolation Forest anomaly detection for RF communication telemetry.

Architecture
------------
  AnomalyModel wraps a sklearn Pipeline:
      StandardScaler  →  IsolationForest(contamination=0.05)

  StandardScaler is mandatory before IsolationForest — IF uses path lengths
  in a random tree ensemble, and unscaled features with very different ranges
  (packet_rate ~100–200 vs packet_loss ~0–0.1) would bias the tree splits
  heavily toward the high-magnitude features.

Feature vector (6 dimensions — must match ml/features.py order)
----------------------------------------------------------------
  [0] packet_rate              raw pps
  [1] snr                      raw dB
  [2] packet_loss              raw fraction 0–1
  [3] rolling_avg_packet_rate  mean of last 5 packet_rate values
  [4] snr_drop_rate            dB/s drop vs previous point
  [5] packet_loss_spike        deviation from rolling loss baseline

Score normalisation
-------------------
  IsolationForest.decision_function() returns values in roughly [-0.5, 0.5]:
    - Positive  → inlier  (normal)
    - Negative  → outlier (anomaly)
    - Threshold → 0.0

  We map this to a 0–100 anomaly confidence score:
    confidence = clip((−score / 0.5) × 100, 0, 100)

  So score = −0.5 (deep outlier) → confidence 100
     score =  0.0 (boundary)     → confidence 0
     score = +0.5 (deep inlier)  → confidence 0  (clipped)

Public API
----------
  train_model(n_samples, contamination, random_state) → AnomalyModel
  predict_anomaly(features)                           → dict
  save_model(model, path)
  load_model(path)                                    → AnomalyModel
  get_model()                                         → AnomalyModel  (auto-trains)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Union

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.features import FeatureVector

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────

_MODULE_DIR   = Path(__file__).parent
MODEL_DIR     = _MODULE_DIR / "models"
DEFAULT_MODEL_PATH = MODEL_DIR / "isolation_forest.joblib"

# ── Feature metadata (mirrors features.py — must stay in sync) ───────────────

FEATURE_NAMES = (
    "packet_rate",
    "snr",
    "packet_loss",
    "rolling_avg_packet_rate",
    "snr_drop_rate",
    "packet_loss_spike",
)
N_FEATURES = len(FEATURE_NAMES)

# ── Score normalisation constant ──────────────────────────────────────────────
# IF decision_function range is approximately [-0.5, +0.5].
# Dividing by this constant maps the outlier half to [0, 1].
_SCORE_SCALE = 0.5


# ── Synthetic data generation ─────────────────────────────────────────────────

def _generate_normal_data(n_samples: int, rng: np.random.Generator) -> np.ndarray:
    """
    Generate synthetic normal-operation telemetry for training.

    Ranges match the simulator (simulator.py) normal mode:
      packet_rate              100–200  pps
      snr                       20–35   dB
      packet_loss                0–0.10 fraction

    Derived features are simulated as small perturbations around the raw
    values — they would be near-zero in stable normal operation.

      rolling_avg_packet_rate  ≈ packet_rate ± 5%  (rolling mean stays close)
      snr_drop_rate             0–0.5  dB/s         (slow, gentle drift)
      packet_loss_spike        -0.02–0.02           (tiny deviations from baseline)
    """
    packet_rate = rng.uniform(100, 200, n_samples)
    snr         = rng.uniform(20,  35,  n_samples)
    packet_loss = rng.uniform(0,   0.10, n_samples)

    # Rolling average stays within ±5 % of current rate in normal operation
    rolling_avg = packet_rate * rng.uniform(0.95, 1.05, n_samples)

    # SNR drop rate is small and non-negative in normal operation
    snr_drop_rate = rng.uniform(0, 0.5, n_samples)

    # Packet loss spike is near zero — small random deviations
    pl_spike = rng.uniform(-0.02, 0.02, n_samples)

    return np.column_stack([
        packet_rate,
        snr,
        packet_loss,
        rolling_avg,
        snr_drop_rate,
        pl_spike,
    ])


# ── Model wrapper ─────────────────────────────────────────────────────────────

@dataclass
class AnomalyModel:
    """
    Wraps a fitted sklearn Pipeline (StandardScaler + IsolationForest).

    Attributes
    ----------
    pipeline      : fitted sklearn Pipeline
    contamination : contamination fraction used during training
    n_train       : number of samples the model was trained on
    """
    pipeline:      Pipeline
    contamination: float
    n_train:       int

    # ── Prediction ────────────────────────────────────────────────────────────

    def predict_anomaly(
        self,
        features: Union[FeatureVector, list, np.ndarray],
    ) -> dict:
        """
        Score one feature vector and return an anomaly prediction.

        Parameters
        ----------
        features : FeatureVector | list[float] | np.ndarray shape (6,) or (1,6)

        Returns
        -------
        dict::

            {
                "is_anomaly":    bool,
                "confidence":    int,    # 0–100  (higher = more anomalous)
                "anomaly_score": float,  # raw IF decision_function value
                "risk":          "LOW" | "MEDIUM" | "HIGH"
            }
        """
        vec = self._to_array(features)                    # shape (1, 6)
        raw_score   = float(self.pipeline.decision_function(vec)[0])
        is_anomaly  = bool(self.pipeline.predict(vec)[0] == -1)
        confidence  = self._normalise_score(raw_score)
        risk        = self._confidence_to_risk(confidence)

        return {
            "is_anomaly":    is_anomaly,
            "confidence":    confidence,
            "anomaly_score": round(raw_score, 6),
            "risk":          risk,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _to_array(
        features: Union[FeatureVector, list, np.ndarray],
    ) -> np.ndarray:
        """Convert any supported input type to a (1, N_FEATURES) float64 array."""
        if isinstance(features, FeatureVector):
            arr = features.to_numpy()
        elif isinstance(features, np.ndarray):
            arr = features.astype(np.float64)
        elif isinstance(features, list):
            arr = np.array(features, dtype=np.float64)
        else:
            raise TypeError(
                f"features must be FeatureVector, list, or ndarray — "
                f"got {type(features).__name__}"
            )

        arr = arr.flatten()
        if arr.shape[0] != N_FEATURES:
            raise ValueError(
                f"Expected {N_FEATURES} features, got {arr.shape[0]}. "
                f"Feature order: {FEATURE_NAMES}"
            )
        return arr.reshape(1, -1)

    @staticmethod
    def _normalise_score(raw_score: float) -> int:
        """
        Map IF decision_function score to 0–100 anomaly confidence.

        decision_function ≈ +0.5  →  deep inlier   →  confidence   0
        decision_function ≈  0.0  →  boundary      →  confidence   0
        decision_function ≈ -0.5  →  deep outlier  →  confidence 100
        """
        confidence = (-raw_score / _SCORE_SCALE) * 100
        return int(np.clip(confidence, 0, 100))

    @staticmethod
    def _confidence_to_risk(confidence: int) -> str:
        if confidence >= 70:
            return "HIGH"
        if confidence >= 40:
            return "MEDIUM"
        return "LOW"


# ── Training ──────────────────────────────────────────────────────────────────

def train_model(
    n_samples:     int   = 2_000,
    contamination: float = 0.05,
    random_state:  int   = 42,
) -> AnomalyModel:
    """
    Generate synthetic normal data and fit an IsolationForest pipeline.

    Parameters
    ----------
    n_samples     : number of synthetic training samples (default 2 000)
    contamination : expected fraction of outliers in production data (default 0.05)
    random_state  : seed for reproducibility

    Returns
    -------
    AnomalyModel — fitted and ready for predict_anomaly()
    """
    rng = np.random.default_rng(random_state)
    X   = _generate_normal_data(n_samples, rng)

    logger.info(
        "Training IsolationForest on %d samples, contamination=%.2f",
        n_samples, contamination,
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("iforest", IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=200,       # more trees → more stable scores
            max_samples="auto",     # min(256, n_samples)
            n_jobs=-1,              # use all CPU cores
        )),
    ])

    pipeline.fit(X)

    model = AnomalyModel(
        pipeline=pipeline,
        contamination=contamination,
        n_train=n_samples,
    )

    logger.info("Training complete.")
    return model


# ── Persistence ───────────────────────────────────────────────────────────────

def save_model(
    model: AnomalyModel,
    path:  Union[str, Path] = DEFAULT_MODEL_PATH,
) -> Path:
    """
    Serialise the model to disk using joblib.

    Parameters
    ----------
    model : AnomalyModel to save
    path  : destination file path (default ml/models/isolation_forest.joblib)

    Returns
    -------
    Path — the resolved path where the file was written
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path, compress=3)
    logger.info("Model saved → %s", path)
    return path


def load_model(
    path: Union[str, Path] = DEFAULT_MODEL_PATH,
) -> AnomalyModel:
    """
    Load a previously saved AnomalyModel from disk.

    Raises
    ------
    FileNotFoundError if the file does not exist.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"No saved model at {path}. "
            "Call train_model() and save_model() first, "
            "or use get_model() for automatic initialisation."
        )
    model = joblib.load(path)
    logger.info("Model loaded ← %s  (trained on %d samples)", path, model.n_train)
    return model


# ── Auto-initialising singleton ───────────────────────────────────────────────

_cached_model: AnomalyModel | None = None


def get_model() -> AnomalyModel:
    """
    Return the shared AnomalyModel instance, loading or training as needed.

    Resolution order:
      1. In-process cache (_cached_model)
      2. Saved file at DEFAULT_MODEL_PATH
      3. Train from scratch and save to DEFAULT_MODEL_PATH

    This means the first call in a fresh process takes ~1 s to train;
    every subsequent call (same process or after save) is instant.
    """
    global _cached_model

    if _cached_model is not None:
        return _cached_model

    if DEFAULT_MODEL_PATH.exists():
        _cached_model = load_model()
        return _cached_model

    logger.info("No saved model found — training from scratch.")
    _cached_model = train_model()
    save_model(_cached_model)
    return _cached_model


# ── Module-level convenience wrapper ─────────────────────────────────────────

def predict_anomaly(
    features: Union[FeatureVector, list, np.ndarray],
) -> dict:
    """
    Score one feature vector using the shared model (auto-trains if needed).

    Parameters
    ----------
    features : FeatureVector | list[float] | np.ndarray shape (6,)

    Returns
    -------
    dict::

        {
            "is_anomaly":    bool,
            "confidence":    int,    # 0–100
            "anomaly_score": float,  # raw IF decision_function value
            "risk":          "LOW" | "MEDIUM" | "HIGH"
        }

    Examples
    --------
    >>> result = predict_anomaly([150, 27.5, 0.02, 148.0, 0.1, 0.005])
    >>> result["is_anomaly"]
    False

    >>> result = predict_anomaly([75, 8.0, 0.55, 80.0, 5.0, 0.45])
    >>> result["is_anomaly"]
    True
    """
    return get_model().predict_anomaly(features)
