"""
routes/dashboard.py
-------------------
Endpoints consumed by Dashboard.tsx (DonorDashboard, HospitalDashboard, AdminDashboard):

  GET  /dashboard/donor/{id}      → DonorDashboard: profile card, stats, urgent nearby, history
  GET  /dashboard/hospital/{id}   → HospitalDashboard: stats, active requests
  GET  /dashboard/admin           → AdminDashboard: verif queue, flagged, stats
  POST /dashboard/admin/verify    → approve/reject donor or hospital
"""

import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date

from utils.db import supabase
from utils.matching import days_since, days_until, blood_compatible

logger = logging.getLogger(__name__)


def _safe_execute(query, retries=2, delay=0.3):
    """Execute a Supabase query with retry on transient errors."""
    for attempt in range(retries + 1):
        try:
            return query.execute()
        except Exception as e:
            if attempt < retries:
                logger.warning(f"Supabase query retry {attempt+1}/{retries}: {e}")
                time.sleep(delay)
            else:
                raise

router = APIRouter()


# ── GET /dashboard/donor/{id} ─────────────────────────────────────────────────

@router.get("/donor/{donor_id}")
def get_donor_dashboard(donor_id: str):
    """
    Powers DonorDashboard component in Dashboard.tsx.
    Returns:
      - profile card data (name, blood group, trust_stars, next eligible date)
      - stats row (total donations, lives impacted, trust score, next eligible)
      - urgent_requests nearby (blood + platelet)
      - donation_history table rows
    """
    # Profile
    donor = supabase.table("donors") \
        .select("*") \
        .eq("id", donor_id) \
        .single() \
        .execute()

    if not donor.data:
        raise HTTPException(status_code=404, detail="Donor not found")

    d = donor.data
    since = days_since(d.get("last_donation_date"))
    next_eligible_days = max(0, 90 - since) if since is not None else 0

    if next_eligible_days == 0:
        next_eligible_label = "Now"
    else:
        from datetime import timedelta, datetime
        ne_date = date.today() + timedelta(days=next_eligible_days)
        next_eligible_label = ne_date.strftime("%b %d")

    trust_raw   = d.get("trust_score", 50)
    trust_stars = round(trust_raw / 100 * 5, 1)

    # Donation history from matches (matches has no FK to blood_requests, so fetch separately)
    history_res = supabase.table("matches") \
        .select("module, request_id, created_at") \
        .eq("donor_id", donor_id) \
        .eq("status", "fulfilled") \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()

    history = []
    blood_ids = [m["request_id"] for m in (history_res.data or []) if m.get("module") == "blood" and m.get("request_id")]
    platelet_ids = [m["request_id"] for m in (history_res.data or []) if m.get("module") == "platelet" and m.get("request_id")]

    blood_map = {}
    if blood_ids:
        blood_req = supabase.table("blood_requests").select("id, blood_group, hospital_id").in_("id", blood_ids).execute()
        for r in (blood_req.data or []):
            blood_map[r["id"]] = dict(r, hospital_name="Unknown")
        hosp_ids = [r["hospital_id"] for r in (blood_req.data or []) if r.get("hospital_id")]
        if hosp_ids:
            hosp_res = supabase.table("hospitals").select("id, name").in_("id", hosp_ids).execute()
            hosp_map = {h["id"]: h["name"] for h in (hosp_res.data or [])}
            for rid, r in blood_map.items():
                r["hospital_name"] = hosp_map.get(r.get("hospital_id"), "Unknown")

    platelet_map = {}
    if platelet_ids:
        plat_req = supabase.table("platelet_requests").select("id, blood_group, hospital_id").in_("id", platelet_ids).execute()
        for r in (plat_req.data or []):
            platelet_map[r["id"]] = dict(r, hospital_name="Unknown")
        hosp_ids = [r["hospital_id"] for r in (plat_req.data or []) if r.get("hospital_id")]
        if hosp_ids:
            hosp_res = supabase.table("hospitals").select("id, name").in_("id", hosp_ids).execute()
            hosp_map = {h["id"]: h["name"] for h in (hosp_res.data or [])}
            for rid, r in platelet_map.items():
                r["hospital_name"] = hosp_map.get(r.get("hospital_id"), "Unknown")

    for m in (history_res.data or []):
        module = m.get("module", "blood")
        created = m.get("created_at", "")[:10]
        req_id = m.get("request_id")
        if module == "blood" and req_id and req_id in blood_map:
            r = blood_map[req_id]
            history.append({
                "date":     _fmt_date(created),
                "type":     f"🩸 Blood ({r.get('blood_group','')})",
                "hospital": r.get("hospital_name", "Unknown"),
                "status":   "Fulfilled",
                "impact":   "2 lives saved",
            })
        elif module == "platelet" and req_id and req_id in platelet_map:
            r = platelet_map[req_id]
            history.append({
                "date":     _fmt_date(created),
                "type":     "⏱️ Platelets",
                "hospital": r.get("hospital_name", "Unknown"),
                "status":   "Fulfilled",
                "impact":   "1 patient helped",
            })

    total_donations = len(history)
    lives_impacted  = sum(2 if "Blood" in h["type"] else 1 for h in history)

    # Requests sent directly TO this donor (matches with status=pending)
    direct_matches = supabase.table("matches") \
        .select("module, request_id") \
        .eq("donor_id", donor_id) \
        .eq("status", "pending") \
        .execute()
    direct_blood_ids = [m["request_id"] for m in (direct_matches.data or []) if m.get("module") == "blood" and m.get("request_id")]
    direct_platelet_ids = [m["request_id"] for m in (direct_matches.data or []) if m.get("module") == "platelet" and m.get("request_id")]

    # Explicitly fetch direct blood requests to ensure they appear even if not in top 20
    direct_blood_reqs = []
    if direct_blood_ids:
        direct_res = supabase.table("blood_requests") \
            .select("id, blood_group, urgency, hospital_id, created_at") \
            .in_("id", direct_blood_ids) \
            .eq("status", "open") \
            .execute()
        direct_blood_reqs = direct_res.data or []

    # All open blood requests (global top 20)
    global_blood_reqs = supabase.table("blood_requests") \
        .select("id, blood_group, urgency, hospital_id, created_at") \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .limit(20) \
        .execute()
    
    # Merge direct and global requests
    blood_map_merge = {r["id"]: r for r in (global_blood_reqs.data or [])}
    for r in direct_blood_reqs:
        blood_map_merge[r["id"]] = r
    
    blood_requests_all = list(blood_map_merge.values())

    platelet_urgent = supabase.table("platelet_requests") \
        .select("id, blood_group, hospital_id, created_at") \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()

    donor_blood = (d.get("blood_group") or "").strip()

    # Filter by donor compatibility; always include direct requests (sent to this donor)
    blood_filtered = []
    for r in blood_requests_all:
        req_group = r.get("blood_group") or ""
        is_direct = r.get("id") in direct_blood_ids
        compatible = not donor_blood or blood_compatible(donor_blood, req_group)
        if is_direct or compatible:
            blood_filtered.append((r, is_direct))

    platelet_filtered = []
    for r in (platelet_urgent.data or []):
        req_group = r.get("blood_group") or ""
        is_direct = r.get("id") in direct_platelet_ids
        compatible = not donor_blood or not req_group or blood_compatible(donor_blood, req_group)
        if is_direct or compatible:
            platelet_filtered.append((r, is_direct))

    # Sort: direct requests first, then by created_at
    blood_filtered.sort(key=lambda x: (not x[1], x[0].get("created_at") or ""), reverse=True)
    platelet_filtered.sort(key=lambda x: (not x[1], x[0].get("created_at") or ""), reverse=True)

    hosp_ids = set()
    for r, _ in blood_filtered[:5]:
        if r.get("hospital_id"):
            hosp_ids.add(r["hospital_id"])
    for r, _ in platelet_filtered[:3]:
        if r.get("hospital_id"):
            hosp_ids.add(r["hospital_id"])

    hosp_map = {}
    if hosp_ids:
        hosp_res = supabase.table("hospitals").select("id, name, city").in_("id", list(hosp_ids)).execute()
        hosp_map = {h["id"]: h for h in (hosp_res.data or [])}

    urgent = []
    for r, is_direct in blood_filtered[:5]:
        h = hosp_map.get(r.get("hospital_id"), {})
        urg = (r.get("urgency") or "urgent").upper()
        hosp_name = (f"{h.get('name','')}, {h.get('city','')}".strip(", ") if h else "") or "Unknown Hospital"
        if is_direct:
            hosp_name = hosp_name + " (sent to you)"
        urgent.append({
            "type":     "🩸",
            "module":   "BloodBridge",
            "group":    r.get("blood_group", ""),
            "hospital": hosp_name,
            "distance": "Nearby",
            "urgency":  urg,
            "time":     "Recently",
        })
    for r, is_direct in platelet_filtered[:3]:
        h = hosp_map.get(r.get("hospital_id"), {})
        hosp_name = (f"{h.get('name','')}, {h.get('city','')}".strip(", ") if h else "") or "Unknown Hospital"
        if is_direct:
            hosp_name = hosp_name + " (sent to you)"
        urgent.append({
            "type":     "⏱️",
            "module":   "PlateletAlert",
            "group":    r.get("blood_group", "—"),
            "hospital": hosp_name,
            "distance": "Nearby",
            "urgency":  "URGENT",
            "time":     "Recently",
        })

    return {
        "profile": {
            "id":            donor_id,
            "name":          d.get("name", ""),
            "initial":       (d.get("name") or "?")[0].upper(),
            "blood_group":   d.get("blood_group", ""),
            "city":          d.get("city", ""),
            "is_verified":   d.get("is_verified", False),
            "donor_types":   d.get("donor_types") or [],
            "trust_stars":   trust_stars,
            "is_available":  d.get("is_available", True),
        },
        "stats": {
            "total_donations":  total_donations,
            "lives_impacted":   lives_impacted,
            "trust_score":      trust_stars,
            "next_eligible":    next_eligible_label,
        },
        "urgent_requests":  urgent,
        "donation_history": history,
    }


