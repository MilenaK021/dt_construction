"""
odoo_documents.py — fetch documents linked to project tasks from Odoo Documents module.
Place in: core/odoo_documents.py

Uses the same OdooClient XML-RPC connection.
Reads documents.document records linked to project.task via res_model/res_id.
"""

import base64
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class OdooDocuments:
    def __init__(self, odoo_client):
        self._odoo = odoo_client

    def _call(self, model, method, domain, fields=None, limit=100):
        uid = self._odoo._uid
        pwd = __import__("os").getenv("ODOO_PASS")
        db  = __import__("os").getenv("ODOO_DB")
        kwargs = {"limit": limit}
        if fields:
            kwargs["fields"] = fields
        return self._odoo._models().execute_kw(
            db, uid, pwd, model, method, [domain], kwargs
        )

    def get_documents_for_tasks(self, task_ids: list[int], since: datetime = None) -> list[dict]:
        """
        Fetch all documents.document records linked to the given task IDs.
        Optionally filter to only documents created/updated after `since`.

        Returns list of dicts with document metadata (no file content yet).
        """
        if not task_ids:
            return []

        domain = [
            ["res_model", "=", "project.task"],
            ["res_id",    "in", task_ids],
        ]
        if since:
            # Odoo datetime format
            since_str = since.strftime("%Y-%m-%d %H:%M:%S")
            domain.append(["write_date", ">", since_str])

        try:
            docs = self._call(
                "documents.document",
                "search_read",
                domain,
                fields=[
                    "id", "name", "res_model", "res_id",
                    "mimetype", "file_size", "create_date", "write_date",
                    "attachment_id", "folder_id", "owner_id",
                ],
                limit=200,
            )
            return docs
        except Exception as e:
            # documents module may not be installed — fall back to ir.attachment
            logger.warning(f"documents.document not available ({e}), trying ir.attachment")
            return self._get_attachments_for_tasks(task_ids, since)

    def _get_attachments_for_tasks(self, task_ids: list[int], since: datetime = None) -> list[dict]:
        """
        Fallback: read ir.attachment directly (works even without Documents module).
        """
        domain = [
            ["res_model", "=", "project.task"],
            ["res_id",    "in", task_ids],
        ]
        if since:
            domain.append(["write_date", ">", since.strftime("%Y-%m-%d %H:%M:%S")])

        attachments = self._call(
            "ir.attachment",
            "search_read",
            domain,
            fields=["id", "name", "res_id", "mimetype", "file_size", "create_date", "write_date"],
            limit=200,
        )
        # Normalize to same shape as documents.document
        for a in attachments:
            a["attachment_id"] = [a["id"], a["name"]]
            a["folder_id"]     = False
        return attachments

    def get_file_content(self, attachment_id: int) -> bytes | None:
        """
        Download the raw file bytes for an ir.attachment record.
        Returns None if unavailable.
        """
        uid = self._odoo._uid
        pwd = __import__("os").getenv("ODOO_PASS")
        db  = __import__("os").getenv("ODOO_DB")

        try:
            records = self._odoo._models().execute_kw(
                db, uid, pwd,
                "ir.attachment", "read",
                [[attachment_id]],
                {"fields": ["datas", "name", "mimetype"]}
            )
            if not records or not records[0].get("datas"):
                return None
            return base64.b64decode(records[0]["datas"])
        except Exception as e:
            logger.error(f"Failed to fetch attachment {attachment_id}: {e}")
            return None

    def get_docx_content_for_document(self, doc: dict) -> bytes | None:
        """
        Given a document dict (from get_documents_for_tasks), fetch its file bytes.
        Only proceeds for .docx and .pdf files (report formats).
        """
        mime = (doc.get("mimetype") or "").lower()
        name = (doc.get("name") or "").lower()

        is_report = (
            "word" in mime or "pdf" in mime or
            name.endswith(".docx") or name.endswith(".pdf") or
            name.endswith(".doc")
        )
        if not is_report:
            logger.debug(f"Skipping non-report file: {doc['name']} ({mime})")
            return None

        att = doc.get("attachment_id")
        att_id = att[0] if isinstance(att, (list, tuple)) else att
        if not att_id:
            return None

        return self.get_file_content(att_id)