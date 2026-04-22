"""
routes/blood.py
---------------
BloodBridge — complete backend (v2)

Endpoints:
  GET  /blood/donors                    → donor cards grid (distance-sorted when lat/lng given)
  GET  /blood/requests/open             → live urgent requests (auto-expiry applied)
  POST /blood/requests                  → verified hospital posts a new blood need
  POST /blood/donors/request            → hospital targets a specific donor
  POST /blood/respond                   → donor accepts / declines a request
  GET  /blood/requests/for-donor        → donor sees compatible open requests
  GET  /blood/requests/hospital         → hospital request management table
  GET  /blood/history/donor             → donor history: received / accepted / completed
  GET  /blood/shortage                  → shortage prediction by blood group
  POST /blood/requests/{id}/fulfill     → hospital marks a request fulfilled
  POST /blood/requests/{id}/close       → hospital or cron closes / expires a request
"""

from datetime import date, datetime, timezone, timedelta
from typing import Optional
import time
import logging

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from utils.db import supabase
from utils.matching import blood_compatible, haversine, days_since
from utils.sms import alert_donors
from utils.blood_notify import notify  # thin notification helper

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Urgency → expiry hours ────────────────────────────────────────────────────
EXPIRY_HOURS = {"CRITICAL": 6, "URGENT": 12, "NORMAL": 24}

# ── Retry helper ──────────────────────────────────────────────────────────────

def _safe_execute(query, retries=3, delay=0.5):
    last_error = None
    for attempt in range(retries):
        try:
            return query.execute()
        except Exception as e:
            last_error = e
            err = str(e)
            if "10035" in err or "ReadError" in err or "ConnectError" in err:
                logger.warning(f"Socket error attempt {attempt+1}: {err[:80]}")
                time.sleep(delay * (attempt + 1))
                continue
            raise
    raise last_error


# ── Auto-expire stale open requests ──────────────────────────────────────────

def _auto_expire():
    """Close open requests whose urgency window has passed. Called inline on read paths."""
    try:
        res = supabase.table("blood_requests") \
            .select("id, urgency, created_at") \
            .eq("status", "open") \
            .execute()
        now = datetime.now(timezone.utc)
        to_close = []
        for r in (res.data or []):
            urgency = (r.get("urgency") or "normal").upper()
            max_hours = EXPIRY_HOURS.get(urgency, 12)
            created = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
            if (now - created).total_seconds() / 3600 >= max_hours:
                to_close.append(r["id"])
        if to_close:
            supabase.table("blood_requests") \
                .update({"status": "expired"}) \
                .in_("id", to_close) \
                .execute()
    except Exception as e:
        logger.warning(f"Auto-expire error (non-fatal): {e}")


# ── GET /blood/donors ─────────────────────────────────────────────────────────

@router.get("/donors")
def get_blood_donors(
    blood_group: Optional[str] = Query(None),
    city:        Optional[str] = Query(None),
    pincode:     Optional[str] = Query(None),
    lat:         Optional[float] = Query(None),
    lng:         Optional[float] = Query(None),
    limit:       int = Query(20, le=50),
):
    query = supabase.table("donors") \
        .select("id, name, city, pincode, blood_group, trust_score, is_available, is_verified, lat, lng, last_donation_date, donor_types") \
        .eq("is_available", True)

    if pincode:
        query = query.eq("pincode", pincode)

    res = query.limit(200).execute()
    donors = res.data or []
    results = []

    for d in donors:
        if city:
            donor_city = (d.get("city") or "").lower()
            if city.lower() not in donor_city:
                continue

        if blood_group and d.get("blood_group"):
            if not blood_compatible(d["blood_group"], blood_group):
                continue

        dtypes = d.get("donor_types") or []
        if dtypes and "blood" not in dtypes:
            continue

        last = d.get("last_donation_date")
        since = days_since(last)
        eligible = since is None or since >= 90

        trust_raw   = d.get("trust_score", 50)
        trust_stars = round(trust_raw / 100 * 5, 1)

        distance_km = None
        if lat and lng and d.get("lat") and d.get("lng"):
            distance_km = haversine(lat, lng, d["lat"], d["lng"])

        results.append({
            "id":                 d["id"],
            "name":               d["name"],
            "city":               d["city"] or "",
            "group":              d["blood_group"] or "—",
            "trust":              trust_stars,
            "trust_score":        trust_raw,
            "is_verified":        d.get("is_verified", False),
            "available":          d["is_available"],
            "eligible_to_donate": eligible,
            "last_donated":       f"{since} days ago" if since is not None else "No record",
            "distance_km":        round(distance_km, 1) if distance_km is not None else None,
            "distance":           f"{round(distance_km, 1)} km" if distance_km is not None else "—",
            "lat":                d.get("lat"),
            "lng":                d.get("lng"),
        })

    # Distance-aware ranking: closest + eligible + highest trust first
    if lat and lng:
        results.sort(key=lambda x: (
            -int(x["eligible_to_donate"]),
            x["distance_km"] if x["distance_km"] is not None else 9999,
            -x["trust_score"],
        ))
    else:
        results.sort(key=lambda x: (-int(x["eligible_to_donate"]), -x["trust_score"]))

    return results[:limit]


