"""
routes/notifications.py
-----------------------
  GET  /notifications/{user_id}   → fetch all notifications for a user
  POST /notifications/mark-read   → mark notification IDs as read
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from postgrest.exceptions import APIError

from utils.db import supabase

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{user_id}")
def get_notifications(user_id: str):
    """
    Called by AuthContext every 30s to poll for new notifications.
    Returns all notifications for the user, newest first.
    """
    try:
        res = supabase.table("notifications") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()

        return res.data or []
    except APIError as e:
        logger.warning(f"Supabase API error fetching notifications: {e}")
        raise HTTPException(status_code=502, detail="Database token expired. Please re-login.")
    except Exception as e:
        logger.error(f"Unexpected error fetching notifications: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications.")


class MarkReadBody(BaseModel):
    ids: List[str]


@router.post("/mark-read")
def mark_notifications_read(body: MarkReadBody):
    """
    Called by Navbar when user opens the alerts dropdown.
    Marks the given notification IDs as read.
    """
    if not body.ids:
        return {"success": True}

    supabase.table("notifications") \
        .update({"is_read": True}) \
        .in_("id", body.ids) \
        .execute()

    return {"success": True}