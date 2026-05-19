"""
simli_session.py  ->  api/simli_session.py
Uses Simli REST API to generate session token only.
All WebRTC is handled by simli-client npm package in the frontend.
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
    """
    Generate a Simli session token using their official API format.
    Frontend uses this token with the simli-client npm package.
    """
    face_id = body.face_id or SIMLI_FACE_ID

    if not SIMLI_API_KEY:
        raise HTTPException(status_code=500, detail="SIMLI_API_KEY not set in .env")

    # Official Simli token generation payload per their JS SDK docs
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

        if r.status_code != 200:
            raise HTTPException(status_code=502,
                detail=f"Simli {r.status_code}: {r.text[:400]}")

        return {
            "session_token": data.get("session_token", ""),
            "face_id":       face_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")