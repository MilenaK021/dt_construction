from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from pydantic import BaseModel

from api.project_creator import router as creator_router
from api.meeting_mailer   import router as mailer_router
from api.deadline_alerting import router as alerting_router
from api.avatar_chat import router as avatar_router
from api.session_store import router as session_router
from api.simli_session import router as simli_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs inside the worker process AFTER the reloader forks.
    # This is the correct place to open network connections on Windows.
    from core.engine import DigitalTwinEngine
    app.state.engine = DigitalTwinEngine()
    yield
    # Cleanup (if needed) goes here


app = FastAPI(
    title="Digital Twin - Construction Management",
    description="AI-powered project management assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(creator_router)
app.include_router(mailer_router)
app.include_router(alerting_router)
app.include_router(avatar_router)
app.include_router(session_router)
app.include_router(simli_router)


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
def get_projects(request: Request):
    try:
        projects = request.app.state.engine.odoo.get_projects()
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}")
def get_project(project_id: int, request: Request):
    try:
        data = request.app.state.engine.load_project(project_id)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/tasks")
def get_tasks(project_id: int, request: Request):
    try:
        tasks = request.app.state.engine.odoo.get_tasks(project_id=project_id)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/employees")
def get_employees(request: Request):
    try:
        employees = request.app.state.engine.odoo.get_employees()
        return {"employees": employees}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/meeting-invitation")
def meeting_invitation(project_id: int, request: Request):
    try:
        invitation = request.app.state.engine.generate_meeting_invitation(project_id)
        return {"project_id": project_id, "invitation": invitation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask")
def answer_question(req: QuestionRequest, request: Request):
    try:
        answer = request.app.state.engine.answer_employee_question(
            question=req.question,
            project_id=req.project_id,
        )
        return {"question": req.question, "answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reports/submit")
def submit_report(req: ReportRequest, request: Request):
    try:
        result = request.app.state.engine.process_report(
            task_id=req.task_id,
            employee_name=req.employee_name,
            report_text=req.report_text,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/progress")
def check_progress(project_id: int, request: Request):
    try:
        progress = request.app.state.engine.check_project_progress(project_id)
        return progress
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/final-report")
def final_report(project_id: int, request: Request):
    try:
        report = request.app.state.engine.generate_final_report(project_id)
        return {"project_id": project_id, "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))