"""
document_watcher.py — background polling service.
Place in: api/document_watcher.py

Polls Odoo every N minutes for new documents linked to project tasks.
When a new .docx/.pdf report is found:
  1. Downloads the file
  2. Extracts text
  3. Runs validation against the task
  4. Logs result (and optionally posts a note back to Odoo)

Runs as a FastAPI background task, started on app startup.
"""

import asyncio
import logging
import tempfile
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# How often to poll (seconds)
POLL_INTERVAL = int(os.getenv("DOCUMENT_POLL_INTERVAL", "120"))  # default 2 min

# Track last check per project: { project_id: datetime }
_last_checked: dict[int, datetime] = {}

# Track already-processed document IDs to avoid double-processing
_processed_doc_ids: set[int] = set()


def _extract_text_from_bytes(content: bytes, filename: str) -> str:
    """Extract plain text from .docx or .pdf bytes."""
    suffix = Path(filename).suffix.lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        if suffix == ".docx":
            import docx
            doc = docx.Document(tmp_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif suffix == ".pdf":
            try:
                import pdfplumber
                with pdfplumber.open(tmp_path) as pdf:
                    return "\n".join(
                        page.extract_text() or "" for page in pdf.pages
                    )
            except ImportError:
                logger.warning("pdfplumber not installed — cannot extract PDF text")
                return ""
        else:
            return content.decode("utf-8", errors="replace")
    finally:
        os.unlink(tmp_path)


def _post_odoo_note(odoo, task_id: int, message: str):
    """Post a chatter note on the task in Odoo."""
    try:
        pwd = os.getenv("ODOO_PASS")
        db  = os.getenv("ODOO_DB")
        odoo._models().execute_kw(
            db, odoo._uid, pwd,
            "project.task", "message_post",
            [[task_id]],
            {
                "body":        message,
                "message_type": "comment",
                "subtype_xmlid": "mail.mt_note",
            }
        )
    except Exception as e:
        logger.warning(f"Could not post note to task {task_id}: {e}")


async def _process_project(project_id: int, engine) -> int:
    """
    Check one project for new documents. Returns count of documents processed.
    """
    from core.odoo_documents import OdooDocuments
    from nlp.groq_client import validate_report

    odoo = engine.odoo
    docs_client = OdooDocuments(odoo)

    # Get all tasks for this project
    try:
        tasks = odoo.get_tasks(project_id=project_id)
    except Exception as e:
        logger.error(f"[Watcher] Could not load tasks for project {project_id}: {e}")
        return 0

    task_ids  = [t["id"] for t in tasks]
    task_by_id = {t["id"]: t for t in tasks}

    # Only look at documents newer than last check
    since = _last_checked.get(project_id)

    try:
        documents = docs_client.get_documents_for_tasks(task_ids, since=since)
    except Exception as e:
        logger.error(f"[Watcher] Could not fetch documents for project {project_id}: {e}")
        return 0

    processed = 0
    for doc in documents:
        doc_id  = doc["id"]
        task_id = doc.get("res_id")
        name    = doc.get("name", "unknown")

        if doc_id in _processed_doc_ids:
            continue

        task = task_by_id.get(task_id)
        if not task:
            continue

        # Skip tasks already Done/Cancelled
        stage = task.get("stage_id")
        stage_name = stage[1] if isinstance(stage, (list, tuple)) else str(stage)
        if stage_name in ("Done", "Cancelled"):
            _processed_doc_ids.add(doc_id)
            continue

        logger.info(f"[Watcher] New document '{name}' for task '{task['name']}' (project {project_id})")

        # Download file
        content = docs_client.get_docx_content_for_document(doc)
        if not content:
            logger.debug(f"[Watcher] Skipping '{name}' — not a report format or empty")
            continue

        # Extract text
        try:
            text = _extract_text_from_bytes(content, name)
        except Exception as e:
            logger.error(f"[Watcher] Text extraction failed for '{name}': {e}")
            continue

        if not text.strip():
            logger.warning(f"[Watcher] Empty text extracted from '{name}'")
            continue

        # Validate
        try:
            result = validate_report(text, task["name"])
        except Exception as e:
            logger.error(f"[Watcher] Validation failed for '{name}': {e}")
            continue

        # Post result as Odoo note on the task
        if result["is_valid"]:
            note = (
                f"✅ <b>Отчёт принят автоматически</b><br/>"
                f"Файл: <i>{name}</i><br/>"
                f"Оценка: {result['feedback']}"
            )
            logger.info(f"[Watcher] ✅ APPROVED: '{name}' for task '{task['name']}'")
        else:
            missing = result.get("missing", "")
            note = (
                f"❌ <b>Отчёт отклонён автоматически</b><br/>"
                f"Файл: <i>{name}</i><br/>"
                f"Причина: {result['feedback']}"
                + (f"<br/>Не хватает: {missing}" if missing and missing != "nothing" else "")
            )
            logger.info(f"[Watcher] ❌ REJECTED: '{name}' for task '{task['name']}' — {result['feedback']}")

        _post_odoo_note(odoo, task_id, note)
        _processed_doc_ids.add(doc_id)
        processed += 1

    # Update last checked time
    _last_checked[project_id] = datetime.now(timezone.utc)
    return processed


async def watch_all_projects(engine):
    """
    Background loop — polls all active projects for new documents.
    """
    logger.info(f"[Watcher] Starting document watcher (interval: {POLL_INTERVAL}s)")

    while True:
        try:
            # Get all projects from Odoo
            projects = engine.odoo.get_projects()
            project_ids = [p["id"] for p in projects]

            total = 0
            for pid in project_ids:
                count = await _process_project(pid, engine)
                total += count

            if total:
                logger.info(f"[Watcher] Processed {total} new document(s) across {len(project_ids)} projects")

        except Exception as e:
            logger.error(f"[Watcher] Unexpected error: {e}")

        await asyncio.sleep(POLL_INTERVAL)