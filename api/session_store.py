

import json
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

SESSIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def _path(project_id: int) -> Path:
    return SESSIONS_DIR / f"{project_id}.json"


def _load(project_id: int) -> list:
    p = _path(project_id)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(project_id: int, records: list):
    _path(project_id).write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def add_session_record(
    project_id:  int,
    record_type: str,           # "avatar_session" | "invitation"
    title:       str,
    note:        str = "",
    report_file: str = "",
) -> dict:
    now = datetime.now()
    record = {
        "id":           str(uuid.uuid4()),
        "project_id":   project_id,
        "type":         record_type,
        "date":         now.strftime("%Y-%m-%d"),
        "time":         now.strftime("%H:%M"),
        "datetime_iso": now.isoformat(timespec="seconds"),
        "title":        title,
        "note":         note[:200],      # first 200 chars as preview
        "report_file":  report_file,
    }
    records = _load(project_id)
    records.insert(0, record)            # newest first
    _save(project_id, records)
    return record

@router.get("/projects/{project_id}/meeting-history")
def get_meeting_history(project_id: int):
    records = _load(project_id)
    return {"events": records}