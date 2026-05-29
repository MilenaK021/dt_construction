import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from docx import Document as DocxDocument

router = APIRouter()


def _extract_text(file_path: str, filename: str) -> str:
    """Extract plain text from .docx or .txt file."""
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".docx":
        doc = DocxDocument(file_path)
        lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        return "\n".join(lines)
    else:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()


@router.post("/reports/submit-file")
async def submit_report_file(
    request: Request,
    task_id: int = Form(...),
    file: UploadFile = File(...),
):
    """
    Accept an uploaded report file (.docx or .txt), extract its text,
    validate it with the LLM, and if approved set the task stage to Done in ODOO.
    """
    engine = request.app.state.engine

    # 1. Get task name from ODOO
    all_tasks = engine.odoo.get_tasks()
    task = next((t for t in all_tasks if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    task_name = task["name"]

    # 2. Save uploaded file to a temp path
    suffix = os.path.splitext(file.filename)[1] or ".txt"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # 3. Extract text
        report_text = _extract_text(tmp_path, file.filename)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not report_text.strip():
        raise HTTPException(status_code=422, detail="Uploaded file appears to be empty.")

    # 4. Validate with LLM
    from nlp.groq_client import validate_report
    result = validate_report(report_text, task_name)

    # 5. If approved, set task stage to Done in ODOO
    odoo_updated = False
    if result["is_valid"]:
        try:
            odoo_updated = engine.odoo.set_task_stage(task_id, "Done")
        except Exception:
            odoo_updated = False

    return {
        "status":               "approved" if result["is_valid"] else "rejected",
        "task_id":              task_id,
        "task_name":            task_name,
        "filename":             file.filename,
        "feedback":             result["feedback"],
        "further_work_allowed": result["is_valid"],
        "odoo_stage_updated":   odoo_updated,
        "report_preview":       report_text[:300],
    }