# ── GET /dashboard/hospital/{id} ──────────────────────────────────────────────

@router.get("/hospital/{hospital_id}")
def get_hospital_dashboard(hospital_id: str):
    """Powers HospitalDashboard component in Dashboard.tsx."""
    hosp = supabase.table("hospitals") \
        .select("*") \
        .eq("id", hospital_id) \
        .single() \
        .execute()

    if not hosp.data:
        raise HTTPException(status_code=404, detail="Hospital not found")

    h = hosp.data

    # Active blood requests
    blood_reqs = supabase.table("blood_requests") \
        .select("*") \
        .eq("hospital_id", hospital_id) \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .execute()

    # Active platelet requests
    plat_reqs = supabase.table("platelet_requests") \
        .select("*") \
        .eq("hospital_id", hospital_id) \
        .eq("status", "open") \
        .order("created_at", desc=True) \
        .execute()

    # Build combined active_requests list matching HospitalDashboard.tsx
    # Batch-fetch all matches and donors to avoid N+1 queries / socket exhaustion
    all_requests = (blood_reqs.data or []) + (plat_reqs.data or [])
    all_request_ids = [r["id"] for r in all_requests]

    # Single query to get all pending matches for these requests
    all_matches_data = []
    if all_request_ids:
        all_matches = _safe_execute(
            supabase.table("matches")
            .select("id, donor_id, status, request_id")
            .in_("request_id", all_request_ids)
            .eq("status", "pending")
        )
        all_matches_data = all_matches.data or []

    # Group matches by request_id
    matches_by_request = {}
    for m in all_matches_data:
        rid = m.get("request_id")
        if rid not in matches_by_request:
            matches_by_request[rid] = []
        if m.get("donor_id"):
            matches_by_request[rid].append(m["donor_id"])

    # Single query to get all needed donors
    all_donor_ids = list({did for dids in matches_by_request.values() for did in dids})
    donors_by_id = {}
    if all_donor_ids:
        d_res = _safe_execute(
            supabase.table("donors")
            .select("id, name, mobile, city")
            .in_("id", all_donor_ids)
        )
        for d in (d_res.data or []):
            donors_by_id[d["id"]] = d

    active = []
    for r in (blood_reqs.data or []):
        donor_ids = matches_by_request.get(r["id"], [])
        donors = [donors_by_id[did] for did in donor_ids if did in donors_by_id]
        active.append({
            "id":       r["id"],
            "group":    r["blood_group"],
            "units":    r.get("units", 1),
            "urgency":  (r.get("urgency") or "urgent").upper(),
            "module":   "BloodBridge",
            "matched":  len(donors),
            "donors":   donors,
            "posted":   _time_ago(r.get("created_at", "")),
        })
    for r in (plat_reqs.data or []):
        donor_ids = matches_by_request.get(r["id"], [])
        donors = [donors_by_id[did] for did in donor_ids if did in donors_by_id]
        active.append({
            "id":       r["id"],
            "group":    f"{r.get('blood_group','')} Platelets",
            "units":    r.get("units", 1),
            "urgency":  (r.get("urgency") or "urgent").upper(),
            "module":   "PlateletAlert",
            "matched":  len(donors),
            "donors":   donors,
            "posted":   _time_ago(r.get("created_at", "")),
        })

    # Fulfilled this month
    fulfilled = supabase.table("matches").select("id", count="exact") \
        .eq("status", "fulfilled").execute()

    return {
        "hospital": {
            "id":          hospital_id,
            "name":        h.get("name", ""),
            "city":        h.get("city", ""),
            "is_verified": h.get("is_verified", False),
        },
        "stats": {
            "active_requests":       len(active),
            "matched_this_month":    fulfilled.count or 0,
            "units_received":        (fulfilled.count or 0) * 2,
            "avg_match_time":        "18m",
        },
        "active_requests": active,
    }


