"""
routes/milk.py
--------------
Production-grade MilkBridge endpoints for neonatal milk donation coordination.

Endpoints:
  GET  /milk/donors               -> Active donor cards with filtering
  GET  /milk/donors/{donor_id}    -> Single donor details
  GET  /milk/bank                 -> Milk Bank pasteurization log table
  GET  /milk/shortage-alerts      -> Open shortage alert cards
  GET  /milk/requests/open        -> All open requests with urgency timers
  GET  /milk/requests/for-donor   -> Requests matching a donor's location
  POST /milk/register-donor       -> Register as milk donor (upsert)
  POST /milk/requests             -> Hospital posts a shortage request
  POST /milk/match                -> Smart matching: find donors for a request
  POST /milk/matches/{id}/respond -> Donor accepts/declines a match
  POST /milk/donations            -> Log a new milk donation (Milk Passport)
  GET  /milk/donations/{passport_id} -> Get donation by passport ID
  GET  /milk/dashboard/hospital   -> Hospital dashboard data
  PATCH /milk/donors/{id}         -> Update donor availability/profile
"""

from datetime import date, datetime, timezone, timedelta
from typing import Optional, List
import time as time_module
import logging
import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, validator

from utils.db import supabase
from utils.matching import haversine, days_since
from utils.sms import alert_donors

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Retry helper for Windows socket issues ────────────────────────────────────

def _safe_execute(query, retries=3, delay=0.5):
    """Execute a Supabase query with retry on socket errors."""
    last_error = None
    for attempt in range(retries):
        try:
            return query.execute()
        except Exception as e:
            last_error = e
            error_str = str(e)
            if "10035" in error_str or "ReadError" in error_str or "ConnectError" in error_str:
                logger.warning(f"Socket error on attempt {attempt + 1}, retrying: {error_str[:100]}")
                time_module.sleep(delay * (attempt + 1))
                continue
            raise
    raise last_error


# ── Notification helper ───────────────────────────────────────────────────────

