"""
routes/marrow.py
----------------
Endpoints consumed by MarrowMatch.tsx:
  POST /marrow/match          → HLA matching → returns top matches with % and confidence
  POST /marrow/register-hla   → donor registers HLA type
  GET  /marrow/donors         → donor list
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.db import supabase
from utils.matching import hla_score, hla_confidence

router = APIRouter()


# ── POST /marrow/match ────────────────────────────────────────────────────────

class MarrowMatchRequest(BaseModel):
    patient_hla:       list[str]    # e.g. ["A*02:01", "B*07:02", "C*07:01", "DRB1*15:01"]
    patient_id:        Optional[str] = None
    min_match_percent: float = 30.0
    urgency:           Optional[str] = None


@router.post("/match")
def find_marrow_matches(body: MarrowMatchRequest):
    """
    Called by 'Find Matches' button on MarrowMatch.tsx.
    Returns matches list with shape:
      { id, matchPct, confidence, hlaA, hlaB, location, age, donated, status }
    which maps directly to the match cards in MarrowMatch.tsx.
    """
    # Get all available donors with HLA types
    res = supabase.table("donors") \
        .select("id, name, city, trust_score, is_verified, hla_type, is_available, last_donation_date") \
        .eq("is_available", True) \
        .not_.is_("hla_type", "null") \
        .execute()

    matches = []
    for donor in (res.data or []):
        hla = donor.get("hla_type") or []
        if not hla:
            continue

        score = hla_score(hla, body.patient_hla)
        if score < body.min_match_percent:
            continue

        confidence = hla_confidence(score)
        hla_a = next((h for h in hla if h.startswith("A*")), hla[0] if hla else "—")
        hla_b = next((h for h in hla if h.startswith("B*")), hla[1] if len(hla) > 1 else "—")

        trust = donor.get("trust_score", 50)
        status = "Willing" if trust >= 70 else "Considering"

        matches.append({
            "id":          f"M{donor['id'][:4].upper()}",
            "donor_id":    donor["id"],
            "matchPct":    score,
            "confidence":  confidence,
            "hlaA":        hla_a,
            "hlaB":        hla_b,
            "location":    donor.get("city") or "—",
            "age":         None,   # age from dob if needed
            "donated":     0,      # TODO: count from matches table
            "status":      status,
        })

    matches.sort(key=lambda x: -x["matchPct"])
    top_10 = matches[:10]

    return {
        "patient_hla": body.patient_hla,
        "total_found": len(matches),
        "matches":     top_10,
    }


# ── POST /marrow/register-hla ─────────────────────────────────────────────────

class RegisterHlaBody(BaseModel):
    donor_id: str
    hla_type: list[str]    # ["A*02:01", "B*07:02", "C*07:01", "DRB1*15:01"]


@router.post("/register-hla")
def register_hla(body: RegisterHlaBody):
    """
    Called by 'Register as Donor' button on MarrowMatch.tsx.
    Adds HLA type and ensures 'marrow' is in donor_types.
    """
    # Fetch current donor
    donor = supabase.table("donors") \
        .select("donor_types") \
        .eq("id", body.donor_id) \
        .single() \
        .execute()

    if not donor.data:
        raise HTTPException(status_code=404, detail="Donor not found")

    existing_types = donor.data.get("donor_types") or []
    if "marrow" not in existing_types:
        existing_types = existing_types + ["marrow"]

    supabase.table("donors").update({
        "hla_type":    body.hla_type,
        "donor_types": existing_types,
    }).eq("id", body.donor_id).execute()

    return {
        "success": True,
        "message": "HLA type registered. You are now in the marrow donor registry.",
    }