# ── GET /blood/requests/open ──────────────────────────────────────────────────

@router.get("/requests/open")
def get_open_blood_requests():
    _auto_expire()
    try:
        res = supabase.table("blood_requests") \
            .select("*, hospitals(name, city, lat, lng)") \
            .eq("status", "open") \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Database error: {e}")

    results = []
    now = datetime.now(timezone.utc)

    for r in (res.data or []):
        hospital      = r.get("hospitals") or {}
        raw_ts        = r["created_at"].replace("Z", "+00:00")
        created       = datetime.fromisoformat(raw_ts)
        elapsed       = now - created
        hours_elapsed = elapsed.total_seconds() / 3600
        urgency       = (r.get("urgency") or "normal").upper()
        max_hours     = EXPIRY_HOURS.get(urgency, 12)
        time_left_h   = max(0, max_hours - hours_elapsed)
        h = int(time_left_h)
        m = int((time_left_h - h) * 60)

        results.append({
            "id":          r["id"],
            "hospital_id": r["hospital_id"],
            "hospital":    hospital.get("name", "Unknown Hospital"),
            "group":       r["blood_group"],
            "units":       r.get("units", 1),
            "urgency":     urgency,
            "timeLeft":    f"{h}h {m:02d}m",
            "hours_left":  time_left_h,
            "city":        hospital.get("city", ""),
            "lat":         r.get("lat") or hospital.get("lat"),
            "lng":         r.get("lng") or hospital.get("lng"),
            "posted":      f"{int(elapsed.total_seconds() / 60)} min ago"
                           if elapsed.total_seconds() < 3600
                           else f"{int(hours_elapsed)}h ago",
        })

    return results


# ── POST /blood/requests ──────────────────────────────────────────────────────

class BloodRequestBody(BaseModel):
    hospital_id: str
    blood_group: str
    units:       int = 1
    urgency:     str = "urgent"
    notes:       Optional[str] = None


