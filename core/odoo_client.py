import xmlrpc.client
import os
from dotenv import load_dotenv

load_dotenv()

ODOO_URL  = os.getenv("ODOO_URL")
ODOO_DB   = os.getenv("ODOO_DB")
ODOO_USER = os.getenv("ODOO_USER")
ODOO_PASS = os.getenv("ODOO_PASS")


class OdooClient:
    def __init__(self):
        # Only authenticate once to get the uid.
        # ServerProxy objects are created fresh per call (not thread-safe on Windows).
        common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        self._uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PASS, {})
        if not self._uid:
            raise ConnectionError("ODOO authentication failed.")
        print(f"Connected to ODOO as user ID: {self._uid}")

    def _models(self):
        return xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

    def _call(self, model, method, domain=None, fields=None, limit=100):
        kwargs = {}
        if fields:
            kwargs["fields"] = fields
        if limit:
            kwargs["limit"] = limit
        return self._models().execute_kw(
            ODOO_DB, self._uid, ODOO_PASS,
            model, method,
            [domain or []],
            kwargs
        )

    def get_projects(self):
        return self._call(
            "project.project",
            "search_read",
            domain=[],
            fields=["id", "name", "date_start", "date", "user_id"]
        )

    def get_tasks(self, project_id=None):
        domain = [["project_id", "=", project_id]] if project_id else []
        tasks  = self._call(
            "project.task",
            "search_read",
            domain=domain,
            fields=[
                "id", "name", "project_id",
                "date_deadline", "progress",
                "user_ids", "stage_id",
                "depend_on_ids", "description", "date_assign"
            ]
        )
        import re
        for t in tasks:
            desc = t.get("description") or ""

            # New format: [meta:duration=N|phase=N|section=X.X|assignees=A,B]
            meta_match = re.search(r"\[meta:([^\]]+)\]", desc)
            if meta_match:
                meta_str = meta_match.group(1)
                meta = dict(kv.split("=", 1) for kv in meta_str.split("|") if "=" in kv)
                t["duration_days"] = int(meta.get("duration", 5))
                t["chain_id"]      = int(meta.get("chain_id", 1))
                t["chain_name"]    = meta.get("chain_name", "")
                t["section"]       = meta.get("section", "")
                # legacy phase fallback
                t["phase"]         = int(meta.get("chain_id", meta.get("phase", 1)))
                raw_assignees      = meta.get("assignees", "")
                t["assignees"]     = [a.strip() for a in raw_assignees.split(",") if a.strip()]
                # Clean description — remove meta tag, keep human text
                t["description"]   = re.sub(r"\[meta:[^\]]+\]\s*", "", desc).strip()
            else:
                # Legacy format: [duration:N] assignee1, assignee2
                dur_match = re.search(r"\[duration:(\d+)\]", desc)
                t["duration_days"] = int(dur_match.group(1)) if dur_match else 5
                t["phase"]         = self._infer_phase_from_name(t.get("name", ""))
                t["section"]       = self._infer_section_from_name(t.get("name", ""))
                t["assignees"]     = []
                t["description"]   = re.sub(r"\[duration:\d+\]\s*", "", desc).strip()

        return tasks

    @staticmethod
    def _infer_phase_from_name(name: str) -> int:
        """Extract phase from task name like '1.2 Полевой этап' → 1"""
        import re
        m = re.match(r"^(\d+)\.", name.strip())
        return int(m.group(1)) if m else 1

    @staticmethod
    def _infer_section_from_name(name: str) -> str:
        """Extract section from task name like '1.2 Полевой этап' → '1.2'"""
        import re
        m = re.match(r"^(\d+\.\d+)", name.strip())
        return m.group(1) if m else ""

    def get_employees(self):
        return self._call(
            "hr.employee",
            "search_read",
            domain=[],
            fields=["id", "name", "job_title", "work_email", "department_id"]
        )

    def update_task_deadline(self, task_id, new_deadline):
        return self._models().execute_kw(
            ODOO_DB, self._uid, ODOO_PASS,
            "project.task", "write",
            [[task_id], {"date_deadline": new_deadline}]
        )


    def set_task_stage(self, task_id: int, stage_name: str) -> bool:
        """Find a stage by name and set it on the task."""
        # Find the stage id matching the name (case-insensitive)
        stages = self._models().execute_kw(
            ODOO_DB, self._uid, ODOO_PASS,
            "project.task.type", "search_read",
            [[["name", "ilike", stage_name]]],
            {"fields": ["id", "name"], "limit": 5}
        )
        if not stages:
            return False
        stage_id = stages[0]["id"]
        return self._models().execute_kw(
            ODOO_DB, self._uid, ODOO_PASS,
            "project.task", "write",
            [[task_id], {"stage_id": stage_id}]
        )

if __name__ == "__main__":
    client = OdooClient()

    print("\n--- PROJECTS ---")
    projects = client.get_projects()
    for p in projects:
        print(f"  [{p['id']}] {p['name']}")

    print("\n--- TASKS ---")
    tasks = client.get_tasks()
    for t in tasks:
        print(f"  [{t['id']}] {t['name']} | stage: {t.get('stage_id')} | state: {t.get('state')}")

    print("\n--- EMPLOYEES ---")
    employees = client.get_employees()
    for e in employees:
        print(f"  [{e['id']}] {e['name']} | {e['work_email']}")