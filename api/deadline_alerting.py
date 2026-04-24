"""
deadline_alerting.py

GET  /projects/{project_id}/deadline-status
     → { has_overdue: bool, overdue: [...], on_track: [...] }

POST /projects/{project_id}/reschedule/preview
     → { changes: [{ task_id, name, old_deadline, new_deadline }] }

POST /projects/{project_id}/reschedule/confirm
     body: { changes: [...] }
     → { updated: N }
"""

from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────

def _parse(s) -> date | None:
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _add_working_days(from_date: date, days: int) -> date:
    """Add `days` working days (skip Sundays) to from_date."""
    d = from_date
    added = 0
    while added < days:
        d += timedelta(days=1)
        if d.weekday() != 6:   # not Sunday
            added += 1
    return d


def _get_engine():
    from core.engine import DigitalTwinEngine
    return DigitalTwinEngine()


def _stage_name(task: dict) -> str:
    sid = task.get("stage_id")
    if not sid:
        return "New"
    return sid[1] if isinstance(sid, (list, tuple)) else str(sid)


# ── models ────────────────────────────────────────────────────

class RescheduleConfirmRequest(BaseModel):
    changes: list[dict]   # [{ task_id, name, old_deadline, new_deadline }]


# ── routes ───────────────────────────────────────────────────

@router.get("/projects/{project_id}/deadline-status")
def deadline_status(project_id: int):
    """
    Returns which tasks are overdue (deadline passed, stage != Done/Cancelled).
    Used by the project list to show the orange warning border.
    """
    try:
        engine = _get_engine()
        tasks  = engine.odoo.get_tasks(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    today   = date.today()
    overdue = []
    on_track = []

    for t in tasks:
        dl    = _parse(t.get("date_deadline"))
        stage = _stage_name(t)
        if stage in ("Done", "Cancelled"):
            on_track.append(t)
            continue
        if dl and dl < today:
            overdue.append({
                "id":           t["id"],
                "name":         t["name"],
                "deadline":     t.get("date_deadline"),
                "stage":        stage,
                "days_overdue": (today - dl).days,
            })
        else:
            on_track.append(t)

    return {
        "project_id": project_id,
        "has_overdue": len(overdue) > 0,
        "overdue":    overdue,
        "on_track":   on_track,
    }


@router.post("/projects/{project_id}/reschedule/preview")
def reschedule_preview(project_id: int):
    """
    For each overdue task, compute how many days it is late.
    Then shift ALL tasks that depend on it (recursively) by that delay.
    Returns a list of proposed changes — does NOT touch Odoo yet.
    """
    try:
        engine = _get_engine()
        tasks  = engine.odoo.get_tasks(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    today  = date.today()
    by_id  = {t["id"]: t for t in tasks}

    # Build dependency graph: task_id → list of task_ids that depend on it
    dependents: dict[int, list[int]] = {t["id"]: [] for t in tasks}
    for t in tasks:
        for dep_id in (t.get("depend_on_ids") or []):
            if dep_id in dependents:
                dependents[dep_id].append(t["id"])

    # Find overdue tasks and their delays
    delays: dict[int, int] = {}   # task_id → days of delay to propagate
    for t in tasks:
        dl    = _parse(t.get("date_deadline"))
        stage = _stage_name(t)
        if dl and dl < today and stage not in ("Done", "Cancelled"):
            delays[t["id"]] = (today - dl).days

    if not delays:
        return {"changes": [], "message": "No overdue tasks found — nothing to reschedule."}

    # BFS: propagate delays through the dependency graph
    proposed: dict[int, date] = {}   # task_id → new deadline

    def propagate(task_id: int, extra_days: int):
        for dep_id in dependents.get(task_id, []):
            dep = by_id.get(dep_id)
            if not dep:
                continue
            old_dl = _parse(dep.get("date_deadline"))
            if not old_dl:
                continue
            new_dl = _add_working_days(old_dl, extra_days)
            # Only move forward, never backward
            if dep_id not in proposed or new_dl > proposed[dep_id]:
                proposed[dep_id] = new_dl
            propagate(dep_id, extra_days)

    for task_id, delay_days in delays.items():
        # The overdue task itself: new deadline = today
        t      = by_id[task_id]
        old_dl = _parse(t.get("date_deadline"))
        proposed[task_id] = today
        propagate(task_id, delay_days)

    # Build change list
    changes = []
    for task_id, new_dl in proposed.items():
        t      = by_id[task_id]
        old_dl = _parse(t.get("date_deadline"))
        if old_dl != new_dl:
            changes.append({
                "task_id":      task_id,
                "name":         t["name"],
                "old_deadline": t.get("date_deadline", ""),
                "new_deadline": new_dl.strftime("%Y-%m-%d"),
                "is_overdue":   task_id in delays,
            })

    changes.sort(key=lambda c: c["new_deadline"])

    return {"changes": changes}


@router.post("/projects/{project_id}/reschedule/confirm")
def reschedule_confirm(project_id: int, body: RescheduleConfirmRequest):
    """
    Push the approved reschedule changes to Odoo.
    """
    try:
        engine = _get_engine()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    updated = 0
    errors  = []

    for change in body.changes:
        try:
            engine.odoo.update_task_deadline(
                task_id      = change["task_id"],
                new_deadline = change["new_deadline"],
            )
            updated += 1
        except Exception as e:
            errors.append({"task_id": change["task_id"], "error": str(e)})

    return {
        "updated": updated,
        "errors":  errors,
    }