@router.post("/requests")
def post_blood_request(body: BloodRequestBody):
    """Verified hospital posts a general blood request."""

    # 1. Verification gate — only verified hospitals
    hosp_res = supabase.table("hospitals") \
        .select("id, name, city, is_verified, lat, lng") \
        .eq("id", body.hospital_id) \
        .single() \
        .execute()
    if not hosp_res.data:
        raise HTTPException(status_code=400, detail="Hospital not found.")
    if not hosp_res.data.get("is_verified"):
        raise HTTPException(status_code=403, detail="Only verified hospitals can post blood requests.")

    hosp      = hosp_res.data
    hosp_name = hosp["name"]
    hosp_city = hosp.get("city", "")
    hosp_lat  = hosp.get("lat")
    hosp_lng  = hosp.get("lng")

    # 2. Create the request
    req_res = supabase.table("blood_requests").insert({
        "hospital_id": body.hospital_id,
        "blood_group": body.blood_group,
        "units":       body.units,
        "urgency":     body.urgency.lower(),
        "status":      "open",
        "lat":         hosp_lat,
        "lng":         hosp_lng,
        "notes":       body.notes,
    }).execute()

    if not req_res.data:
        raise HTTPException(status_code=500, detail="Failed to create blood request.")

    request_id = req_res.data[0]["id"]

    # 3. Find compatible, available, verified donors — dedup by checking recent matches
    donors_res = supabase.table("donors") \
        .select("id, mobile, blood_group, name, lat, lng") \
        .eq("is_available", True) \
        .eq("is_verified", True) \
        .execute()

    # Fetch donors already matched to an equivalent open request for same blood_group (dedup)
    already_contacted = set()
    try:
        recent_matches = supabase.table("blood_donor_responses") \
            .select("donor_id") \
            .gte("created_at", (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()) \
            .execute()
        already_contacted = {r["donor_id"] for r in (recent_matches.data or [])}
    except Exception:
        pass

    alerted_mobiles = []
    notified_ids    = []

    for d in (donors_res.data or []):
        if not blood_compatible(d.get("blood_group", ""), body.blood_group):
            continue
        if d["id"] in already_contacted:
            continue  # dedup — skip donors already contacted in last 24h

        # Create a match/response record
        try:
            supabase.table("blood_donor_responses").insert({
                "request_id": request_id,
                "donor_id":   d["id"],
                "status":     "pending",
            }).execute()
        except Exception:
            pass

        # In-app notification
        notify(
            user_id    = d["id"],
            title      = f"🩸 Urgent: {body.blood_group} blood needed",
            message    = f"{hosp_name}, {hosp_city} needs {body.units} unit(s). Can you help?",
            notif_type = "blood_request",
            module     = "blood",
        )

        notified_ids.append(d["id"])
        if d.get("mobile"):
            alerted_mobiles.append(d["mobile"])

    # 4. SMS top 5
    sms_msg = (
        f"🩸 URGENT: {body.blood_group} blood needed ({body.units} unit/s) at "
        f"{hosp_name}, {hosp_city}. "
        f"Reply YES or visit omnimatch.in. OmniMatch."
    )
    sms_count = alert_donors(alerted_mobiles[:5], sms_msg)

    return {
        "success":        True,
        "request_id":     request_id,
        "donors_notified": len(notified_ids),
        "donors_sms":     sms_count,
        "message":        f"Request posted. {len(notified_ids)} donor(s) notified.",
    }


# ── POST /blood/donors/request ────────────────────────────────────────────────

class DonorRequestBody(BaseModel):
    hospital_id: str
    donor_id:    str
    blood_group: str
    units:       int = 1
    urgency:     str = "urgent"


@router.post("/donors/request")
def request_specific_donor(body: DonorRequestBody):
    """Verified hospital targets a specific donor."""
    # 1. Validate hospital — try the provided ID first
    hosp_data = None

    try:
        hosp = supabase.table("hospitals") \
            .select("id, name, city, is_verified") \
            .eq("id", body.hospital_id) \
            .single() \
            .execute()
        hosp_data = hosp.data
    except Exception as e:
        logger.warning(f"Hospital lookup failed for {body.hospital_id}: {e}")

    # If not found, the user might be logged in with a stale session or
    # the UUID is from a donors row. Check if this ID belongs to a donor
    # and give a helpful error message.
    if not hosp_data:
        # Check if this ID is a donor (common stale-session bug)
        try:
            donor_check = supabase.table("donors") \
                .select("id, name") \
                .eq("id", body.hospital_id) \
                .limit(1) \
                .execute()
            if donor_check.data:
                donor_name = donor_check.data[0].get("name", "Unknown")
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"You are logged in as donor '{donor_name}', not as a hospital. "
                        f"Please log out and log back in using the Hospital/Org tab "
                        f"with your hospital credentials."
                    )
                )
        except HTTPException:
            raise
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail=(
                f"Hospital not found for your account. "
                f"Please log out and log back in as a hospital."
            )
        )

    if not hosp_data.get("is_verified"):
        raise HTTPException(status_code=403, detail="Only verified hospitals can send donor requests.")

    hosp_name   = hosp_data["name"]
    hosp_city   = hosp_data.get("city", "")
    hospital_id = hosp_data["id"]

    # Donor verification gate
    donor_res = supabase.table("donors") \
        .select("id, name, mobile, is_verified") \
        .eq("id", body.donor_id) \
        .single() \
        .execute()
    if not donor_res.data:
        raise HTTPException(status_code=400, detail="Donor not found.")
    if not donor_res.data.get("is_verified"):
        raise HTTPException(status_code=403, detail="Only verified donors can accept blood requests.")

    donor_name   = donor_res.data["name"]
    donor_mobile = donor_res.data.get("mobile")

    # Reuse existing open request for same hospital + blood group if one exists
    # This prevents duplicate requests being created every time "Request" is clicked
    existing_req = supabase.table("blood_requests") \
        .select("id") \
        .eq("hospital_id", body.hospital_id) \
        .eq("blood_group", body.blood_group) \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()

    if existing_req.data:
        request_id = existing_req.data[0]["id"]
    else:
        # No existing open request — create a new one
        req_res = supabase.table("blood_requests").insert({
            "hospital_id": body.hospital_id,
            "blood_group": body.blood_group,
            "units":       body.units,
            "urgency":     body.urgency.lower(),
            "status":      "open",
        }).execute()
        if not req_res.data:
            raise HTTPException(status_code=500, detail="Failed to create blood request.")
        request_id = req_res.data[0]["id"]

    # Check if this donor is already linked to this request
    already = supabase.table("blood_donor_responses") \
        .select("id") \
        .eq("request_id", request_id) \
        .eq("donor_id", body.donor_id) \
        .execute()

    if already.data:
        return {
            "success":    True,
            "request_id": request_id,
            "donor_name": donor_name,
            "sms_sent":   False,
            "message":    f"{donor_name} has already been contacted for this request.",
        }

    # Create donor response record (pending)
    try:
        supabase.table("blood_donor_responses").insert({
            "request_id":  request_id,
            "donor_id":    body.donor_id,
            "status":      "pending",
            "is_direct":   True,
        }).execute()
    except Exception:
        pass

    # Notify donor
    notify(
        user_id    = body.donor_id,
        title      = f"🩸 {hosp_name} requested you specifically!",
        message    = f"They need {body.blood_group} blood ({body.units} unit(s)). Please respond.",
        notif_type = "blood_request",
        module     = "blood",
    )
    # Notify hospital
    notify(
        user_id    = body.hospital_id,
        title      = "✅ Donor request sent",
        message    = f"Your {body.blood_group} blood request was sent to {donor_name}.",
        notif_type = "blood_response",
        module     = "blood",
    )

    sms_count = 0
    if donor_mobile:
        sms_msg = (
            f"🩸 {hosp_name}, {hosp_city} needs {body.blood_group} blood ({body.units} unit/s). "
            f"You were specifically requested! Reply YES or visit omnimatch.in."
        )
        sms_count = alert_donors([donor_mobile], sms_msg)

    return {
        "success":    True,
        "request_id": request_id,
        "donor_name": donor_name,
        "sms_sent":   sms_count > 0,
        "message":    f"Request sent to {donor_name}. {'SMS alert sent!' if sms_count else 'In-app notification sent.'}",
    }


