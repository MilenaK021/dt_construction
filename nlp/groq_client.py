import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

SYSTEM_PROMPT = """You are an AI assistant for a construction management company.
You help employees with questions about their tasks, deadlines, and project procedures.
You can communicate in both Russian and English — always reply in the same language the employee used.
Be concise, professional, and helpful.
If you don't know something specific about the project, say so honestly and suggest they contact their supervisor.
"""


def ask(question: str, context: str = "") -> str:
    """
    Send a question to Groq and get a response.
    context: optional project/task info to include so the model has real data.
    """
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]

    if context:
        messages.append({
            "role": "system",
            "content": f"Current project context:\n{context}"
        })

    messages.append({
        "role": "user",
        "content": question
    })

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.3,   # low = more consistent, factual answers
        max_tokens=1024
    )

    return response.choices[0].message.content


def validate_report(report_text: str, task_name: str) -> dict:
    """
    Strictly validate an employee's completion report.
    Returns a dict with: is_valid (bool), feedback (str)
    """
    prompt = f"""You are a construction project manager validating a task completion report.

TASK: {task_name}

SUBMITTED REPORT:
{report_text}

---
Evaluate the report against these 3 criteria:

1. TASK MATCH: Does the report describe work that is specifically related to "{task_name}"?
   - FAIL if the report explicitly mentions or is clearly written for a different task name.
   - FAIL if the work described (e.g. field surveys, drilling) does not match the nature of "{task_name}" (e.g. approval, handover).
   - When in doubt, compare the key activities in the report to what "{task_name}" would logically involve.

2. WORK DONE: Does the report describe what was actually done?
   - A few sentences is enough. It does not need to be exhaustive.

3. COMPLETION: Does the report mention a completion percentage OR a clear status
   (e.g. "done", "completed", "80% complete", "in progress", "завершено на 70%")?
   - Any reasonable indication of progress counts.

OBSTACLES criterion is optional — the employee may omit it if there were no issues.

APPROVE if criteria 1, 2, and 3 are all met.
REJECT only if one or more of criteria 1, 2, or 3 is clearly missing.

Respond in this exact format (no extra text):
VALID: yes or no
MISSING: comma-separated list of failed criteria (1, 2, or 3), or "nothing" if all pass
FEEDBACK: one sentence — what to fix, or confirmation that the report is complete
"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": (
                "You are a fair construction project manager reviewing completion reports. "
                "Approve reports that contain the required information even if briefly stated. "
                "Reject only when a required criterion is clearly absent."
            )},
            {"role": "user", "content": prompt}
        ],
        temperature=0.0,
        max_tokens=300
    )

    raw = response.choices[0].message.content.strip()

    lines = raw.splitlines()
    is_valid = False
    feedback = "Could not parse validation response."
    missing  = ""

    for line in lines:
        if line.startswith("VALID:"):
            is_valid = "yes" in line.lower()
        if line.startswith("MISSING:"):
            missing = line.replace("MISSING:", "").strip()
        if line.startswith("FEEDBACK:"):
            feedback = line.replace("FEEDBACK:", "").strip()

    # Extra safety: if missing is not "nothing", force rejection
    if missing and missing.lower() != "nothing":
        is_valid = False

    return {
        "is_valid": is_valid,
        "feedback": feedback,
        "missing":  missing,
        "raw_response": raw
    }


def generate_meeting_summary(tasks: list, project_name: str) -> str:
    """
    Generate a meeting invitation / summary text based on current tasks.
    """
    task_lines = "\n".join([
        f"- {t['name']} (deadline: {t['date_deadline']}, progress: {t['progress']}%)"
        for t in tasks
    ])

    prompt = f"""Write a short professional meeting invitation for a construction project status meeting.

Project: {project_name}
Current tasks:
{task_lines}

The invitation should:
- Greet the team
- State the purpose of the meeting
- List the key topics (based on the tasks above)
- Ask them to come prepared
- Be no longer than 150 words
- Write in Russian
"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a professional construction project manager."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4,
        max_tokens=512
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    # Test 1: simple question
    print("--- TEST 1: Simple question ---")
    answer = ask("What should I do if my task is delayed?")
    print(answer)

    # Test 2: report validation
    print("\n--- TEST 2: Report validation ---")
    good_report = "Completed foundation work today. No major issues. Currently at 80% completion."
    bad_report = "Did some stuff."

    result1 = validate_report(good_report, "Foundation Work")
    print(f"Good report → valid: {result1['is_valid']} | feedback: {result1['feedback']}")

    result2 = validate_report(bad_report, "Foundation Work")
    print(f"Bad report  → valid: {result2['is_valid']} | feedback: {result2['feedback']}")

    # Test 3: meeting summary
    print("\n--- TEST 3: Meeting invitation ---")
    fake_tasks = [
        {"name": "Foundation", "date_deadline": "2025-04-01", "progress": 80},
        {"name": "Roof installation", "date_deadline": "2025-05-15", "progress": 10},
    ]
    summary = generate_meeting_summary(fake_tasks, "House Renovation")
    print(summary)