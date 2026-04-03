"""
ml/features.py
==============
Feature engineering for communication anomaly detection.

Design goals
------------
- Reusable for both rule-based detectors and ML models (sklearn, torch, etc.)
- Per-source rolling window — each source_id gets its own deque(maxlen=20)
- Stateless input contract (TelemetryPoint) + stateful extractor (FeatureExtractor)
- Returns both a typed FeatureVector (human-readable) and a numpy array (model-ready)

Feature definitions
-------------------
  packet_rate           Raw packet rate from the current data point.
  snr                   Raw signal-to-noise ratio from the current data point.
  packet_loss           Raw packet loss fraction from the current data point.
  rolling_avg_packet_rate  Mean packet_rate over the last 5 points for this source.
                           Falls back to current value when history < 5.
  snr_drop_rate         Absolute SNR decrease per second vs the previous point.
                        (prev_snr - curr_snr) / delta_t  — clamped to 0 if SNR rose.
                        Zero on the first point for a source.
  packet_loss_spike     Difference between current packet_loss and the rolling mean
                        packet_loss over the last 5 points.
                        Positive = spike above baseline; negative = below.
                        Zero on the first point for a source.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field, astuple
from typing import Deque, Dict

import numpy as np

# ── Rolling window constants ──────────────────────────────────────────────────

WINDOW_MAX   = 20   # maximum history kept per source (deque hard cap)
ROLLING_N    = 5    # window used for rolling averages / spike detection


# ── Input contract ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TelemetryPoint:
    """
    Typed representation of one raw telemetry frame.

    Matches the JSON schema:
        {
            "timestamp":   float,   # Unix epoch seconds
            "source_id":   str,
            "dest_id":     str,
            "packet_rate": float,   # packets per second
            "snr":         float,   # signal-to-noise ratio (dB)
            "packet_loss": float    # fraction 0.0–1.0
        }
    """
    timestamp:   float
    source_id:   str
    dest_id:     str
    packet_rate: float
    snr:         float
    packet_loss: float

    @staticmethod
    def from_dict(d: dict) -> "TelemetryPoint":
        """Convenience constructor — converts raw simulator dicts directly."""
        return TelemetryPoint(
            timestamp=float(d.get("timestamp", time.time())),
            source_id=str(d.get("source_id", "unknown")),
            dest_id=str(d.get("dest_id", "unknown")),
            packet_rate=float(d["packet_rate"]),
            snr=float(d["snr"]),
            packet_loss=float(d["packet_loss"]),
        )


# ── Output contract ───────────────────────────────────────────────────────────

@dataclass
class FeatureVector:
    """
    Named feature vector returned by FeatureExtractor.extract_features().

    Use .to_numpy() to get a plain 1-D array for model inference.
    Use astuple(fv) or fv.to_numpy() for sklearn / torch pipelines.

    Feature order (stable — do not reorder without retraining models):
        [0] packet_rate
        [1] snr
        [2] packet_loss
        [3] rolling_avg_packet_rate
        [4] snr_drop_rate
        [5] packet_loss_spike
    """
    packet_rate:             float
    snr:                     float
    packet_loss:             float
    rolling_avg_packet_rate: float
    snr_drop_rate:           float
    packet_loss_spike:       float

    # Metadata — not part of the feature vector, excluded from to_numpy()
    source_id:  str = field(repr=True,  compare=False)
    timestamp:  float = field(repr=False, compare=False)

    FEATURE_NAMES: tuple = field(
        default=(
            "packet_rate",
            "snr",
            "packet_loss",
            "rolling_avg_packet_rate",
            "snr_drop_rate",
            "packet_loss_spike",
        ),
        init=False,
        repr=False,
        compare=False,
    )

    def to_numpy(self) -> np.ndarray:
        """Return the 6 numeric features as a float64 numpy array."""
        return np.array(
            [
                self.packet_rate,
                self.snr,
                self.packet_loss,
                self.rolling_avg_packet_rate,
                self.snr_drop_rate,
                self.packet_loss_spike,
            ],
            dtype=np.float64,
        )

    def to_list(self) -> list[float]:
        """Return the 6 numeric features as a plain Python list."""
        return self.to_numpy().tolist()


# ── Internal per-source state ─────────────────────────────────────────────────

@dataclass
class _SourceWindow:
    """Holds the rolling history for a single source_id."""
    history: Deque[TelemetryPoint] = field(
        default_factory=lambda: deque(maxlen=WINDOW_MAX)
    )


# ── Feature extractor ─────────────────────────────────────────────────────────

class FeatureExtractor:
    """
    Stateful feature extractor — maintains a rolling window per source_id.

    Usage
    -----
    extractor = FeatureExtractor()

    # Feed one point at a time (e.g. from WebSocket stream or REST poll)
    fv = extractor.extract_features(point)
    model_input = fv.to_numpy()          # shape (6,)

    # Or batch-process a list
    vectors = [extractor.extract_features(p) for p in points]

    Thread safety
    -------------
    Not thread-safe by default. If multiple threads share one extractor,
    wrap calls in a threading.Lock().
    """

    def __init__(self) -> None:
        # One _SourceWindow per unique source_id seen so far
        self._windows: Dict[str, _SourceWindow] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    def extract_features(self, point: TelemetryPoint) -> FeatureVector:
        """
        Process one telemetry point and return its FeatureVector.

        The point is appended to the source's rolling window *after* features
        are computed, so 'current' values are never included in their own
        rolling averages.
        """
        window = self._get_window(point.source_id)
        history = window.history          # deque of previous points

        fv = FeatureVector(
            packet_rate=point.packet_rate,
            snr=point.snr,
            packet_loss=point.packet_loss,
            rolling_avg_packet_rate=self._rolling_avg_packet_rate(history, point),
            snr_drop_rate=self._snr_drop_rate(history, point),
            packet_loss_spike=self._packet_loss_spike(history, point),
            source_id=point.source_id,
            timestamp=point.timestamp,
        )

        # Append *after* feature computation — keeps rolling stats honest
        history.append(point)
        return fv

    def reset(self, source_id: str | None = None) -> None:
        """
        Clear rolling history.
        Pass source_id to reset one source; omit to reset all.
        """
        if source_id is not None:
            self._windows.pop(source_id, None)
        else:
            self._windows.clear()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _get_window(self, source_id: str) -> _SourceWindow:
        if source_id not in self._windows:
            self._windows[source_id] = _SourceWindow()
        return self._windows[source_id]

    @staticmethod
    def _rolling_avg_packet_rate(
        history: Deque[TelemetryPoint],
        current: TelemetryPoint,
    ) -> float:
        """
        Mean packet_rate over the last ROLLING_N points (excluding current).
        Falls back to current.packet_rate when history is empty.
        """
        recent = list(history)[-ROLLING_N:]
        if not recent:
            return current.packet_rate
        return float(np.mean([p.packet_rate for p in recent]))

    @staticmethod
    def _snr_drop_rate(
        history: Deque[TelemetryPoint],
        current: TelemetryPoint,
    ) -> float:
        """
        Rate of SNR decrease vs the immediately preceding point (dB/second).
        Formula: max(0, prev_snr - curr_snr) / delta_t
        - Positive  → SNR is falling (potential jamming)
        - Zero      → SNR held steady or improved
        - Zero      → first point for this source (no previous to compare)
        """
        if not history:
            return 0.0
        prev = history[-1]
        delta_t = current.timestamp - prev.timestamp
        if delta_t <= 0:
            return 0.0
        drop = prev.snr - current.snr          # positive when SNR fell
        return float(max(0.0, drop) / delta_t)

    @staticmethod
    def _packet_loss_spike(
        history: Deque[TelemetryPoint],
        current: TelemetryPoint,
    ) -> float:
        """
        Deviation of current packet_loss from the rolling baseline.
        Formula: current.packet_loss - mean(last ROLLING_N packet_loss values)
        - Positive  → current loss is above baseline (spike)
        - Negative  → current loss is below baseline
        - Zero      → first point for this source
        """
        recent = list(history)[-ROLLING_N:]
        if not recent:
            return 0.0
        baseline = float(np.mean([p.packet_loss for p in recent]))
        return float(current.packet_loss - baseline)
