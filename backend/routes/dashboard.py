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