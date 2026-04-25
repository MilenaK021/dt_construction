"""
deadline_alerting.py

GET  /projects/{project_id}/deadline-status
POST /projects/{project_id}/reschedule/preview
POST /projects/{project_id}/reschedule/confirm
"""

from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


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
        if d.weekday() != 6:
            added += 1
    return d


def _stage_name(task: dict) -> str:
    sid = task.get("stage_id")
    if not sid:
        return "New"
    return sid[1] if isinstance(sid, (list, tuple)) else str(sid)


class RescheduleConfirmRequest(BaseModel):
    changes: list[dict]


@router.get("/projects/{project_id}/deadline-status")
def deadline_status(project_id: int, request: Request):
    odoo = request.app.state.engine.odoo
    try:
        tasks = odoo.get_tasks(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    today    = date.today()
    overdue  = []
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
        "project_id":  project_id,
        "has_overdue": len(overdue) > 0,
        "overdue":     overdue,
        "on_track":    on_track,
    }


@router.post("/projects/{project_id}/reschedule/preview")
def reschedule_preview(project_id: int, request: Request):
    odoo = request.app.state.engine.odoo
    try:
        tasks = odoo.get_tasks(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    today = date.today()
    by_id = {t["id"]: t for t in tasks}

    # Build forward dependency graph: task_id → list of tasks that depend on it
    dependents: dict[int, list[int]] = {t["id"]: [] for t in tasks}
    for t in tasks:
        for dep_id in (t.get("depend_on_ids") or []):
            if dep_id in dependents:
                dependents[dep_id].append(t["id"])

    # proposed_end[task_id] = the new deadline we will assign
    proposed_end: dict[int, date] = {}

    def get_new_end(task_id: int) -> date:
        """
        Recursively compute the new deadline for a task:
        - If already computed, return it.
        - If the task's dependencies have been rescheduled, start after them.
        - If the task is overdue itself, start from today.
        - Otherwise keep the original deadline.
        """
        if task_id in proposed_end:
            return proposed_end[task_id]

        t        = by_id[task_id]
        dur      = t.get("duration_days") or 5
        old_dl   = _parse(t.get("date_deadline"))
        stage    = _stage_name(t)
        is_done  = stage in ("Done", "Cancelled")

        # Done tasks don't move
        if is_done:
            proposed_end[task_id] = old_dl or today
            return proposed_end[task_id]

        # Find the latest end date among all dependencies
        deps = t.get("depend_on_ids") or []
        if deps:
            dep_ends = [get_new_end(d) for d in deps if d in by_id]
            latest_dep_end = max(dep_ends) if dep_ends else None
        else:
            latest_dep_end = None

        if latest_dep_end:
            # This task must start after its latest dependency ends
            new_end = _add_working_days(latest_dep_end, dur)
        elif old_dl and old_dl < today:
            # Overdue with no upstream deps — reschedule to start today
            # new deadline = today + its own duration
            new_end = _add_working_days(today, dur)
        else:
            # On track — keep original deadline unchanged
            new_end = old_dl or _add_working_days(today, dur)

        proposed_end[task_id] = new_end
        return new_end

    # Trigger computation for all overdue tasks and cascade forward
    for t in tasks:
        dl    = _parse(t.get("date_deadline"))
        stage = _stage_name(t)
        if dl and dl < today and stage not in ("Done", "Cancelled"):
            get_new_end(t["id"])
            # Also compute for all dependents
            for dep_id in dependents.get(t["id"], []):
                get_new_end(dep_id)

    # Now cascade: any task whose dependency got rescheduled must also be recomputed
    # Run a second pass to catch chains (A→B→C where only A was overdue)
    changed = True
    passes  = 0
    while changed and passes < 20:
        changed = False
        passes += 1
        for t in tasks:
            tid   = t["id"]
            stage = _stage_name(t)
            if stage in ("Done", "Cancelled"):
                continue
            deps = t.get("depend_on_ids") or []
            if not deps:
                continue
            dep_ends = [proposed_end.get(d) or _parse(by_id[d].get("date_deadline"))
                        for d in deps if d in by_id]
            dep_ends = [e for e in dep_ends if e]
            if not dep_ends:
                continue
            latest = max(dep_ends)
            dur    = t.get("duration_days") or 5
            needed = _add_working_days(latest, dur)
            current = proposed_end.get(tid) or _parse(t.get("date_deadline"))
            if current and needed > current:
                proposed_end[tid] = needed
                changed = True

    # Build change list — only tasks where deadline actually changes
    changes = []
    for task_id, new_dl in proposed_end.items():
        t      = by_id[task_id]
        old_dl = _parse(t.get("date_deadline"))
        if not old_dl or old_dl == new_dl:
            continue
        changes.append({
            "task_id":      task_id,
            "name":         t["name"],
            "old_deadline": t.get("date_deadline", ""),
            "new_deadline": new_dl.strftime("%Y-%m-%d"),
            "is_overdue":   old_dl < today and _stage_name(t) not in ("Done", "Cancelled"),
        })

    changes.sort(key=lambda c: c["new_deadline"])
    return {"changes": changes}


@router.post("/projects/{project_id}/reschedule/confirm")
def reschedule_confirm(project_id: int, body: RescheduleConfirmRequest, request: Request):
    odoo    = request.app.state.engine.odoo
    updated = 0
    errors  = []

    for change in body.changes:
        try:
            odoo.update_task_deadline(
                task_id      = change["task_id"],
                new_deadline = change["new_deadline"],
            )
            updated += 1
        except Exception as e:
            errors.append({"task_id": change["task_id"], "error": str(e)})

    return {"updated": updated, "errors": errors}