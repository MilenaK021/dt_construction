"""
simli_session.py  →  api/simli_session.py

POST /simli/start-session
     → { session_token, ice_servers }  — frontend uses this to open WebRTC

POST /simli/tts-audio
     body: { text, session_token }
     → streams PCM audio to Simli so the avatar speaks
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


class TTSRequest(BaseModel):
    text:          str
    session_token: str


@router.post("/simli/start-session")
async def start_session(body: StartSessionRequest):
    """
    Ask Simli to create a new WebRTC session.
    Returns the session_token the frontend needs to connect.
    """
    face_id = body.face_id or SIMLI_FACE_ID

    if not SIMLI_API_KEY:
        raise HTTPException(status_code=500, detail="SIMLI_API_KEY not set in .env")

    payload = {
        "faceId":          face_id,
        "isJPG":           True,
        "syncAudio":       True,
        "apiKey":          SIMLI_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{SIMLI_BASE}/startAudioToVideoSession",
                json=payload,
            )
        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Simli error {r.status_code}: {r.text[:300]}"
            )
        data = r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Simli: {e}")

    return {
        "session_token": data.get("session_token") or data.get("sessionToken", ""),
        "ice_servers":   data.get("iceServers", []),
        "face_id":       face_id,
    }