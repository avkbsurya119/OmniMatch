"""
Run this ONCE to close all the duplicate B+ requests in your DB.
It keeps only the LATEST open request per hospital+blood_group, closes the rest.

Usage:
  cd backend
  python cleanup_duplicate_requests.py
"""

import os
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch all open requests
res = supabase.table("blood_requests") \
    .select("id, hospital_id, blood_group, created_at") \
    .in_("status", ["open", "donor_contacted"]) \
    .order("created_at", desc=True) \
    .execute()

requests = res.data or []
print(f"Found {len(requests)} open/donor_contacted requests")

# Group by hospital_id + blood_group, keep latest, close rest
seen = {}
to_close = []

for r in requests:
    key = (r["hospital_id"], r["blood_group"])
    if key not in seen:
        seen[key] = r["id"]  # keep this one (latest)
    else:
        to_close.append(r["id"])  # close duplicates

print(f"Keeping {len(seen)} unique requests, closing {len(to_close)} duplicates\n")

for rid in to_close:
    supabase.table("blood_requests").update({"status": "closed"}).eq("id", rid).execute()
    print(f"  ✅ Closed duplicate request {rid}")

print(f"\nDone! Closed {len(to_close)} duplicate requests.")