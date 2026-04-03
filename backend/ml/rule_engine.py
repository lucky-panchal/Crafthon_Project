"""
ml/rule_engine.py
=================
Rule-based anomaly detection for RF communication telemetry.

Three independent rule families
--------------------------------
  JAMMING       Low SNR + high packet loss — signal is being suppressed.
  SPOOFING      One source_id fans out to many dest_ids in a short window,
                or a known-spoofed source_id (999) appears in the stream.
  TRAFFIC_SPIKE Packet rate jumps more than 2× its rolling average —
                abnormal burst that may indicate a replay or flood attack.

Confidence model
----------------
  Each rule produces a raw score in [0.0, 1.0] based on how far the
  observed values exceed the detection thresholds (margin-based).
  The score is then mapped to the required 0–100 integer range:

    strong match  (score ≥ 0.75)  →  85–95
    medium match  (score ≥ 0.40)  →  60–80
    weak match    (score  < 0.40) →  40–59   (returned but risk = LOW)

  When multiple rules fire simultaneously the one with the highest
  confidence wins; its reason string lists all active signals.

Public API
----------
  detect_rule_based(data_point, history) → dict
      data_point : dict  — single raw telemetry frame
      history    : list[dict]  — ordered list of previous raw frames
                   (oldest first, newest last; may be empty)
      returns    : {"type", "confidence", "risk", "reason"}

  RuleEngine  — stateful class; maintains per-source spoofing windows
                across multiple calls (use when processing a live stream).
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

# ── Thresholds — single source of truth, easy to tune ────────────────────────

# Jamming
_JAM_SNR_HARD    = 15.0   # dB  — below this is always suspicious
_JAM_SNR_SOFT    = 20.0   # dB  — below this adds partial signal
_JAM_LOSS_HARD   = 0.30   # fraction (30 %)
_JAM_LOSS_SOFT   = 0.15   # fraction (15 %)

# Spoofing
_SPOOF_SOURCE_ID = "999"          # known injected source from attacks.py
_SPOOF_DEST_WINDOW = 20           # seconds — time window for fan-out check
_SPOOF_DEST_THRESHOLD = 2         # unique dest_ids that trigger detection

# Traffic spike
_SPIKE_MULTIPLIER = 2.0           # packet_rate > N × rolling_avg → spike
_SPIKE_SOFT_MULTIPLIER = 1.5      # softer signal for partial confidence

# Spoofing history window per source
_SPOOF_HISTORY_MAXLEN = 50


# ── Result contract ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DetectionResult:
    """
    Immutable result returned by every detection path.

    Fields
    ------
    type        : "JAMMING" | "SPOOFING" | "TRAFFIC_SPIKE" | "NONE"
    confidence  : int  0–100
    risk        : "LOW" | "MEDIUM" | "HIGH"
    reason      : human-readable explanation of which signals fired
    """
    type:       str
    confidence: int
    risk:       str
    reason:     str

    def to_dict(self) -> dict:
        return {
            "type":       self.type,
            "confidence": self.confidence,
            "risk":       self.risk,
            "reason":     self.reason,
        }


# Sentinel — returned when no rule fires
_RESULT_NONE = DetectionResult(
    type="NONE",
    confidence=0,
    risk="LOW",
    reason="All signals within normal parameters.",
)


# ── Confidence helpers ────────────────────────────────────────────────────────

def _score_to_confidence(score: float) -> int:
    """Map a normalised [0, 1] score to the required integer confidence range."""
    if score >= 0.75:
        # Strong match: 85–95, scaled within the band
        return min(95, 85 + int((score - 0.75) / 0.25 * 10))
    if score >= 0.40:
        # Medium match: 60–80
        return 60 + int((score - 0.40) / 0.35 * 20)
    # Weak match: 40–59
    return 40 + int(score / 0.40 * 19)


def _score_to_risk(score: float) -> str:
    if score >= 0.75:
        return "HIGH"
    if score >= 0.40:
        return "MEDIUM"
    return "LOW"


# ── Internal spoofing state ───────────────────────────────────────────────────

@dataclass
class _SpoofWindow:
    """Tracks (dest_id, timestamp) pairs seen for one source_id."""
    entries: Deque[tuple[str, float]] = field(
        default_factory=lambda: deque(maxlen=_SPOOF_HISTORY_MAXLEN)
    )


# ── Rule evaluators ───────────────────────────────────────────────────────────

def _check_jamming(
    point: dict,
    history: List[dict],
) -> Optional[DetectionResult]:
    """
    Jamming rule — fires when SNR is suppressed AND packet loss is elevated.

    Score components (each 0–1, averaged):
      snr_score   : how far SNR is below the hard threshold
      loss_score  : how far packet_loss is above the hard threshold
    Both must be > 0 for the rule to fire.
    """
    snr  = float(point.get("snr", 999))
    loss = float(point.get("packet_loss", 0))

    # Neither condition met at all — bail early
    if snr >= _JAM_SNR_SOFT and loss < _JAM_LOSS_SOFT:
        return None

    # SNR score: 0 at soft threshold, 1 at hard threshold and below
    snr_score = max(0.0, (_JAM_SNR_SOFT - snr) / (_JAM_SNR_SOFT - _JAM_SNR_HARD))
    snr_score = min(1.0, snr_score)

    # Loss score: 0 at soft threshold, 1 at hard threshold and above
    loss_score = max(0.0, (loss - _JAM_LOSS_SOFT) / (_JAM_LOSS_HARD - _JAM_LOSS_SOFT))
    loss_score = min(1.0, loss_score)

    # Both signals must contribute — product penalises single-signal matches
    if snr_score == 0 or loss_score == 0:
        return None

    score = (snr_score + loss_score) / 2.0

    signals: List[str] = []
    if snr < _JAM_SNR_HARD:
        signals.append(f"SNR critically low ({snr:.1f} dB < {_JAM_SNR_HARD} dB)")
    else:
        signals.append(f"SNR degraded ({snr:.1f} dB < {_JAM_SNR_SOFT} dB)")

    if loss >= _JAM_LOSS_HARD:
        signals.append(f"packet loss severe ({loss*100:.1f}% > {_JAM_LOSS_HARD*100:.0f}%)")
    else:
        signals.append(f"packet loss elevated ({loss*100:.1f}% > {_JAM_LOSS_SOFT*100:.0f}%)")

    # Corroborate with history: if SNR has been dropping, boost score
    if len(history) >= 2:
        prev_snr = float(history[-1].get("snr", snr))
        if prev_snr > snr:
            score = min(1.0, score + 0.10)
            signals.append(f"SNR falling (was {prev_snr:.1f} dB)")

    return DetectionResult(
        type="JAMMING",
        confidence=_score_to_confidence(score),
        risk=_score_to_risk(score),
        reason="Jamming detected — " + "; ".join(signals) + ".",
    )


def _check_spoofing(
    point: dict,
    history: List[dict],
    spoof_windows: Dict[str, _SpoofWindow],
) -> Optional[DetectionResult]:
    """
    Spoofing rule — two independent signals, either alone can fire:

    Signal A — known injected source_id (999 from attacks.py)
    Signal B — one source_id fans out to ≥ THRESHOLD unique dest_ids
               within the last SPOOF_DEST_WINDOW seconds
    """
    source_id = str(point.get("source_id", ""))
    dest_id   = str(point.get("dest_id",   ""))
    now       = float(point.get("timestamp", time.time()))

    signals: List[str] = []
    score = 0.0

    # ── Signal A: known spoofed source_id ────────────────────────────────────
    if source_id == _SPOOF_SOURCE_ID:
        score = max(score, 0.90)
        signals.append(f"source_id {source_id!r} is a known spoofed identifier")

    # ── Signal B: fan-out detection ───────────────────────────────────────────
    if source_id not in spoof_windows:
        spoof_windows[source_id] = _SpoofWindow()

    win = spoof_windows[source_id]
    win.entries.append((dest_id, now))

    # Prune entries outside the time window
    cutoff = now - _SPOOF_DEST_WINDOW
    fresh = [(d, t) for d, t in win.entries if t >= cutoff]
    win.entries.clear()
    win.entries.extend(fresh)

    unique_dests = {d for d, _ in win.entries}
    n_dests = len(unique_dests)

    if n_dests >= _SPOOF_DEST_THRESHOLD:
        # Score scales with how many extra destinations were seen
        fan_score = min(1.0, 0.60 + (n_dests - _SPOOF_DEST_THRESHOLD) * 0.10)
        score = max(score, fan_score)
        signals.append(
            f"source {source_id!r} contacted {n_dests} unique destinations "
            f"in {_SPOOF_DEST_WINDOW}s window {sorted(unique_dests)}"
        )

    # ── Also scan raw history for duplicate source_id with different dest ─────
    if not signals:
        hist_dests = {
            str(h.get("dest_id", ""))
            for h in history
            if str(h.get("source_id", "")) == source_id
        }
        hist_dests.add(dest_id)
        if len(hist_dests) >= _SPOOF_DEST_THRESHOLD:
            score = max(score, 0.65)
            signals.append(
                f"source {source_id!r} seen with {len(hist_dests)} "
                f"different destinations in history"
            )

    if not signals:
        return None

    return DetectionResult(
        type="SPOOFING",
        confidence=_score_to_confidence(score),
        risk=_score_to_risk(score),
        reason="Spoofing detected — " + "; ".join(signals) + ".",
    )


def _check_traffic_spike(
    point: dict,
    history: List[dict],
) -> Optional[DetectionResult]:
    """
    Traffic spike rule — fires when packet_rate exceeds N× its rolling average.

    Requires at least 3 history points to avoid false positives on startup.
    Score scales with how far above the spike multiplier the current rate is.
    """
    if len(history) < 3:
        return None

    current_rate = float(point.get("packet_rate", 0))
    if current_rate <= 0:
        return None

    recent = history[-5:] if len(history) >= 5 else history
    rates  = [float(h.get("packet_rate", 0)) for h in recent if h.get("packet_rate")]

    if not rates:
        return None

    rolling_avg = sum(rates) / len(rates)

    if rolling_avg <= 0:
        return None

    ratio = current_rate / rolling_avg

    if ratio < _SPIKE_SOFT_MULTIPLIER:
        return None

    # Score: 0 at soft threshold, 1 at 3× rolling average
    score = min(1.0, (ratio - _SPIKE_SOFT_MULTIPLIER) / (3.0 - _SPIKE_SOFT_MULTIPLIER))

    signals = [
        f"packet rate {current_rate:.0f} pps is {ratio:.1f}× "
        f"the rolling average ({rolling_avg:.0f} pps)"
    ]

    if ratio >= _SPIKE_MULTIPLIER:
        signals.append(f"exceeds 2× spike threshold")

    return DetectionResult(
        type="TRAFFIC_SPIKE",
        confidence=_score_to_confidence(score),
        risk=_score_to_risk(score),
        reason="Traffic spike detected — " + "; ".join(signals) + ".",
    )


# ── Rule engine class (stateful — use for live streams) ──────────────────────

class RuleEngine:
    """
    Stateful rule engine — maintains per-source spoofing windows across calls.

    Use this class when processing a continuous stream so that the spoofing
    fan-out detector accumulates state correctly between frames.

    For one-shot / batch use, call the module-level detect_rule_based() instead.
    """

    def __init__(self) -> None:
        self._spoof_windows: Dict[str, _SpoofWindow] = {}

    def detect(self, point: dict, history: List[dict]) -> DetectionResult:
        """
        Run all rules against one telemetry point and return the highest-
        confidence result.  Returns NONE if no rule fires.

        Parameters
        ----------
        point   : dict  — current raw telemetry frame
        history : list  — previous raw frames, oldest first (may be empty)
        """
        candidates: List[DetectionResult] = []

        jam = _check_jamming(point, history)
        if jam:
            candidates.append(jam)

        spoof = _check_spoofing(point, history, self._spoof_windows)
        if spoof:
            candidates.append(spoof)

        spike = _check_traffic_spike(point, history)
        if spike:
            candidates.append(spike)

        if not candidates:
            return _RESULT_NONE

        # Return the result with the highest confidence
        return max(candidates, key=lambda r: r.confidence)

    def reset(self) -> None:
        """Clear all accumulated spoofing state."""
        self._spoof_windows.clear()


# ── Module-level convenience function (stateless) ────────────────────────────

# One shared engine for the module-level function.
# Stateless from the caller's perspective — spoof windows are internal.
_default_engine = RuleEngine()


def detect_rule_based(data_point: dict, history: list) -> dict:
    """
    Run all anomaly detection rules and return a result dict.

    Parameters
    ----------
    data_point : dict
        Single raw telemetry frame::

            {
                "timestamp":   float,
                "source_id":   str,
                "dest_id":     str,
                "packet_rate": float,
                "snr":         float,
                "packet_loss": float   # fraction 0.0–1.0
            }

    history : list[dict]
        Ordered list of previous raw frames (oldest first, newest last).
        May be empty — rules degrade gracefully with no history.

    Returns
    -------
    dict::

        {
            "type":       "JAMMING" | "SPOOFING" | "TRAFFIC_SPIKE" | "NONE",
            "confidence": int,   # 0–100
            "risk":       "LOW" | "MEDIUM" | "HIGH",
            "reason":     str
        }

    Examples
    --------
    >>> result = detect_rule_based(
    ...     {"timestamp": 1700000000.0, "source_id": "node-1",
    ...      "dest_id": "node-2", "packet_rate": 75,
    ...      "snr": 10.0, "packet_loss": 0.45},
    ...     []
    ... )
    >>> result["type"]
    'JAMMING'
    >>> result["risk"]
    'HIGH'
    """
    if not isinstance(data_point, dict):
        raise TypeError(f"data_point must be a dict, got {type(data_point).__name__}")
    if not isinstance(history, list):
        raise TypeError(f"history must be a list, got {type(history).__name__}")

    return _default_engine.detect(data_point, history).to_dict()