# ── GET /dashboard/admin ──────────────────────────────────────────────────────

@router.get("/admin")
def get_admin_dashboard():
    """Powers AdminDashboard component in Dashboard.tsx."""
    unverified_donors = supabase.table("donors") \
        .select("id, name, city, created_at, donor_types") \
        .eq("is_verified", False) \
        .order("created_at", desc=True) \
        .limit(20) \
        .execute()

    unverified_hospitals = supabase.table("hospitals") \
        .select("id, name, city, reg_number, created_at") \
        .eq("is_verified", False) \
        .order("created_at", desc=True) \
        .limit(20) \
        .execute()

    flagged = supabase.table("donors") \
        .select("id, name, city, trust_score") \
        .lt("trust_score", 20) \
        .execute()

    total_donors    = supabase.table("donors").select("id", count="exact").execute()
    total_hospitals = supabase.table("hospitals").select("id", count="exact").execute()
    total_matches   = supabase.table("matches").select("id", count="exact").execute()

    pending = (len(unverified_donors.data or []) + len(unverified_hospitals.data or []))

    return {
        "stats": {
            "pending_verifications": pending,
            "flagged_accounts":      len(flagged.data or []),
            "total_users":           (total_donors.count or 0) + (total_hospitals.count or 0),
            "todays_matches":        total_matches.count or 0,
        },
        "verification_queue": {
            "donors":    [
                {
                    "id":    d["id"],
                    "name":  d["name"],
                    "type":  "Donor",
                    "city":  d.get("city", ""),
                    "docs":  ", ".join(d.get("donor_types") or []),
                    "time":  _time_ago(d.get("created_at", "")),
                }
                for d in (unverified_donors.data or [])
            ],
            "hospitals": [
                {
                    "id":   h["id"],
                    "name": h["name"],
                    "type": "Hospital",
                    "city": h.get("city", ""),
                    "docs": f"Reg: {h.get('reg_number','')}",
                    "time": _time_ago(h.get("created_at", "")),
                }
                for h in (unverified_hospitals.data or [])
            ],
        },
        "flagged_accounts": flagged.data or [],
    }


