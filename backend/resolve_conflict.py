import sys

with open('backend/routes/blood.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Resolve the first conflict block
chunk1_start = text.find('<<<<<<< HEAD\n    """Hospital targets a specific donor')
chunk1_end = text.find('hosp_city = hosp.get("city", "")\n>>>>>>> 8599f70285646bff509b7469152832c016176cb0') + len('hosp_city = hosp.get("city", "")\n>>>>>>> 8599f70285646bff509b7469152832c016176cb0')

if chunk1_start == -1 or chunk1_end < chunk1_start:
    print('Failed to find chunk 1')
    sys.exit(1)

replacement1 = '''    """Verified hospital targets a specific donor."""
    # 1. Validate hospital — try the provided ID first
    hosp_data = None

    try:
        hosp = supabase.table("hospitals") \\
            .select("id, name, city, is_verified") \\
            .eq("id", body.hospital_id) \\
            .single() \\
            .execute()
        hosp_data = hosp.data
    except Exception as e:
        logger.warning(f"Hospital lookup failed for {body.hospital_id}: {e}")

    # If not found, check if this ID belongs to a donor (common stale-session issue)
    if not hosp_data:
        try:
            donor_check = supabase.table("donors") \\
                .select("id, name") \\
                .eq("id", body.hospital_id) \\
                .limit(1) \\
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
            detail="Hospital not found for your account. Please log out and log back in as a hospital."
        )

    if not hosp_data.get("is_verified"):
        raise HTTPException(status_code=403, detail="Only verified hospitals can send donor requests.")

    hosp_name   = hosp_data["name"]
    hosp_city   = hosp_data.get("city", "")
    hospital_id = hosp_data["id"]'''

text = text[:chunk1_start] + replacement1 + text[chunk1_end:]

# Resolve the second conflict block
chunk2_start = text.find('<<<<<<< HEAD\n        "message":    f"Request sent to {donor_name}. {\\'SMS alert sent!\\' if sms_count else \\'In-app notification sent.\\'}",\n=======')
chunk2_end = text.find('        "message": f"Response recorded: {new_status}.",\n>>>>>>> 8599f70285646bff509b7469152832c016176cb0') + len('        "message": f"Response recorded: {new_status}.",\n>>>>>>> 8599f70285646bff509b7469152832c016176cb0')

if chunk2_start == -1 or chunk2_end < chunk2_start:
    print('Failed to find chunk 2')
    sys.exit(1)

# we just want to keep the HEAD message for the first part and all the main logic for POST /blood/respond
replacement2 = '''        "message":    f"Request sent to {donor_name}. {'SMS alert sent!' if sms_count else 'In-app notification sent.'}",
    }
