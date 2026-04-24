"""
project_creator.py — parses an uploaded work-plan document (Word/text),
extracts tasks with deadlines and responsible persons, creates the project
in Odoo, and saves a calendar-plan JSON for the meeting invitation.
"""

import json
import os
import re
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
# Use a larger model for plan parsing — 70b handles long JSON without truncation
MODEL  = os.getenv("GROQ_PLAN_MODEL", "llama-3.3-70b-versatile")

# Where generated plans are stored — always relative to the project root, not cwd
PLANS_DIR = Path(__file__).resolve().parent.parent / "data" / "plans"
PLANS_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def _read_docx(path: str) -> str:
    """Extract plain text from a .docx file."""
    try:
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        raise ValueError(f"Could not read .docx file: {e}")


def _read_txt(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def _extract_text(tmp_path: str, filename: str) -> str:
    if filename.lower().endswith(".docx"):
        return _read_docx(tmp_path)
    return _read_txt(tmp_path)


def _compress_doc(text: str) -> str:
    """
    Reduce token count while keeping all structural information:
    - collapse runs of blank lines to one
    - strip lines that are pure bullet dashes with no content
    - keep section headers, timing lines, and assignee lines
    """
    lines = text.splitlines()
    out = []
    prev_blank = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if not prev_blank:
                out.append("")
            prev_blank = True
        else:
            prev_blank = False
            out.append(stripped)
    return "\n".join(out)


def _parse_plan_with_llm(doc_text: str, project_name: str, start_date: str) -> dict:
    """
    Send the document text to the LLM and get back a structured JSON plan.
    Returns dict: { project_name, start_date, tasks: [...] }
    Each task: { id, name, phase, assignees: [], duration_days, deadline, depends_on: [] }
    """

    compressed = _compress_doc(doc_text)

    system = (
        "You are a project-planning assistant. "
        "Extract tasks from the work-plan document and return ONLY a JSON object. "
        "No markdown, no explanation, no text outside the JSON. "
        "If the JSON would be very long, still complete it fully — never truncate. "
        "Schema: {\"tasks\":[{\"id\":int,\"name\":str,\"name_ru\":str,"
        "\"section\":str,\"assignees\":[str],\"duration_days\":int,\"depends_on\":[int]}]} "
        "Rules: "
        "Each numbered sub-section (1.1, 1.2, 2.1, 2.2 …) becomes exactly ONE task. "
        "Merge all bullet-point items inside a sub-section into that single task. "
        "section = the sub-section number exactly as written in the document "
        "(e.g. '1.1', '2.3') — never omit or alter this field. "
        "name_ru = the Russian title of that sub-section ONLY, "
        "with absolutely NO numeric prefix — "
        "correct: 'Подготовительный этап'; wrong: '1.1 Подготовительный этап'. "
        "name = concise English translation of name_ru, max 60 chars, no number prefix. "
        "duration_days = minimum integer from any duration range in the document; "
        "infer from phase totals if the sub-section has no explicit duration. "
        "depends_on = ids of tasks that must finish before this one starts; "
        "tasks within the same top-level section are sequential (1.1→1.2→1.3…). "
        "assignees = job-title strings extracted from the 'Ответственные лица' list "
        "of the same top-level section, deduplicated — "
        "e.g. ['Начальник отдела изысканий', 'Старший геодезист']. "
        "Leave assignees empty [] if none are mentioned for this section. "
        "SKIP purely informational sub-sections such as report structure descriptions "
        "('Типовой состав технического отчета', 'Структура сроков') — "
        "only include actionable work stages."
    )

    user = (
        f"Project: {project_name}\nStart: {start_date}\n\nDocument:\n"
        + compressed[:16000]   # ~6k tokens, leaves room for output
    )

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.1,
        max_tokens=8000,
    )

    raw = resp.choices[0].message.content.strip()
    # strip accidental markdown fences
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Model truncated mid-JSON — salvage whatever tasks are complete
        repaired = raw.rstrip().rstrip(",")

        # If we're mid-string, close the string first
        # Count unmatched quotes (odd number = inside a string)
        # Simple heuristic: strip back to last complete object
        last_complete = repaired.rfind('},')
        if last_complete == -1:
            last_complete = repaired.rfind('}')
        if last_complete > 0:
            repaired = repaired[:last_complete + 1]

        # Close open arrays and objects
        opens  = repaired.count("{") - repaired.count("}")
        closes = repaired.count("[") - repaired.count("]")
        repaired += "}" * max(opens, 0) + "]" * max(closes, 0)
        if not repaired.strip().endswith("}"):
            repaired += "}"

        try:
            data = json.loads(repaired)
            # Warn in logs but continue with partial data
            import sys
            print(f"[project_creator] WARNING: truncated JSON repaired, "
                  f"recovered {len(data.get('tasks', []))} tasks", file=sys.stderr)
        except json.JSONDecodeError as e2:
            raise ValueError(
                f"LLM returned invalid JSON (repair failed): {e2}\n\nRaw: {raw[:800]}"
            )

    # Compute actual calendar deadlines from durations + dependencies
    tasks_by_id: dict[int, dict] = {}
    start = datetime.strptime(start_date, "%Y-%m-%d").date()

    def _working_days(from_date: date, days: int) -> date:
        """Add `days` working days (Mon–Sat) to from_date."""
        d = from_date
        added = 0
        while added < days:
            d += timedelta(days=1)
            if d.weekday() < 6:   # Mon–Sat
                added += 1
        return d

    # Two-pass: first pass collects, second resolves deadlines
    tasks = data.get("tasks", [])
    # Hard cap: max 3 assignees, each max 50 chars — prevents token blowout
    for t in tasks:
        raw_assignees = t.get("assignees", [])
        t["assignees"] = [a[:50] for a in raw_assignees[:3]]
        tasks_by_id[t["id"]] = t

    def _task_end(tid: int) -> date:
        t = tasks_by_id[tid]
        if "deadline" in t and t["deadline"]:
            return datetime.strptime(t["deadline"], "%Y-%m-%d").date()
        deps = t.get("depends_on", [])
        if deps:
            earliest_start = max(_task_end(d) for d in deps)
        else:
            earliest_start = start
        end = _working_days(earliest_start, t.get("duration_days", 5))
        t["deadline"] = end.strftime("%Y-%m-%d")
        t["start_date"] = (earliest_start + timedelta(days=1)).strftime("%Y-%m-%d") \
            if deps else start_date
        return end

    for t in tasks:
        _task_end(t["id"])

    return {
        "project_name": project_name,
        "start_date":   start_date,
        "tasks": tasks,
    }