# ── POST /dashboard/admin/verify ──────────────────────────────────────────────

class VerifyBody(BaseModel):
    entity_type: str    # "donor" or "hospital"
    entity_id:   str
    approved:    bool


@router.post("/admin/verify")
def admin_verify(body: VerifyBody):
    """Called by Approve/Reject buttons in AdminDashboard.tsx verification queue."""
    if body.entity_type == "donor":
        supabase.table("donors").update({
            "is_verified": body.approved,
            "trust_score": 60 if body.approved else 10,
        }).eq("id", body.entity_id).execute()
    elif body.entity_type == "hospital":
        supabase.table("hospitals").update({
            "is_verified": body.approved,
        }).eq("id", body.entity_id).execute()
    else:
        raise HTTPException(status_code=400, detail="entity_type must be 'donor' or 'hospital'")

    return {
        "success": True,
        "message": f"{'Approved' if body.approved else 'Rejected'} {body.entity_type} {body.entity_id}",
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_date(iso: str) -> str:
    try:
        from datetime import datetime
        return datetime.fromisoformat(iso[:10]).strftime("%b %d, %Y")
    except Exception:
        return iso


def _time_ago(iso: str) -> str:
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        diff = datetime.now(timezone.utc) - dt
        mins = int(diff.total_seconds() / 60)
        if mins < 60:
            return f"{mins} min ago"
        hours = mins // 60
        if hours < 24:
            return f"{hours} hr{'s' if hours > 1 else ''} ago"
        return f"{hours // 24} day{'s' if hours // 24 > 1 else ''} ago"
    except Exception:
        return "Recently"