"""
simli_session.py  ->  api/simli_session.py
"""

import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

SIMLI_API_KEY = os.getenv("SIMLI_API_KEY", "")
SIMLI_FACE_ID = os.getenv("SIMLI_FACE_ID", "dd10cb5a-d31d-4f12-b69f-6db3383c006e")
SIMLI_BASE    = "https://api.simli.ai"


class StartSessionRequest(BaseModel):
    face_id: str = ""


@router.post("/simli/start-session")
async def start_session(body: StartSessionRequest):
    face_id = body.face_id or SIMLI_FACE_ID

    if not SIMLI_API_KEY:
        raise HTTPException(status_code=500,
            detail="SIMLI_API_KEY not set in .env")

    payload = {
        "config": {
            "faceId":           face_id,
            "handleSilence":    True,
            "maxSessionLength": 600,
            "maxIdleTime":      180,
        },
        "apiKey": SIMLI_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{SIMLI_BASE}/getSessionToken",
                json=payload,
                headers={"Content-Type": "application/json"},
            )

        try:
            data = r.json()
        except Exception:
            data = {"raw_text": r.text}

        # Return full debug info regardless of status so frontend can show it
        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Simli API returned {r.status_code}. "
                    f"Body: {r.text[:600]}. "
                    f"Key prefix: {SIMLI_API_KEY[:8]}... "
                    f"Face ID: {face_id}"
                )
            )

        token = data.get("session_token", "")
        if not token:
            raise HTTPException(
                status_code=502,
                detail=f"Simli returned 200 but no session_token. Full response: {data}"
            )

        return {
            "session_token": token,
            "face_id":       face_id,
        }

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=502,
            detail="Simli API timed out after 20s")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502,
            detail=f"Network error reaching Simli: {e}")
    except Exception as e:
        raise HTTPException(status_code=500,
            detail=f"{type(e).__name__}: {e}")