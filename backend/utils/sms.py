"""
utils/sms.py
------------
Twilio SMS wrapper. Fails gracefully if credentials are not set,
so the rest of the app works fine without SMS configured.
"""

import os
import logging
from typing import Optional

log = logging.getLogger(__name__)


def send_sms(to: str, body: str) -> bool:
    """
    Send an SMS via Twilio. Returns True on success, False on failure.
    Silently skips if TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM are not set.
    """
    sid   = os.getenv("TWILIO_SID")
    token = os.getenv("TWILIO_TOKEN")
    from_ = os.getenv("TWILIO_FROM")

    if not all([sid, token, from_]):
        log.warning("Twilio credentials not set — SMS skipped for %s", to)
        return False

    try:
        from twilio.rest import Client
        client = Client(sid, token)
        message = client.messages.create(body=body, from_=from_, to=to)
        log.info("SMS sent to %s: SID=%s", to, message.sid)
        return True
    except Exception as exc:
        log.error("SMS failed for %s: %s", to, exc)
        return False


def alert_donors(mobiles: list[str], message: str) -> int:
    """Send SMS to a list of mobiles. Returns count of successes."""
    return sum(send_sms(m, message) for m in mobiles if m)