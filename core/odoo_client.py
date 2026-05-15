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
        # Parse duration_days from description field where we stored it as [duration:N]
        import re
        for t in tasks:
            desc = t.get("description") or ""
            m    = re.search(r"\[duration:(\d+)\]", desc)
            t["duration_days"] = int(m.group(1)) if m else 5
            # Clean display description (remove the tag)
            t["description"] = re.sub(r"\[duration:\d+\]\s*", "", desc).strip()
        return tasks

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