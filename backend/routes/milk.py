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
        .limit(1) \
        .execute()

    if existing.data:
        return {
            "success":  True,
            "match_id": existing.data[0]["id"],
            "message":  "Match already exists",
        }

    match_data = {
        "request_id":    body.request_id,
        "donor_id":      body.donor_id,
        "milk_donor_id": milk_donor_id,
        "status":        "pending",
        "notified_at":   datetime.now(timezone.utc).isoformat(),
    }

    res = supabase.table("milk_matches").insert(match_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create match")

    _create_notification(
        user_id=body.donor_id,
        title="You've been matched!",
        message="A hospital has requested your milk donation. Please respond on OmniMatch.",
        notif_type="milk_match",
    )

    return {
        "success":  True,
        "match_id": res.data[0]["id"],
        "message":  "Match created and donor notified.",
    }


class MilkMatchResponseBody(BaseModel):
    donor_id: str
    status: str = Field(..., pattern="^(accepted|declined)$")


@router.post("/matches/{match_id}/respond")
def respond_to_milk_match(match_id: str, body: MilkMatchResponseBody):
    """Donor accepts or declines a match."""
    match_res = supabase.table("milk_matches") \
        .select("*, milk_requests(hospital_id, hospitals(name))") \
        .eq("id", match_id) \
        .single() \
        .execute()

    if not match_res.data:
        raise HTTPException(status_code=404, detail="Match not found")

    match = match_res.data

    if match.get("donor_id") != body.donor_id:
        raise HTTPException(status_code=403, detail="You are not authorized to respond to this match")

    supabase.table("milk_matches").update({
        "status":       body.status,
        "responded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", match_id).execute()

    try:
        supabase.table("matches").update({
            "status": body.status,
        }).eq("request_id", match.get("request_id")).eq("donor_id", body.donor_id).eq("module", "milk").execute()
    except Exception:
        pass

    request = match.get("milk_requests") or {}
    hospital_id = request.get("hospital_id")

    if hospital_id:
        if body.status == "accepted":
            _create_notification(
                user_id=hospital_id,
                title="Donor accepted!",
                message="A milk donor has accepted your request. Please coordinate pickup.",
                notif_type="milk_response",
            )
        else:
            _create_notification(
                user_id=hospital_id,
                title="Donor declined",
                message="A donor has declined. We're finding other matches.",
                notif_type="milk_response",
            )

    return {
        "success": True,
        "status":  body.status,
        "message": f"You have {body.status} this request.",
    }


@router.get("/matches/donor/{donor_id}")
def get_donor_matches(donor_id: str):
    """Get all matches for a specific donor."""
    try:
        res = supabase.table("milk_matches") \
            .select("*, milk_requests(hospital_id, daily_quantity_ml, urgency, hospitals(name, city))") \
            .eq("donor_id", donor_id) \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()
    except Exception as e:
        logger.error(f"Error fetching donor matches: {e}")
        return []

    results = []
    for m in (res.data or []):
        request = m.get("milk_requests") or {}
        hospital = request.get("hospitals") or {}

        results.append({
            "id":            m["id"],
            "request_id":    m.get("request_id"),
            "hospital_name": hospital.get("name", "Unknown Hospital"),
            "hospital_city": hospital.get("city", ""),
            "volume_ml":     request.get("daily_quantity_ml"),
            "urgency":       (request.get("urgency") or "normal").upper(),
            "status":        m.get("status"),
            "pickup_date":   m.get("pickup_date"),
            "pickup_time":   m.get("pickup_time"),
            "created_at":    m.get("created_at"),
            "responded_at":  m.get("responded_at"),
        })

    return results


class MilkMatchUpdateBody(BaseModel):
    status: str
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None


@router.patch("/matches/{match_id}")
def update_milk_match_status(match_id: str, body: MilkMatchUpdateBody):
    """Update match status (for hospital workflow)."""
    match_res = supabase.table("milk_matches") \
        .select("*, milk_requests(hospital_id), donors(id, name, mobile)") \
        .eq("id", match_id) \
        .single() \
        .execute()

    if not match_res.data:
        raise HTTPException(status_code=404, detail="Match not found")

    match = match_res.data
    donor = match.get("donors") or {}

    update_data = {"status": body.status}
    if body.pickup_date:
        update_data["pickup_date"] = body.pickup_date
    if body.pickup_time:
        update_data["pickup_time"] = body.pickup_time

    supabase.table("milk_matches").update(update_data).eq("id", match_id).execute()

    donor_id = match.get("donor_id")
    if donor_id:
        if body.status == "pickup_scheduled":
            pickup_info = f"{body.pickup_date}"
            if body.pickup_time:
                pickup_info += f" at {body.pickup_time}"
            _create_notification(
                user_id=donor_id,
                title="Pickup Scheduled!",
                message=f"Your milk donation pickup is scheduled for {pickup_info}. Please keep the milk refrigerated.",
                notif_type="milk_pickup",
            )
            if donor.get("mobile"):
                try:
                    from utils.sms import send_sms
                    send_sms(donor["mobile"], f"OmniMatch: Your milk donation pickup is scheduled for {pickup_info}. Thank you!")
                except Exception:
                    pass
        elif body.status == "collected":
            _create_notification(
                user_id=donor_id,
                title="Donation Collected",
                message="Your milk donation has been collected. Thank you for helping save lives!",
                notif_type="milk_collected",
            )
        elif body.status == "delivered":
            _create_notification(
                user_id=donor_id,
                title="Donation Delivered!",
                message="Your milk donation has reached the NICU. A baby is being nourished because of you!",
                notif_type="milk_delivered",
            )

    return {
        "success": True,
        "message": f"Match status updated to {body.status}",
    }


# ══════════════════════════════════════════════════════════════════════════════
# POST ENDPOINTS - Donation Tracking (Milk Passport)
# ══════════════════════════════════════════════════════════════════════════════

class MilkDonationBody(BaseModel):
    donor_id: str
    request_id: Optional[str] = None
    collection_date: str
    volume_ml: int = Field(..., ge=50, le=5000)
    pasteurized: bool = False
    pasteurization_date: Optional[str] = None
    pasteurization_method: Optional[str] = None   # accepted but not stored (column absent)
    receiving_hospital_id: Optional[str] = None
    receiving_infant_ref: Optional[str] = None
    # NOTE: 'notes' field removed — column does not exist in milk_donations table


@router.post("/donations")
def create_milk_donation(body: MilkDonationBody):
    """
    Log a new milk donation (Milk Passport).

    Rules:
      - If a request_id is provided, the donated volume_ml MUST exactly match
        the request's daily_quantity_ml. Any mismatch returns HTTP 400 with a
        clear message so the frontend can surface it to the donor.
      - Passport ID generation is collision-safe (retries + UUID fallback).
    """
    # ── 1. Validate donor exists ─────────────────────────────────────────────
    donor_res = supabase.table("donors").select("id, name").eq("id", body.donor_id).limit(1).execute()
    if not donor_res.data:
        logger.warning(f"[create_milk_donation] donor_id={body.donor_id} not in donors table")
        raise HTTPException(status_code=400, detail="Donor not found. Please refresh and try again.")

    # ── 2. Validate volume matches request exactly (when request_id supplied) ─
    requested_qty: Optional[int] = None
    if body.request_id:
        try:
            req_res = supabase.table("milk_requests") \
                .select("id, daily_quantity_ml, status, infant_name, hospitals(name)") \
                .eq("id", body.request_id) \
                .single() \
                .execute()
        except Exception as e:
            logger.error(f"[create_milk_donation] failed to fetch request {body.request_id}: {e}")
            raise HTTPException(status_code=400, detail="Could not verify the linked request. Please try again.")

        if not req_res.data:
            raise HTTPException(status_code=400, detail=f"Request '{body.request_id}' not found.")

        req_data = req_res.data

        # Block donations against already-fulfilled requests
        if req_data.get("status") == "fulfilled":
            raise HTTPException(
                status_code=409,
                detail="This request has already been fulfilled. No further donations are needed for it."
            )

        requested_qty = req_data.get("daily_quantity_ml")

        if requested_qty is not None and body.volume_ml != requested_qty:
            hospital_name = (req_data.get("hospitals") or {}).get("name", "the hospital")
            infant_ref = req_data.get("infant_name") or "the infant"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Volume mismatch: {hospital_name} requested exactly {requested_qty}ml/day "
                    f"for {infant_ref}, but you entered {body.volume_ml}ml. "
                    f"Please set the volume to {requested_qty}ml to proceed."
                )
            )

    # ── 3. Get milk_donor_id if exists ───────────────────────────────────────
    milk_donor = supabase.table("milk_donors").select("id").eq("donor_id", body.donor_id).limit(1).execute()
    milk_donor_id = milk_donor.data[0]["id"] if milk_donor.data else None

    # ── 4. Validate hospital if provided ─────────────────────────────────────
    if body.receiving_hospital_id:
        hosp = supabase.table("hospitals").select("id").eq("id", body.receiving_hospital_id).limit(1).execute()
        if not hosp.data:
            raise HTTPException(status_code=400, detail="Receiving hospital not found")

    # ── 5. Generate collision-safe passport ID ───────────────────────────────
    passport_id = _generate_passport_id()

    # ── 6. Calculate expiry (7 days from pasteurization or collection) ───────
    base_date_str = body.pasteurization_date or body.collection_date
    expiry = None
    try:
        base = date.fromisoformat(base_date_str[:10])
        expiry = (base + timedelta(days=7)).isoformat()
    except Exception as e:
        logger.warning(f"[create_milk_donation] expiry calc failed: {e}")

    # ── 7. Insert into milk_donations ────────────────────────────────────────
    # NOTE: 'notes' and 'pasteurization_method' intentionally excluded — columns do not exist in DB
    donation_data = {
        "passport_id":           passport_id,
        "donor_id":              body.donor_id,
        "milk_donor_id":         milk_donor_id,
        "request_id":            body.request_id,
        "collection_date":       body.collection_date,
        "volume_ml":             body.volume_ml,
        "pasteurized":           body.pasteurized,
        "pasteurization_date":   body.pasteurization_date,
        "expiry_date":           expiry,
        "receiving_hospital_id": body.receiving_hospital_id,
        "receiving_infant_ref":  body.receiving_infant_ref,
        "status":                "pasteurized" if body.pasteurized else "collected",
    }

    try:
        res = supabase.table("milk_donations").insert(donation_data).execute()
    except Exception as e:
        err_str = str(e)
        logger.error(f"[create_milk_donation] milk_donations insert failed: {err_str}")
        # Surface duplicate passport ID clearly (shouldn't happen after fix, but just in case)
        if "23505" in err_str or "duplicate key" in err_str.lower():
            raise HTTPException(
                status_code=409,
                detail="A donation record with this Passport ID already exists. Please try submitting again."
            )
        raise HTTPException(status_code=500, detail=f"Failed to create donation record: {err_str[:200]}")

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create donation record — no data returned")

    # ── 8. Write to milk_bank registry (non-critical) ────────────────────────
    try:
        vol_ml = body.volume_ml or 0
        supabase.table("milk_bank").insert({
            "passport_id":      passport_id,
            "donor_id":         body.donor_id,
            "quantity_liters":  round(vol_ml / 1000, 3),
            "pasteurized_date": body.pasteurization_date or body.collection_date,
            "expiry_date":      expiry,
            "status":           "Pasteurized" if body.pasteurized else "Available",
        }).execute()
    except Exception as e:
        logger.warning(f"[create_milk_donation] milk_bank insert failed (non-critical): {e}")

    # ── 9. Update last_donation_date on milk_donor (non-critical) ────────────
    if milk_donor_id:
        try:
            supabase.table("milk_donors").update({
                "last_donation_date": body.collection_date,
            }).eq("id", milk_donor_id).execute()
        except Exception as e:
            logger.warning(f"[create_milk_donation] milk_donor update failed (non-critical): {e}")

    # ── 10. Close linked milk_request → removes from Critical Shortages ──────
    if body.request_id:
        try:
            supabase.table("milk_requests") \
                .update({
                    "status":       "fulfilled",
                    "fulfilled_at": datetime.now(timezone.utc).isoformat(),
                }) \
                .eq("id", body.request_id) \
                .execute()
            logger.info(f"[create_milk_donation] request {body.request_id} marked fulfilled")
        except Exception as e:
            logger.warning(f"[create_milk_donation] milk_request close failed (non-critical): {e}")

    # ── 11. Auto-create milk_matches row (non-critical) ──────────────────────
    if body.receiving_hospital_id:
        try:
            match_query = supabase.table("milk_matches").select("id")
            if body.request_id:
                match_query = match_query.eq("request_id", body.request_id)
            existing_match = match_query.eq("donor_id", body.donor_id).limit(1).execute()

            if not existing_match.data:
                match_insert = {
                    "donor_id":      body.donor_id,
                    "milk_donor_id": milk_donor_id,
                    "status":        "delivered",
                    "notified_at":   datetime.now(timezone.utc).isoformat(),
                    "responded_at":  datetime.now(timezone.utc).isoformat(),
                }
                if body.request_id:
                    match_insert["request_id"] = body.request_id
                supabase.table("milk_matches").insert(match_insert).execute()
                logger.info(f"[create_milk_donation] auto-created milk_matches row for donor {body.donor_id}")
        except Exception as e:
            logger.warning(f"[create_milk_donation] auto milk_matches insert failed (non-critical): {e}")

    # ── 12. Impact tracking in central matches table (non-critical) ──────────
    try:
        supabase.table("matches").insert({
            "module":     "milk",
            "donor_id":   body.donor_id,
            "request_id": body.request_id,
            "status":     "fulfilled",
        }).execute()
    except Exception as e:
        logger.warning(f"[create_milk_donation] central matches insert failed (non-critical): {e}")

    return {
        "success":     True,
        "passport_id": passport_id,
        "donation_id": res.data[0]["id"],
        "expiry_date": expiry,
        "message":     f"Donation logged! Milk Passport ID: {passport_id}",
    }


