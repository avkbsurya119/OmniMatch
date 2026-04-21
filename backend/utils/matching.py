"""
utils/matching.py
-----------------
Pure helper functions — no DB calls here.
  • blood_compatible()  — can donor_group donate to recipient_group?
  • hla_score()         — Jaccard similarity for bone marrow HLA matching
  • haversine()         — km distance between two lat/lng points
  • days_since()        — days since an ISO date string
"""

import math
from datetime import date, datetime
from typing import Optional


# ── Blood Compatibility ───────────────────────────────────────────────────────
# Which donor groups can donate to which recipient?
_COMPATIBLE: dict[str, list[str]] = {
    "A+":  ["A+", "A-", "O+", "O-"],
    "A-":  ["A-", "O-"],
    "B+":  ["B+", "B-", "O+", "O-"],
    "B-":  ["B-", "O-"],
    "AB+": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    "AB-": ["A-", "B-", "AB-", "O-"],
    "O+":  ["O+", "O-"],
    "O-":  ["O-"],
}

def blood_compatible(donor_group: str, recipient_group: str) -> bool:
    """Returns True if donor can donate to recipient."""
    return donor_group in _COMPATIBLE.get(recipient_group, [])


# ── HLA Jaccard Score ─────────────────────────────────────────────────────────
def hla_score(donor_hla: list[str], patient_hla: list[str]) -> float:
    """
    Jaccard similarity × 100, rounded to 1 decimal.
    e.g. ["A*02:01","B*07:02"] vs ["A*02:01","B*08:01"] → 33.3
    """
    if not donor_hla or not patient_hla:
        return 0.0
    d = set(donor_hla)
    p = set(patient_hla)
    union = d | p
    if not union:
        return 0.0
    return round(len(d & p) / len(union) * 100, 1)


def hla_confidence(score: float) -> str:
    """Maps score to confidence label shown on MarrowMatch cards."""
    if score >= 95:
        return "Excellent"
    elif score >= 85:
        return "Very Good"
    elif score >= 70:
        return "Good"
    return "Low"


# ── Haversine Distance ────────────────────────────────────────────────────────
def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Returns distance in km between two coordinate pairs."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


# ── Date Helpers ──────────────────────────────────────────────────────────────
def days_since(iso_date: Optional[str]) -> Optional[int]:
    """Returns days since the given ISO date string, or None."""
    if not iso_date:
        return None
    try:
        d = datetime.fromisoformat(iso_date[:10]).date()
        return (date.today() - d).days
    except Exception:
        return None


def days_until(iso_date: Optional[str]) -> Optional[int]:
    """Returns days until the given ISO date string (negative = overdue), or None."""
    if not iso_date:
        return None
    try:
        d = datetime.fromisoformat(iso_date[:10]).date()
        return (d - date.today()).days
    except Exception:
        return None


def countdown_label(days: Optional[int]) -> str:
    """Human-readable countdown used on ThalCare patient cards."""
    if days is None:
        return "Unknown"
    if days < 0:
        return "OVERDUE"
    if days == 0:
        return "Today"
    if days == 1:
        return "1 day"
    return f"{days} days"