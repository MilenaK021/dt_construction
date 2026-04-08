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
    Check if an employee's report is complete and valid.
    Returns a dict with: is_valid (bool), feedback (str)
    """
    prompt = f"""You are reviewing a work completion report for a construction task.

Task name: {task_name}

Employee report:
{report_text}

Check if the report contains:
1. Description of work actually done
2. Any problems or issues encountered
3. Current completion percentage or status

Respond in this exact format:
VALID: yes or no
FEEDBACK: one sentence explaining what is missing or confirming it looks good
"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a strict but fair construction project manager reviewing reports."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=256
    )

    raw = response.choices[0].message.content.strip()

    # Parse the response
    lines = raw.splitlines()
    is_valid = False
    feedback = "Could not parse validation response."

    for line in lines:
        if line.startswith("VALID:"):
            is_valid = "yes" in line.lower()
        if line.startswith("FEEDBACK:"):
            feedback = line.replace("FEEDBACK:", "").strip()

    return {
        "is_valid": is_valid,
        "feedback": feedback,
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