@router.get("/donations/{passport_id}")
def get_donation_by_passport(passport_id: str):
    """Get donation details by Milk Passport ID."""
    res = supabase.table("milk_donations") \
        .select("*, donors(name), hospitals:receiving_hospital_id(name, city)") \
        .eq("passport_id", passport_id) \
        .single() \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Donation not found")

    d = res.data
    donor = d.get("donors") or {}
    hospital = d.get("hospitals") or {}

    return {
        "passport_id":         d["passport_id"],
        "donor_name":          donor.get("name", "Anonymous"),
        "collection_date":     d.get("collection_date"),
        "volume_ml":           d.get("volume_ml"),
        "pasteurized":         d.get("pasteurized"),
        "pasteurization_date": d.get("pasteurization_date"),
        "expiry_date":         d.get("expiry_date"),
        "receiving_hospital":  hospital.get("name"),
        "receiving_city":      hospital.get("city"),
        "receiving_infant_ref": d.get("receiving_infant_ref"),
        "status":              d.get("status"),
        "quality_check_passed": d.get("quality_check_passed"),
        "created_at":          d.get("created_at"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/hospital/{hospital_id}")
def get_hospital_milk_dashboard(hospital_id: str):
    """Hospital-side MilkBridge dashboard."""
    hosp = supabase.table("hospitals").select("id, name, city").eq("id", hospital_id).single().execute()
    if not hosp.data:
        raise HTTPException(status_code=404, detail="Hospital not found")

    hospital = hosp.data

    requests_res = supabase.table("milk_requests") \
        .select("*") \
        .eq("hospital_id", hospital_id) \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()

    active_requests = []
    for r in (requests_res.data or []):
        active_requests.append({
            "id":         r["id"],
            "infant_ref": r.get("infant_name", "General NICU"),
            "volume_ml":  r.get("daily_quantity_ml"),
            "urgency":    r.get("urgency", "normal"),
            "status":     r.get("status", "open"),
            "created_at": r.get("created_at"),
        })

    request_ids = [r["id"] for r in (requests_res.data or [])]
    matches = []

    if request_ids:
        matches_res = supabase.table("milk_matches") \
            .select("*, donors(name, city), milk_donors(quantity_ml_per_day)") \
            .in_("request_id", request_ids) \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()

        for m in (matches_res.data or []):
            donor = m.get("donors") or {}
            milk_donor = m.get("milk_donors") or {}
            matches.append({
                "id":            m["id"],
                "donor_id":      m.get("donor_id"),
                "milk_donor_id": m.get("milk_donor_id"),
                "donor_name":    donor.get("name", "Anonymous"),
                "city":          donor.get("city", ""),
                "quantity_ml":   milk_donor.get("quantity_ml_per_day"),
                "status":        m.get("status"),
                "request_id":    m.get("request_id"),
                "pickup_date":   m.get("pickup_date"),
                "pickup_time":   m.get("pickup_time"),
            })

    # Also pull direct donations (donors who donated without going through match flow)
    if request_ids:
        try:
            direct_donations = supabase.table("milk_donations") \
                .select("*, donors(name, city), milk_donors(quantity_ml_per_day)") \
                .eq("receiving_hospital_id", hospital_id) \
                .in_("request_id", request_ids) \
                .order("created_at", desc=True) \
                .limit(20) \
                .execute()

            existing_donor_ids = {m["donor_id"] for m in matches}
            for d in (direct_donations.data or []):
                if d.get("donor_id") not in existing_donor_ids:
                    donor = d.get("donors") or {}
                    milk_donor = d.get("milk_donors") or {}
                    matches.append({
                        "id":            d["id"],
                        "donor_id":      d.get("donor_id"),
                        "milk_donor_id": d.get("milk_donor_id"),
                        "donor_name":    donor.get("name", "Anonymous"),
                        "city":          donor.get("city", ""),
                        "quantity_ml":   d.get("volume_ml"),
                        "status":        "delivered",
                        "request_id":    d.get("request_id"),
                        "pickup_date":   None,
                        "pickup_time":   None,
                    })
                    existing_donor_ids.add(d.get("donor_id"))
        except Exception as e:
            logger.warning(f"[hospital_dashboard] direct donations fetch failed (non-critical): {e}")

    donations_res = supabase.table("milk_donations") \
        .select("*, donors(name)") \
        .eq("receiving_hospital_id", hospital_id) \
        .order("collection_date", desc=True) \
        .limit(20) \
        .execute()

    donation_history = []
    for d in (donations_res.data or []):
        donor = d.get("donors") or {}
        donation_history.append({
            "passport_id": d.get("passport_id"),
            "donor_name":  donor.get("name", "Anonymous"),
            "volume_ml":   d.get("volume_ml"),
            "date":        d.get("collection_date"),
            "status":      d.get("status"),
        })

    total_received = sum(d.get("volume_ml", 0) for d in (donations_res.data or []))
    fulfilled_count = len([d for d in (donations_res.data or []) if d.get("status") == "delivered"])

    return {
        "hospital": {
            "id":   hospital["id"],
            "name": hospital["name"],
            "city": hospital.get("city", ""),
        },
        "stats": {
            "active_requests":    len(active_requests),
            "pending_matches":    len([m for m in matches if m["status"] == "pending"]),
            "accepted_matches":   len([m for m in matches if m["status"] == "accepted"]),
            "total_received_ml":  total_received,
            "donations_received": fulfilled_count,
        },
        "active_requests":  active_requests,
        "matched_donors":   matches,
        "donation_history": donation_history,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PATCH Endpoints - Updates
# ══════════════════════════════════════════════════════════════════════════════

class MilkDonorUpdateBody(BaseModel):
    is_available: Optional[bool] = None
    quantity_ml_per_day: Optional[int] = None
    baby_age_months: Optional[int] = None
    availability_start: Optional[str] = None
    availability_end: Optional[str] = None
    is_anonymous: Optional[bool] = None


@router.patch("/donors/{milk_donor_id}")
def update_milk_donor(milk_donor_id: str, body: MilkDonorUpdateBody):
    """Update milk donor availability or profile."""
    update_data = {k: v for k, v in body.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    res = supabase.table("milk_donors").update(update_data).eq("id", milk_donor_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Milk donor not found")

    return {
        "success": True,
        "message": "Profile updated",
        "data":    res.data[0],
    }
# milk request expiry validation
