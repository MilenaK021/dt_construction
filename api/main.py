from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from core.engine import DigitalTwinEngine
from api.project_creator import router as creator_router
from api.meeting_mailer import router as mailer_router

app = FastAPI(
    title="Digital Twin - Construction Management",
    description="AI-powered project management assistant",
    version="1.0.0"
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the project-creator sub-router (no extra prefix – routes are /projects/…)
app.include_router(creator_router)
app.include_router(mailer_router)

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


@app.get("/projects")
def get_projects():
    try:
        projects = engine.odoo.get_projects()
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    try:
        data = engine.load_project(project_id)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/tasks")
def get_tasks(project_id: int):
    try:
        tasks = engine.odoo.get_tasks(project_id=project_id)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/employees")
def get_employees():
    try:
        employees = engine.odoo.get_employees()
        return {"employees": employees}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/meeting-invitation")
def meeting_invitation(project_id: int):
    try:
        invitation = engine.generate_meeting_invitation(project_id)
        return {"project_id": project_id, "invitation": invitation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask")
def answer_question(request: QuestionRequest):
    try:
        answer = engine.answer_employee_question(
            question=request.question,
            project_id=request.project_id
        )
        return {"question": request.question, "answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reports/submit")
def submit_report(request: ReportRequest):
    try:
        result = engine.process_report(
            task_id=request.task_id,
            employee_name=request.employee_name,
            report_text=request.report_text
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/progress")
def check_progress(project_id: int):
    try:
        progress = engine.check_project_progress(project_id)
        return progress
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/final-report")
def final_report(project_id: int):
    try:
        report = engine.generate_final_report(project_id)
        return {"project_id": project_id, "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))