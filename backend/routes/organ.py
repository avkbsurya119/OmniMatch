"""
routes/organ.py
---------------
Endpoints consumed by LastGift.tsx:
  GET  /organ/viability        → organ viability card data (static + active cases)
  GET  /organ/recipients       → ranked recipient list
  POST /organ/pledge           → donor creates organ pledge
  POST /organ/requests         → hospital posts a recipient in need
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from utils.db import supabase
from utils.matching import blood_compatible, haversine

router = APIRouter()


# ── Organ viability constants — matches LastGift.tsx organs array exactly ─────

ORGAN_VIABILITY = {
    "Heart":    {"window": "4–6 hrs",   "hours": 6,   "emoji": "❤️",  "color": "text-blood"},
    "Liver":    {"window": "12–24 hrs", "hours": 24,  "emoji": "🫀",  "color": "text-thal"},
    "Kidney":   {"window": "24–36 hrs", "hours": 36,  "emoji": "🫘",  "color": "text-organ"},
    "Lungs":    {"window": "4–6 hrs",   "hours": 6,   "emoji": "🫁",  "color": "text-marrow"},
    "Pancreas": {"window": "12–18 hrs", "hours": 18,  "emoji": "🔬",  "color": "text-platelet"},
    "Cornea":   {"window": "5–7 days",  "hours": 144, "emoji": "👁️", "color": "text-milk"},
}


# ── GET /organ/viability ──────────────────────────────────────────────────────

@router.get("/viability")
def get_organ_viability():
    """
    Powers the 'Organ Viability Windows' 6-card grid on LastGift.tsx.
    Returns static viability data in the same shape as the frontend organs array.
    """
    return [
        {
            "name":   name,
            "emoji":  data["emoji"],
            "window": data["window"],
            "viabilityHrs": data["hours"],
            "color":  data["color"],
        }
        for name, data in ORGAN_VIABILITY.items()
    ]


# ── GET /organ/recipients ─────────────────────────────────────────────────────

@router.get("/recipients")
def get_organ_recipients(
    organ_type:   Optional[str] = Query(None),
    blood_group:  Optional[str] = Query(None),
    donor_lat:    Optional[float] = Query(None),
    donor_lng:    Optional[float] = Query(None),
    limit:        int = Query(10, le=50),
):
    """
    Powers the 'Recipient Ranking (Active)' list on LastGift.tsx.
    Returns shape:
      { name, organ, blood, urgency, hospital, wait, rank, distance_km }
    """
    query = supabase.table("organ_requests") \
        .select("*, hospitals(name, city, lat, lng)") \
        .eq("status", "waiting") \
        .order("urgency_score", desc=True)

    if organ_type:
        query = query.eq("organ_needed", organ_type)

    res = query.limit(50).execute()
    recipients = res.data or []

    results = []
    for r in recipients:
        hospital = r.get("hospitals") or {}

        # Blood compatibility filter
        if blood_group and r.get("blood_group"):
            if not blood_compatible(blood_group, r["blood_group"]):
                continue

        dist = None
        if donor_lat and donor_lng and hospital.get("lat") and hospital.get("lng"):
            dist = haversine(donor_lat, donor_lng, hospital["lat"], hospital["lng"])

        results.append({
            "id":          r["id"],
            "name":        r.get("recipient_name") or "Anonymous",
            "organ":       r.get("organ_needed") or "—",
            "blood":       r.get("blood_group") or "—",
            "urgency":     r.get("urgency_score") or 5,
            "hospital":    hospital.get("name", "Unknown"),
            "hospital_city": hospital.get("city", ""),
            "wait":        r.get("wait_label") or "—",
            "distance_km": dist,
        })

    # Rank by urgency score
    results.sort(key=lambda x: -x["urgency"])
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return results[:limit]


# ── POST /organ/pledge ────────────────────────────────────────────────────────

class OrganPledgeBody(BaseModel):
    donor_id:       str
    organs:         list[str]      # ["Heart", "Kidney", "Cornea", ...]
    family_consent: bool = False
    pledge_card_url: Optional[str] = None


@router.post("/pledge")
def create_organ_pledge(body: OrganPledgeBody):
    """
    Called by 'Get Digital Pledge Card' button on LastGift.tsx.
    Creates a pledge and returns a pledge ID for the QR code.
    """
    res = supabase.table("organ_pledges").insert({
        "donor_id":       body.donor_id,
        "organs":         body.organs,
        "family_consent": body.family_consent,
        "pledge_card_url": body.pledge_card_url,
        "is_active":      True,
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save pledge")

    pledge_id = res.data[0]["id"]

    # Add 'organ' to donor_types if not already there
    donor = supabase.table("donors").select("donor_types").eq("id", body.donor_id).single().execute()
    if donor.data:
        types = donor.data.get("donor_types") or []
        if "organ" not in types:
            supabase.table("donors").update({"donor_types": types + ["organ"]}).eq("id", body.donor_id).execute()

    return {
        "success":        True,
        "pledge_id":      pledge_id,
        "pledge_id_short": pledge_id[:8].upper(),
        "message":        "Organ pledge saved. Thank you for your generosity.",
        "organs_pledged": body.organs,
    }


# ── POST /organ/requests ──────────────────────────────────────────────────────

class OrganRequestBody(BaseModel):
    hospital_id:    str
    recipient_name: str
    organ_needed:   str
    blood_group:    str
    urgency_score:  int = 5
    lat:            Optional[float] = None
    lng:            Optional[float] = None
    wait_label:     Optional[str] = None   # e.g. "3.2 yrs"


@router.post("/requests")
def post_organ_request(body: OrganRequestBody):
    """Called by hospital to add a recipient to the waiting list."""
    res = supabase.table("organ_requests").insert({
        "hospital_id":    body.hospital_id,
        "recipient_name": body.recipient_name,
        "organ_needed":   body.organ_needed,
        "blood_group":    body.blood_group,
        "urgency_score":  body.urgency_score,
        "status":         "waiting",
        "lat":            body.lat,
        "lng":            body.lng,
        "wait_label":     body.wait_label,
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create organ request")

    return {
        "success":    True,
        "request_id": res.data[0]["id"],
        "message":    "Recipient added to waiting list.",
    }