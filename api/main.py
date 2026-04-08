from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from core.engine import DigitalTwinEngine

app = FastAPI(
    title="Digital Twin - Construction Management",
    description="AI-powered project management assistant",
    version="1.0.0"
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Initialize the engine once when the server starts
engine = DigitalTwinEngine()


# ─────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
    project_id: int = None


class ReportRequest(BaseModel):
    task_id: int
    employee_name: str
    report_text: str


# ─────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Digital Twin is running"}


# --- STEP 1: Project data ---

@app.get("/projects")
def get_projects():
    """Get all projects from ODOO."""
    try:
        projects = engine.odoo.get_projects()
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    """Get one project with all its tasks and employees."""
    try:
        data = engine.load_project(project_id)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/tasks")
def get_tasks(project_id: int):
    """Get all tasks for a project."""
    try:
        tasks = engine.odoo.get_tasks(project_id=project_id)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/employees")
def get_employees():
    """Get all employees from ODOO."""
    try:
        employees = engine.odoo.get_employees()
        return {"employees": employees}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- STEP 1+2: Meeting invitation ---

@app.get("/projects/{project_id}/meeting-invitation")
def meeting_invitation(project_id: int):
    """Generate a meeting invitation for a project."""
    try:
        invitation = engine.generate_meeting_invitation(project_id)
        return {"project_id": project_id, "invitation": invitation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- STEP 2: Answer employee questions ---

@app.post("/ask")
def answer_question(request: QuestionRequest):
    """Employee asks a question. Returns AI answer."""
    try:
        answer = engine.answer_employee_question(
            question=request.question,
            project_id=request.project_id
        )
        return {
            "question": request.question,
            "answer": answer
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- STEP 3: Report submission ---

@app.post("/reports/submit")
def submit_report(request: ReportRequest):
    """
    Employee submits a completion report.
    Returns whether it is approved or rejected.
    """
    try:
        result = engine.process_report(
            task_id=request.task_id,
            employee_name=request.employee_name,
            report_text=request.report_text
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- STEP 3: Progress check ---

@app.get("/projects/{project_id}/progress")
def check_progress(project_id: int):
    """Check which tasks are on track and which are at risk."""
    try:
        progress = engine.check_project_progress(project_id)
        return progress
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- STEP 4: Final report ---

@app.get("/projects/{project_id}/final-report")
def final_report(project_id: int):
    """Generate the final project report for the director."""
    try:
        report = engine.generate_final_report(project_id)
        return {"project_id": project_id, "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