# ── POST /blood/respond ───────────────────────────────────────────────────────

class DonorRespondBody(BaseModel):
    request_id: str
    donor_id:   str
    action:     str  # "accept" | "decline"


@router.post("/respond")
def donor_respond(body: DonorRespondBody):
    """Verified donor accepts or declines a blood request."""
    if body.action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action must be 'accept' or 'decline'.")

    # Verification gate
    donor_res = supabase.table("donors") \
        .select("id, name, is_verified, blood_group") \
        .eq("id", body.donor_id) \
        .single() \
        .execute()
    if not donor_res.data:
        raise HTTPException(status_code=400, detail="Donor not found.")
    if not donor_res.data.get("is_verified"):
        raise HTTPException(status_code=403, detail="Only verified donors can respond to blood requests.")

    donor_name = donor_res.data["name"]
    new_status = "accepted" if body.action == "accept" else "declined"

    # Upsert or update the response row — update ALL rows for this donor+request
    try:
        existing = supabase.table("blood_donor_responses") \
            .select("id") \
            .eq("request_id", body.request_id) \
            .eq("donor_id", body.donor_id) \
            .execute()

        if existing.data:
            # Update ALL rows (there might be duplicates from old bug)
            result = supabase.table("blood_donor_responses") \
                .update({"status": new_status, "responded_at": datetime.now(timezone.utc).isoformat()}) \
                .eq("request_id", body.request_id) \
                .eq("donor_id", body.donor_id) \
                .execute()
            logger.info(f"Updated donor response: {result.data}")
        else:
            result = supabase.table("blood_donor_responses").insert({
                "request_id":   body.request_id,
                "donor_id":     body.donor_id,
                "status":       new_status,
                "responded_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            logger.info(f"Inserted donor response: {result.data}")
    except Exception as e:
        logger.error(f"blood_donor_responses error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save response: {e}")

    # If accepted → update request status + notify hospital
    if body.action == "accept":
        req_res = supabase.table("blood_requests") \
            .select("hospital_id, blood_group, units") \
            .eq("id", body.request_id) \
            .single() \
            .execute()
        if req_res.data:
            supabase.table("blood_requests") \
                .update({"status": "donor_contacted"}) \
                .eq("id", body.request_id) \
                .execute()