def _create_notification(user_id: str, title: str, message: str, notif_type: str, module: str = "milk"):
    """Insert a row into the notifications table. Never raises - non-critical."""
    try:
        supabase.table("notifications").insert({
            "user_id":  user_id,
            "title":    title,
            "message":  message,
            "type":     notif_type,
            "module":   module,
            "is_read":  False,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to create notification: {e}")


def _generate_passport_id() -> str:
    """
    Generate a unique Milk Passport ID with full collision protection.

    Strategy:
      1. Query the highest existing sequence number for the current year.
      2. Try up to 5 candidates (incrementing seq each time).
      3. For each candidate, verify it doesn't already exist in the DB.
      4. If all 5 attempts collide, fall back to a timestamp+UUID suffix
         which is practically impossible to collide.
    """
    yr = datetime.now().strftime("%Y")

    for attempt in range(5):
        try:
            res = supabase.table("milk_donations") \
                .select("passport_id") \
                .like("passport_id", f"MP-{yr}-%") \
                .order("passport_id", desc=True) \
                .limit(1) \
                .execute()

            if res.data:
                last_id = res.data[0]["passport_id"]
                # Handle both MP-2026-000001 and MP-2026-000001-AB12 formats safely
                parts = last_id.split("-")
                # parts[2] is always the zero-padded seq portion
                numeric_part = "".join(filter(str.isdigit, parts[2])) if len(parts) > 2 else "0"
                seq = int(numeric_part) + 1 + attempt
            else:
                seq = 1 + attempt

        except Exception:
            # If DB query fails entirely, use time-based seed + attempt offset
            seq = int(datetime.now().strftime("%H%M%S")) + attempt

        candidate = f"MP-{yr}-{seq:06d}"

        # Verify this exact ID doesn't already exist before committing to it
        try:
            check = supabase.table("milk_donations") \
                .select("passport_id") \
                .eq("passport_id", candidate) \
                .limit(1) \
                .execute()
            if not check.data:
                return candidate
            logger.warning(f"[_generate_passport_id] collision on {candidate}, retrying (attempt {attempt + 1})")
        except Exception:
            # If the existence-check itself fails, return optimistically.
            # The DB unique constraint is the final safety net.
            return candidate

    # Final fallback: HHMMSS + 4-char random hex — astronomically unlikely to collide
    ts = datetime.now().strftime("%H%M%S")
    rand = uuid.uuid4().hex[:4].upper()
    fallback = f"MP-{yr}-{ts}-{rand}"
    logger.warning(f"[_generate_passport_id] all 5 attempts collided, using fallback: {fallback}")
    return fallback


# ══════════════════════════════════════════════════════════════════════════════
# GET ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/donors")
def get_milk_donors(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    limit: int = Query(50, le=100),
):
    """
    Powers the 'Active Donors' card grid on MilkBridge.tsx.
    """
    query = supabase.table("milk_donors") \
        .select("*, donors(id, name, city, pincode, is_verified, trust_score, lat, lng)") \
        .eq("is_available", True)

    res = _safe_execute(query.limit(200))

    results = []
    for md in (res.data or []):
        donor = md.get("donors") or {}

        if city:
            donor_city = (donor.get("city") or "").lower()
            if city.lower() not in donor_city:
                continue

        age_m = md.get("baby_age_months")
        qty = md.get("quantity_ml_per_day")

        try:
            impact_res = supabase.table("matches") \
                .select("id", count="exact") \
                .eq("donor_id", md.get("donor_id")) \
                .eq("module", "milk") \
                .eq("status", "fulfilled") \
                .execute()
            babies_helped = impact_res.count or 0
        except Exception:
            babies_helped = 0

        impact_label = f"{babies_helped} {'babies' if babies_helped != 1 else 'baby'} fed" if babies_helped else "New donor"

        distance_km = None
        if lat and lng and donor.get("lat") and donor.get("lng"):
            distance_km = haversine(lat, lng, donor["lat"], donor["lng"])

        is_anonymous = md.get("is_anonymous", False)
        display_name = (
            f"Donor #{str(md['id'])[:8]}"
            if is_anonymous
            else donor.get("name", "Anonymous Donor")
        )

        results.append({
            "id":              md["id"],
            "donor_id":        md.get("donor_id"),
            "name":            display_name,
            "babyAge":         f"{age_m} months" if age_m is not None else "",
            "qty":             f"{qty}ml/day" if qty else "",
            "area":            donor.get("city", ""),
            "verified":        donor.get("is_verified", False),
            "is_screened":     md.get("screening_status") == "cleared",
            "is_anonymous":    is_anonymous,
            "impact":          impact_label,
            "trust_score":     donor.get("trust_score", 50),
            "distance_km":     distance_km,
            "distance":        f"{distance_km:.1f} km" if distance_km is not None else "",
        })

    results.sort(key=lambda x: -x["trust_score"])
    return results[:limit]


@router.get("/donors/{milk_donor_id}")
def get_milk_donor_detail(milk_donor_id: str):
    """Get detailed information about a specific milk donor."""
    try:
        res = supabase.table("milk_donors") \
            .select("*, donors(id, name, city, pincode, is_verified, trust_score, lat, lng)") \
            .eq("id", milk_donor_id) \
            .single() \
            .execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Milk donor not found")

    if not res.data:
        raise HTTPException(status_code=404, detail="Milk donor not found")

    md = res.data
    donor = md.get("donors") or {}

    return {
        "id":                  md["id"],
        "donor_id":            md.get("donor_id"),
        "name":                donor.get("name", "Anonymous") if not md.get("is_anonymous") else f"Donor #{str(md['id'])[:8]}",
        "baby_age_months":     md.get("baby_age_months"),
        "quantity_ml_per_day": md.get("quantity_ml_per_day"),
        "city":                md.get("city") or donor.get("city", ""),
        "pincode":             md.get("pincode") or donor.get("pincode", ""),
        "screening_status":    md.get("screening_status"),
        "screening_date":      md.get("screening_date"),
        "is_available":        md.get("is_available"),
        "is_anonymous":        md.get("is_anonymous"),
        "availability_start":  md.get("availability_start"),
        "availability_end":    md.get("availability_end"),
        "verified":            donor.get("is_verified", False),
        "trust_score":         donor.get("trust_score", 50),
    }


@router.get("/bank")
def get_milk_bank():
    """
    Powers the 'Milk Bank - Pasteurization Log' table on MilkBridge.tsx.
    Reads from BOTH milk_donations (real logged donations) and milk_bank (legacy).
    """
    today = date.today()
    results = []
    seen_passport_ids = set()

    def fmt_date(d):
        if not d:
            return ""
        try:
            return date.fromisoformat(d[:10]).strftime("%b %d")
        except Exception:
            return d

    def get_status(expiry_str, base_status="Available"):
        if not expiry_str:
            return base_status
        try:
            expiry_date = date.fromisoformat(expiry_str[:10])
            days_left = (expiry_date - today).days
            if days_left < 0:
                return "Expired"
            elif days_left <= 2:
                return "Low Stock"
        except Exception:
            pass
        return base_status

    # Primary source: milk_donations
    try:
        donations_res = supabase.table("milk_donations") \
            .select("*, donors(name)") \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()

        for row in (donations_res.data or []):
            donor = row.get("donors") or {}
            passport_id = row.get("passport_id", "")
            seen_passport_ids.add(passport_id)

            raw_status = row.get("status", "collected")
            status_map = {
                "collected":   "Collected",
                "pasteurized": "Pasteurized",
                "in_transit":  "In Transit",
                "delivered":   "Delivered",
                "expired":     "Expired",
                "rejected":    "Rejected",
            }
            display_status = status_map.get(raw_status, raw_status.title())
            display_status = get_status(row.get("expiry_date"), display_status)

            vol_ml = row.get("volume_ml")
            qty_str = ""
            if vol_ml:
                if vol_ml >= 1000:
                    qty_str = f"{vol_ml/1000:.1f}L"
                else:
                    qty_str = f"{vol_ml}ml"

            cold_chain = row.get("cold_chain_status") or raw_status

            results.append({
                "id":          passport_id,
                "from":        donor.get("name", "Anonymous"),
                "donor_id":    row.get("donor_id", ""),
                "pasteurized": fmt_date(row.get("pasteurization_date") or row.get("collection_date")),
                "expiry":      fmt_date(row.get("expiry_date")),
                "qty":         qty_str,
                "status":      display_status,
                "cold_chain":  cold_chain,
            })
    except Exception as e:
        logger.warning(f"[get_milk_bank] milk_donations read failed: {e}")

    # Fallback: legacy milk_bank table
    try:
        bank_res = supabase.table("milk_bank") \
            .select("*, donors(name)") \
            .order("pasteurized_date", desc=True) \
            .limit(50) \
            .execute()

        for row in (bank_res.data or []):
            passport_id = row.get("passport_id", "")
            if passport_id in seen_passport_ids:
                continue
            donor = row.get("donors") or {}
            status = get_status(row.get("expiry_date"), row.get("status", "Available"))
            qty = row.get("quantity_liters")
            results.append({
                "id":          passport_id,
                "from":        donor.get("name", "Anonymous"),
                "donor_id":    row.get("donor_id", ""),
                "pasteurized": fmt_date(row.get("pasteurized_date")),
                "expiry":      fmt_date(row.get("expiry_date")),
                "qty":         f"{qty}L" if qty else "",
                "status":      status,
                "cold_chain":  status,
            })
    except Exception as e:
        logger.warning(f"[get_milk_bank] milk_bank read failed: {e}")

    return results


@router.get("/shortage-alerts")
def get_milk_shortage_alerts():
    """
    Powers the 'Shortage Alert' cards on MilkBridge.tsx.
    Returns ONLY open milk requests.
    """
    res = supabase.table("milk_requests") \
        .select("*, hospitals(name, city)") \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .execute()

    results = []
    now = datetime.now(timezone.utc)

    for r in (res.data or []):
        hospital = r.get("hospitals") or {}
        qty = r.get("daily_quantity_ml")

        raw_ts = r["created_at"].replace("Z", "+00:00")
        try:
            created = datetime.fromisoformat(raw_ts)
            elapsed = now - created
            hours_elapsed = elapsed.total_seconds() / 3600
            time_left_hours = max(0, 24 - hours_elapsed)
            h = int(time_left_hours)
            m = int((time_left_hours - h) * 60)
            time_left = f"{h}h {m:02d}m"
        except Exception:
            time_left = ""
            time_left_hours = 24

        results.append({
            "id":              r["id"],
            "hospital":        hospital.get("name", "Unknown Hospital"),
            "city":            hospital.get("city", ""),
            "infant_name":     r.get("infant_name"),
            "quantity_needed": f"{qty}ml/day" if qty else "",
            "volume_ml":       qty,
            "urgency":         (r.get("urgency") or "normal").upper(),
            "time_left":       time_left,
            "hours_left":      time_left_hours,
            "message":         f"NICU at {hospital.get('name','')}, {hospital.get('city','')} needs "
                              f"<strong>{qty}ml/day</strong> for premature infants."
                              if qty else "NICU needs donor milk for premature infants.",
        })

    return results


@router.get("/requests/open")
def get_open_milk_requests():
    """Get all open milk requests with urgency timers."""
    return get_milk_shortage_alerts()


@router.get("/requests/for-donor")
def get_requests_for_donor(
    donor_id: str = Query(..., description="The donor's user ID"),
):
    """Get milk requests matching a donor's location and availability."""
    try:
        donor_res = supabase.table("milk_donors") \
            .select("*, donors(city, pincode, lat, lng)") \
            .eq("donor_id", donor_id) \
            .eq("is_available", True) \
            .limit(1) \
            .execute()

        if not donor_res.data:
            return []

        md = donor_res.data[0]
        donor = md.get("donors") or {}
        donor_pincode = md.get("pincode") or donor.get("pincode")
        donor_lat = donor.get("lat")
        donor_lng = donor.get("lng")

        req_res = supabase.table("milk_requests") \
            .select("*, hospitals(name, city, pincode, lat, lng)") \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .limit(30) \
            .execute()

        now = datetime.now(timezone.utc)
        results = []

        for r in (req_res.data or []):
            hospital = r.get("hospitals") or {}

            distance_km = None
            hosp_lat = hospital.get("lat")
            hosp_lng = hospital.get("lng")
            if donor_lat and donor_lng and hosp_lat and hosp_lng:
                distance_km = haversine(donor_lat, donor_lng, hosp_lat, hosp_lng)

            req_pincode = r.get("pincode") or hospital.get("pincode", "")
            pincode_match = donor_pincode and req_pincode and donor_pincode == req_pincode

            raw_ts = r["created_at"].replace("Z", "+00:00")
            try:
                created = datetime.fromisoformat(raw_ts)
                elapsed = now - created
                hours_elapsed = elapsed.total_seconds() / 3600
            except Exception:
                hours_elapsed = 0
                elapsed = None

            urgency = (r.get("urgency") or "normal").upper()
            max_hours = {"CRITICAL": 6, "URGENT": 12, "NORMAL": 24}.get(urgency, 24)
            time_left_hours = max(0, max_hours - hours_elapsed)
            h = int(time_left_hours)
            m = int((time_left_hours - h) * 60)

            qty = r.get("daily_quantity_ml") or r.get("volume_needed_ml")

            posted = ""
            if elapsed is not None:
                total_secs = elapsed.total_seconds()
                posted = f"{int(total_secs / 60)} min ago" if total_secs < 3600 else f"{int(hours_elapsed)}h ago"

            results.append({
                "id":            r["id"],
                "hospital":      hospital.get("name", "Unknown Hospital"),
                "city":          hospital.get("city", ""),
                "volume_ml":     qty,
                "quantity":      f"{qty}ml" if qty else "",
                "urgency":       urgency,
                "timeLeft":      f"{h}h {m:02d}m",
                "hours_left":    time_left_hours,
                "distance_km":   distance_km,
                "distance":      f"{distance_km:.1f} km" if distance_km else "",
                "pincode_match": pincode_match,
                "posted":        posted,
            })

        results.sort(key=lambda x: (
            0 if x["pincode_match"] else 1,
            x["distance_km"] if x["distance_km"] is not None else 9999,
            {"CRITICAL": 0, "URGENT": 1, "NORMAL": 2}.get(x["urgency"], 2)
        ))

        return results

    except Exception as e:
        logger.error(f"Error in get_requests_for_donor: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch requests. Please try again.")


# ══════════════════════════════════════════════════════════════════════════════
# POST ENDPOINTS - Registration
# ══════════════════════════════════════════════════════════════════════════════

class MilkDonorBody(BaseModel):
    donor_id: str
    baby_age_months: int = Field(..., ge=0, le=24)
    quantity_ml_per_day: int = Field(..., ge=50, le=2000)
    pickup_location: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    test_doc_url: Optional[str] = None
    health_score: int = Field(default=70, ge=0, le=100)
    is_anonymous: bool = False
    availability_start: Optional[str] = "08:00"
    availability_end: Optional[str] = "20:00"

    @validator("pincode")
    def validate_pincode(cls, v):
        if v and len(v) != 6:
            raise ValueError("Pincode must be 6 digits")
        if v and not v.isdigit():
            raise ValueError("Pincode must contain only digits")
        return v


@router.post("/register-donor")
def register_milk_donor(body: MilkDonorBody):
    """Register or update a milk donor profile."""
    if not body.donor_id or not body.donor_id.strip():
        raise HTTPException(
            status_code=400,
            detail="donor_id is missing. Please log in again and retry."
        )

    logger.info(f"[register-donor] Received donor_id='{body.donor_id}'")

    try:
        donor_check = supabase.table("donors") \
            .select("id, name, city, pincode, mobile") \
            .eq("id", body.donor_id) \
            .limit(1) \
            .execute()
    except Exception as e:
        logger.error(f"[register-donor] DB error checking donor_id='{body.donor_id}': {e}")
        raise HTTPException(status_code=500, detail="Database error. Please try again.")

    if not donor_check.data:
        logger.warning(f"[register-donor] donor_id='{body.donor_id}' not found in donors table")
        raise HTTPException(
            status_code=400,
            detail=f"No donor profile found for this account. "
                   f"Your user ID '{body.donor_id[:8]}...' is not in the donors table. "
                   f"Please log out, register again at /register, then log in."
        )

    existing = supabase.table("milk_donors") \
        .select("id") \
        .eq("donor_id", body.donor_id) \
        .limit(1) \
        .execute()

    milk_donor_data = {
        "donor_id":            body.donor_id,
        "baby_age_months":     body.baby_age_months,
        "quantity_ml_per_day": body.quantity_ml_per_day,
        "health_score":        body.health_score,
        "test_doc_url":        body.test_doc_url,
        "is_available":        True,
    }

    if existing.data:
        res = supabase.table("milk_donors") \
            .update(milk_donor_data) \
            .eq("donor_id", body.donor_id) \
            .execute()
        message = "Milk donor profile updated successfully!"
    else:
        res = supabase.table("milk_donors").insert(milk_donor_data).execute()
        message = "Registered as milk donor! You'll be notified when NICUs need your milk."

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to register milk donor")

    # Add 'milk' to donor_types
    try:
        donor = supabase.table("donors").select("donor_types").eq("id", body.donor_id).single().execute()
        if donor.data:
            types = donor.data.get("donor_types") or []
            if "milk" not in types:
                update = {"donor_types": list(set(types + ["milk"]))}
                if body.city or body.pickup_location:
                    update["city"] = body.city or body.pickup_location
                if body.pincode:
                    update["pincode"] = body.pincode
                supabase.table("donors").update(update).eq("id", body.donor_id).execute()
    except Exception as e:
        logger.warning(f"[register-donor] donor_types update failed (non-critical): {e}")

    return {
        "success":       True,
        "milk_donor_id": res.data[0]["id"],
        "message":       message,
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST ENDPOINTS - Hospital Requests
# ══════════════════════════════════════════════════════════════════════════════

class MilkRequestBody(BaseModel):
    hospital_id: str
    infant_name: Optional[str] = None
    daily_quantity_ml: int = Field(..., ge=50, le=5000)
    urgency: Optional[str] = "normal"
    pincode: Optional[str] = None


@router.post("/requests")
def post_milk_request(body: MilkRequestBody):
    """Hospital posts a milk shortage request."""
    try:
        hosp = supabase.table("hospitals") \
            .select("id, name, city, lat, lng") \
            .eq("id", body.hospital_id) \
            .single() \
            .execute()
    except Exception:
        hosp = None

    if not hosp or not hosp.data:
        raise HTTPException(
            status_code=400,
            detail=f"Hospital ID not found: {body.hospital_id}. Please verify the hospital is registered."
        )

    hosp_data = hosp.data
    hosp_name = hosp_data["name"]
    hosp_city = hosp_data.get("city", "")

    request_data = {
        "hospital_id":       body.hospital_id,
        "infant_name":       body.infant_name,
        "daily_quantity_ml": body.daily_quantity_ml,
        "status":            "open",
        "urgency":           (body.urgency or "normal").lower(),
        "pincode":           body.pincode if body.pincode else None,
    }

    try:
        res = supabase.table("milk_requests").insert(request_data).execute()
    except Exception as e:
        logger.error(f"Failed to create milk request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create milk request: {str(e)[:200]}")

    if res.data:
        request_id = res.data[0]["id"]
    else:
        try:
            refetch = supabase.table("milk_requests") \
                .select("id") \
                .eq("hospital_id", body.hospital_id) \
                .eq("status", "open") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()
            request_id = refetch.data[0]["id"] if refetch.data else str(uuid.uuid4())
        except Exception:
            request_id = str(uuid.uuid4())

    # Find and notify all available donors
    donors_res = supabase.table("milk_donors") \
        .select("*, donors(id, name, mobile)") \
        .eq("is_available", True) \
        .execute()

    alerted_mobiles = []
    notified_count = 0

    for md in (donors_res.data or []):
        donor = md.get("donors") or {}
        donor_id = donor.get("id")
        if not donor_id:
            continue

        _create_notification(
            user_id=donor_id,
            title=f"Milk needed at {hosp_name}",
            message=f"{hosp_name}, {hosp_city} needs {body.daily_quantity_ml}ml/day for NICU. Can you help?",
            notif_type="milk_request",
        )
        notified_count += 1

        if donor.get("mobile"):
            alerted_mobiles.append(donor["mobile"])

    sms_msg = (
        f"NICU ALERT: {hosp_name}, {hosp_city} needs {body.daily_quantity_ml}ml/day of donor milk. "
        f"Reply YES or visit omnimatch.in. OmniMatch MilkBridge."
    )
    sms_count = alert_donors(alerted_mobiles[:5], sms_msg)

    _create_notification(
        user_id=body.hospital_id,
        title="Milk request posted",
        message=f"Your request for {body.daily_quantity_ml}ml/day has been broadcast to {notified_count} donors.",
        notif_type="milk_response",
    )

    return {
        "success":         True,
        "request_id":      request_id,
        "donors_notified": notified_count,
        "sms_sent":        sms_count,
        "message":         f"Shortage alert posted. {notified_count} donor(s) notified.",
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST ENDPOINTS - Smart Matching
# ══════════════════════════════════════════════════════════════════════════════

class MilkMatchBody(BaseModel):
    request_id: str
    max_distance_km: float = Field(default=50, ge=1, le=500)
    min_quantity_ml: Optional[int] = None
    limit: int = Field(default=10, ge=1, le=50)


@router.post("/match")
def find_milk_matches(body: MilkMatchBody):
    """Smart matching: find compatible donors for a milk request."""
    try:
        req = supabase.table("milk_requests") \
            .select("*, hospitals(name, city, pincode, lat, lng)") \
            .eq("id", body.request_id) \
            .single() \
            .execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Request not found")

    if not req.data:
        raise HTTPException(status_code=404, detail="Request not found")

    request = req.data
    hospital = request.get("hospitals") or {}
    req_pincode = request.get("pincode") or hospital.get("pincode", "")
    req_lat = request.get("lat") or hospital.get("lat")
    req_lng = request.get("lng") or hospital.get("lng")
    required_qty = request.get("daily_quantity_ml") or body.min_quantity_ml

    donors_res = supabase.table("milk_donors") \
        .select("*, donors(id, name, city, pincode, is_verified, trust_score, lat, lng, mobile)") \
        .eq("is_available", True) \
        .execute()

    matches = []

    for md in (donors_res.data or []):
        donor = md.get("donors") or {}
        donor_pincode = md.get("pincode") or donor.get("pincode", "")

        donor_qty = md.get("quantity_ml_per_day", 0)
        if body.min_quantity_ml and donor_qty < body.min_quantity_ml:
            continue

        distance_km = None
        if req_lat and req_lng and donor.get("lat") and donor.get("lng"):
            distance_km = haversine(req_lat, req_lng, donor["lat"], donor["lng"])
            if distance_km > body.max_distance_km:
                continue

        pincode_match = req_pincode and donor_pincode and req_pincode == donor_pincode

        score = 50
        if required_qty and donor_qty >= required_qty:
            score += 20
        elif required_qty:
            score += int((donor_qty / required_qty) * 20)

        if pincode_match:
            score += 20
        elif distance_km is not None:
            score += max(0, int(20 - (distance_km / body.max_distance_km) * 20))

        score += int(donor.get("trust_score", 50) / 10)

        display_name = donor.get("name", "Anonymous Donor")
        if md.get("is_anonymous"):
            display_name = f"Donor #{str(md['id'])[:8]}"

        matches.append({
            "milk_donor_id": md["id"],
            "donor_id":      donor.get("id"),
            "name":          display_name,
            "city":          md.get("city") or donor.get("city", ""),
            "pincode":       donor_pincode,
            "quantity_ml":   donor_qty,
            "distance_km":   distance_km,
            "distance":      f"{distance_km:.1f} km" if distance_km else "Same area",
            "match_score":   min(100, score),
            "trust_score":   donor.get("trust_score", 50),
            "verified":      donor.get("is_verified", False),
            "is_anonymous":  md.get("is_anonymous", False),
            "pincode_match": pincode_match,
        })

    matches.sort(key=lambda x: -x["match_score"])

    return {
        "request_id":      body.request_id,
        "hospital":        hospital.get("name", "Unknown"),
        "city":            hospital.get("city", ""),
        "quantity_needed": request.get("daily_quantity_ml"),
        "urgency":         request.get("urgency", "normal"),
        "total_matches":   len(matches),
        "matches":         matches[:body.limit],
    }


class MilkMatchCreateBody(BaseModel):
    request_id: str
    donor_id: str
    milk_donor_id: Optional[str] = None


@router.post("/matches")
def create_milk_match(body: MilkMatchCreateBody):
    """Create a match record between a donor and a request."""
    req = supabase.table("milk_requests").select("id, hospital_id").eq("id", body.request_id).single().execute()
    if not req.data:
        raise HTTPException(status_code=404, detail="Request not found")

    donor = supabase.table("donors").select("id, name, mobile").eq("id", body.donor_id).single().execute()
    if not donor.data:
        raise HTTPException(status_code=404, detail="Donor not found")

    milk_donor_id = body.milk_donor_id
    if not milk_donor_id:
        try:
            md_res = supabase.table("milk_donors") \
                .select("id") \
                .eq("donor_id", body.donor_id) \
                .eq("is_available", True) \
                .limit(1) \
                .execute()
            if md_res.data:
                milk_donor_id = md_res.data[0]["id"]
        except Exception:
            pass

    existing = supabase.table("milk_matches") \
        .select("id") \
        .eq("request_id", body.request_id) \
        .eq("donor_id", body.donor_id) \