# Global Odoo pipeline stages in order.
# These are SHARED across all projects — same as the built-in Odoo kanban pipeline.
PIPELINE_STAGES = ["New", "Planned", "In Progress", "Done", "Cancelled"]


def _ensure_pipeline_stages(models, db, uid, pwd, project_id: int) -> dict:
    """
    Make sure all 5 pipeline stages exist globally and are linked to this project.
    Returns a dict: { "New": id, "Planned": id, ... }
    """
    stage_ids = {}
    for i, stage_name in enumerate(PIPELINE_STAGES):
        # Look for any existing global stage with this name
        existing = models.execute_kw(
            db, uid, pwd,
            "project.task.type", "search_read",
            [[["name", "=", stage_name]]],
            {"fields": ["id"], "limit": 1}
        )
        if existing:
            sid = existing[0]["id"]
        else:
            # Create it globally (no project_ids yet — we link below)
            sid = models.execute_kw(
                db, uid, pwd,
                "project.task.type", "create",
                [{"name": stage_name, "sequence": (i + 1) * 10}]
            )
        # Link stage to this project (many2many link, safe to call even if already linked)
        models.execute_kw(
            db, uid, pwd,
            "project.task.type", "write",
            [[sid], {"project_ids": [(4, project_id)]}]
        )
        stage_ids[stage_name] = sid
    return stage_ids


def _push_to_odoo(odoo_client, project_name: str, plan: dict) -> int:
    """Create project + tasks in Odoo. Returns new project id."""
    models = odoo_client._models
    uid    = odoo_client._uid
    pwd    = __import__("os").getenv("ODOO_PASS")
    db     = __import__("os").getenv("ODOO_DB")

    # Create the project
    project_id = models.execute_kw(
        db, uid, pwd,
        "project.project", "create",
        [{"name": project_name,
          "date_start": plan["start_date"]}]
    )

    # Ensure all pipeline stages exist globally and are linked to this project.
    # All new tasks start in "New".
    stage_map = _ensure_pipeline_stages(models, db, uid, pwd, project_id)
    new_stage_id = stage_map["New"]

    # Create tasks — name format: "1.1 Подготовительный этап"
    for t in plan["tasks"]:
        section   = t.get("section", "")
        name_ru   = t.get("name_ru") or t.get("name") or ""
        full_name = f"{section} {name_ru}".strip() if section else name_ru

        models.execute_kw(
            db, uid, pwd,
            "project.task", "create",
            [{
                "name":          full_name,
                "project_id":    project_id,
                "stage_id":      new_stage_id,
                "date_deadline": t.get("deadline"),
                "description":   ", ".join(t.get("assignees", [])),
            }]
        )

    return project_id


# ──────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────

@router.post("/projects/create-from-plan")
async def create_project_from_plan(
    file:         UploadFile = File(...),
    project_name: str        = Form(...),
    start_date:   str        = Form(...),   # YYYY-MM-DD
):
    """
    Step 1 of project creation:
    Parse the uploaded work-plan document → return structured JSON plan.
    Does NOT push to Odoo yet (use /confirm endpoint for that).
    """
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        doc_text = _extract_text(tmp_path, file.filename)
    finally:
        os.unlink(tmp_path)

    try:
        plan = _parse_plan_with_llm(doc_text, project_name, start_date)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Persist the plan so /confirm can reference it
    plan_file = PLANS_DIR / f"{project_name.replace(' ', '_')}_{start_date}.json"
    plan_file.write_text(json.dumps(plan, ensure_ascii=False, indent=2))

    return {
        "plan":       plan,
        "plan_file":  str(plan_file),
    }


@router.post("/projects/confirm-plan")
async def confirm_plan(body: dict):
    """
    Step 2: Push the approved plan to Odoo.
    Body: { plan: {...}, project_name: "...", start_date: "..." }
    """
    from core.engine import DigitalTwinEngine

    plan         = body.get("plan")
    project_name = body.get("project_name") or plan.get("project_name", "New Project")

    if not plan:
        raise HTTPException(status_code=400, detail="plan is required")

    engine = DigitalTwinEngine()
    try:
        project_id = _push_to_odoo(engine.odoo, project_name, plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Odoo error: {e}")

    # Save final plan as a shareable file
    final_file = PLANS_DIR / f"FINAL_{project_name.replace(' ', '_')}.json"
    final_file.write_text(json.dumps(plan, ensure_ascii=False, indent=2))

    return {
        "status":     "created",
        "project_id": project_id,
        "plan_file":  str(final_file),
    }