"""
utils/thal_predictor.py
-----------------------
Adaptive transfusion interval predictor for ThalCare patients.

Instead of using a fixed frequency (e.g., every 21 days), this module
analyzes a patient's actual transfusion history to predict the optimal
next transfusion date.

The model uses:
  1. Weighted moving average of past intervals (recent intervals matter more)
  2. Trend detection (intervals getting shorter → patient needs more frequent transfusions)
  3. Safety margin (never suggests longer than the max safe interval)
  4. Confidence scoring (more history = more confident prediction)

For new patients with no history, it falls back to the configured frequency.
"""

from datetime import date, timedelta
from typing import Optional
import math


# ── Configuration ─────────────────────────────────────────────────────────────

# Absolute safety bounds — never predict outside these
MIN_INTERVAL_DAYS = 7     # Minimum days between transfusions
MAX_INTERVAL_DAYS = 42    # Maximum days (6 weeks) — safety ceiling
SAFETY_MARGIN_DAYS = 1    # Subtract this from prediction as safety buffer

# How many past transfusions to consider (older ones get less weight)
MAX_HISTORY_WINDOW = 10

# Minimum number of data points to use adaptive prediction
MIN_DATA_POINTS = 2


def predict_next_interval(
    transfusion_dates: list[str],
    configured_frequency: int = 21,
) -> dict:
    """
    Given a list of past transfusion dates (ISO format, most recent first or any order),
    predict the optimal interval to the next transfusion.

    Returns:
        {
            "predicted_days": int,          # recommended interval in days
            "configured_days": int,         # the static configured frequency
            "confidence": float,            # 0.0 to 1.0 — how confident the prediction is
            "method": str,                  # "adaptive" | "fallback"
            "trend": str,                   # "stable" | "shortening" | "lengthening"
            "trend_detail": str,            # human-readable trend explanation
            "intervals": list[int],         # actual intervals computed from history
            "avg_interval": float | None,   # weighted average
            "next_date": str | None,        # predicted next date if last date is known
        }
    """
    if not transfusion_dates or len(transfusion_dates) < MIN_DATA_POINTS:
        # Not enough history — fall back to configured frequency
        return {
            "predicted_days": configured_frequency,
            "configured_days": configured_frequency,
            "confidence": 0.0,
            "method": "fallback",
            "trend": "stable",
            "trend_detail": "Not enough history for adaptive prediction. Using configured frequency.",
            "intervals": [],
            "avg_interval": None,
            "next_date": None,
        }

    # ── Parse and sort dates (oldest first) ────────────────────────────────
    parsed = []
    for d in transfusion_dates:
        try:
            parsed.append(date.fromisoformat(str(d)[:10]))
        except (ValueError, TypeError):
            continue

    if len(parsed) < MIN_DATA_POINTS:
        return {
            "predicted_days": configured_frequency,
            "configured_days": configured_frequency,
            "confidence": 0.0,
            "method": "fallback",
            "trend": "stable",
            "trend_detail": "Could not parse enough valid dates.",
            "intervals": [],
            "avg_interval": None,
            "next_date": None,
        }

    parsed.sort()  # oldest first

    # ── Compute intervals between consecutive transfusions ─────────────────
    intervals = []
    for i in range(1, len(parsed)):
        gap = (parsed[i] - parsed[i - 1]).days
        if gap > 0:  # skip same-day duplicates
            intervals.append(gap)

    if not intervals:
        return {
            "predicted_days": configured_frequency,
            "configured_days": configured_frequency,
            "confidence": 0.0,
            "method": "fallback",
            "trend": "stable",
            "trend_detail": "No valid intervals computed from history.",
            "intervals": [],
            "avg_interval": None,
            "next_date": None,
        }

    # Limit to recent history
    intervals = intervals[-MAX_HISTORY_WINDOW:]

    # ── Weighted moving average (exponential weights, recent = higher) ─────
    n = len(intervals)
    weights = [math.exp(0.3 * i) for i in range(n)]  # exponential: recent gets more weight