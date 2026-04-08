import os
from datetime import datetime
from dotenv import load_dotenv
from core.odoo_client import OdooClient
from nlp.groq_client import ask, validate_report, generate_meeting_summary

load_dotenv()


class DigitalTwinEngine:
    def __init__(self):
        print("Initializing Digital Twin Engine...")
        self.odoo = OdooClient()
        print("Engine ready.\n")

    # -------------------------
    # STEP 1: PROJECT START
    # -------------------------

    def load_project(self, project_id: int) -> dict:
        """
        Load a project and all its tasks from ODOO.
        This is the first thing that happens when a project starts.
        """
        projects = self.odoo.get_projects()
        project = next((p for p in projects if p["id"] == project_id), None)

        if not project:
            raise ValueError(f"Project {project_id} not found in ODOO")

        tasks = self.odoo.get_tasks(project_id=project_id)
        employees = self.odoo.get_employees()

        print(f"Loaded project: {project['name']}")
        print(f"  Tasks found: {len(tasks)}")
        print(f"  Employees found: {len(employees)}")

        return {
            "project": project,
            "tasks": tasks,
            "employees": employees
        }

    def generate_meeting_invitation(self, project_id: int) -> str:
        """
        Step 1 + Step 2: Generate a meeting invitation for the project kickoff.
        In a full system this would be emailed to all employees.
        """
        data = self.load_project(project_id)
        project_name = data["project"]["name"]
        tasks = data["tasks"]

        print(f"\nGenerating meeting invitation for: {project_name}")
        invitation = generate_meeting_summary(tasks, project_name)
        return invitation

    # -------------------------
    # STEP 2: ONLINE MEETING
    # -------------------------

    def answer_employee_question(self, question: str, project_id: int = None) -> str:
        """
        Step 2: Employee asks a question during or after the meeting.
        We pass project context so the model can give relevant answers.
        """
        context = ""

        if project_id:
            data = self.load_project(project_id)
            project = data["project"]
            tasks = data["tasks"]

            task_lines = "\n".join([
                f"- {t['name']} (progress: {t['progress']}%, deadline: {t['date_deadline']})"
                for t in tasks[:10]  # limit to avoid token overflow
            ])

            context = f"""
Project name: {project['name']}
Tasks:
{task_lines}
"""

        answer = ask(question, context=context)
        return answer

    # -------------------------
    # STEP 3: PROGRESS TRACKING
    # -------------------------

    def process_report(self, task_id: int, employee_name: str, report_text: str) -> dict:
        """
        Step 3: Employee submits a completion report.
        We validate it and decide if further work is allowed or not.
        """
        # Get the task name from ODOO
        all_tasks = self.odoo.get_tasks()
        task = next((t for t in all_tasks if t["id"] == task_id), None)

        if not task:
            return {
                "status": "error",
                "message": f"Task {task_id} not found"
            }

        task_name = task["name"]
        print(f"\nProcessing report from {employee_name} for task: {task_name}")

        # Validate the report using Groq
        result = validate_report(report_text, task_name)

        if result["is_valid"]:
            print(f"  Report APPROVED — further work is allowed")
            return {
                "status": "approved",
                "task_id": task_id,
                "task_name": task_name,
                "employee": employee_name,
                "feedback": result["feedback"],
                "further_work_allowed": True
            }
        else:
            print(f"  Report REJECTED — {result['feedback']}")
            return {
                "status": "rejected",
                "task_id": task_id,
                "task_name": task_name,
                "employee": employee_name,
                "feedback": result["feedback"],
                "further_work_allowed": False
            }

    def check_project_progress(self, project_id: int) -> dict:
        """
        Step 3: Daily check — look at all tasks and flag any that look behind.
        This is the foundation for the delay prediction feature we'll add later.
        """
        data = self.load_project(project_id)
        tasks = data["tasks"]

        on_track = []
        at_risk = []
        no_deadline = []

        today = datetime.today().date()

        for task in tasks:
            deadline = task.get("date_deadline")
            progress = task.get("progress", 0)

            if not deadline:
                no_deadline.append(task["name"])
                continue

            deadline_date = datetime.strptime(deadline, "%Y-%m-%d").date()
            days_left = (deadline_date - today).days

            # Simple rule: if less than 20% done but deadline is in less than 7 days — at risk
            if days_left < 7 and progress < 20:
                at_risk.append({
                    "task": task["name"],
                    "days_left": days_left,
                    "progress": progress
                })
            else:
                on_track.append(task["name"])

        return {
            "project": data["project"]["name"],
            "on_track": on_track,
            "at_risk": at_risk,
            "no_deadline": no_deadline
        }

    # -------------------------
    # STEP 4: FINAL REPORT
    # -------------------------

    def generate_final_report(self, project_id: int) -> str:
        """
        Step 4: Project is done. Generate a summary report for the director.
        """
        data = self.load_project(project_id)
        project = data["project"]
        tasks = data["tasks"]

        task_summary = "\n".join([
            f"- {t['name']}: {t['progress']}% complete, deadline: {t['date_deadline']}"
            for t in tasks
        ])

        prompt = f"""Write a professional project completion report for the director.

Project: {project['name']}
Tasks summary:
{task_summary}

The report should include:
1. Project overview
2. Summary of completed work
3. Any tasks that were not finished (progress < 100%)
4. Overall assessment

Write in Russian. Be concise but professional.
"""

        response = ask(prompt)
        return response


# -------------------------
# TEST
# -------------------------
if __name__ == "__main__":
    engine = DigitalTwinEngine()

    # Pick the first real construction project (id=4 from your ODOO output)
    PROJECT_ID = 4

    print("\n========== STEP 1: LOAD PROJECT ==========")
    data = engine.load_project(PROJECT_ID)
    print(f"Project: {data['project']['name']}")

    print("\n========== STEP 1+2: MEETING INVITATION ==========")
    invitation = engine.generate_meeting_invitation(PROJECT_ID)
    print(invitation)

    print("\n========== STEP 2: ANSWER QUESTION ==========")
    answer = engine.answer_employee_question(
        "Какие задачи сейчас в приоритете?",
        project_id=PROJECT_ID
    )
    print(answer)

    print("\n========== STEP 3: PROCESS REPORT ==========")
    result = engine.process_report(
        task_id=26,
        employee_name="David Miller",
        report_text="Выполнены работы по фундаменту. Проблем не возникло. Готовность 80%."
    )
    print(result)

    print("\n========== STEP 3: PROGRESS CHECK ==========")
    progress = engine.check_project_progress(PROJECT_ID)
    print(f"On track: {len(progress['on_track'])} tasks")
    print(f"At risk: {progress['at_risk']}")
    print(f"No deadline set: {len(progress['no_deadline'])} tasks")

    print("\n========== STEP 4: FINAL REPORT ==========")
    report = engine.generate_final_report(PROJECT_ID)
    print(report)
