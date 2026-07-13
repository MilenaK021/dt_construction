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


def generate_meeting_summary(tasks: list, project_name: str) -> dict:
    """
    Generate structured meeting invitation data based on current project state.
    Returns a dict with keys: greeting, purpose, agenda_items, priority_tasks, closing.
    No date/location — those are added by the frontend/mailer.
    """
    from datetime import date
    today = date.today()

    # Classify tasks
    overdue, in_progress, done, upcoming = [], [], [], []
    for t in tasks:
        stage = t.get("stage_id", "")
        stage_name = stage[1] if isinstance(stage, (list, tuple)) else str(stage)
        dl = t.get("date_deadline", "")
        dl_date = None
        if dl:
            try:
                from datetime import datetime
                dl_date = datetime.strptime(dl[:10], "%Y-%m-%d").date()
            except:
                pass

        if stage_name in ("Done", "Cancelled"):
            done.append(t)
        elif dl_date and dl_date < today and stage_name not in ("Done", "Cancelled"):
            overdue.append({**t, "_days_late": (today - dl_date).days, "_deadline_fmt": dl_date.strftime("%d.%m.%Y")})
        elif stage_name in ("In Progress",):
            in_progress.append({**t, "_deadline_fmt": dl_date.strftime("%d.%m.%Y") if dl_date else "—"})
        else:
            upcoming.append({**t, "_deadline_fmt": dl_date.strftime("%d.%m.%Y") if dl_date else "—"})

    # Priority = overdue first, then closest deadline
    priority = sorted(overdue, key=lambda t: t.get("_days_late", 0), reverse=True)[:3]
    if len(priority) < 3:
        priority += sorted(in_progress, key=lambda t: t.get("date_deadline", ""))[:3 - len(priority)]

    overdue_lines = "\n".join(
        f"- {t['name']}: просрочено на {t['_days_late']} дн. (дедлайн {t['_deadline_fmt']})"
        for t in overdue
    ) or "нет просроченных задач"

    active_lines = "\n".join(
        f"- {t['name']} (дедлайн {t['_deadline_fmt']})"
        for t in in_progress[:5]
    ) or "нет задач в работе"

    priority_lines = "\n".join(
        f"- {t['name']}"
        for t in priority
    ) or "нет приоритетных задач"

    prompt = f"""Ты — руководитель проектного отдела. Напиши текст для письма-приглашения на совещание по проекту.

Проект: {project_name}
Дата анализа: {today.strftime("%d.%m.%Y")}
Всего задач: {len(tasks)} | Выполнено: {len(done)} | В работе: {len(in_progress)} | Просрочено: {len(overdue)}

Задачи в работе:
{active_lines}

Просроченные задачи:
{overdue_lines}

Приоритетные задачи (требуют особого внимания):
{priority_lines}

Напиши письмо строго в таком формате (JSON, без markdown, без пояснений):
{{
  "greeting": "одно вводное предложение-приветствие коллег",
  "purpose": "одно предложение — цель совещания, основанная на текущем состоянии проекта",
  "agenda": ["пункт повестки 1", "пункт повестки 2", "пункт повестки 3"],
  "overdue_note": "одно предложение о просроченных задачах, или пустая строка если их нет",
  "priority_note": "одно предложение о приоритетных задачах на ближайший период",
  "closing": "одно завершающее предложение с просьбой подготовиться"
}}

Пиши по-русски. Профессиональный, деловой стиль. Без упоминания дат и мест проведения совещания.
"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "Ты профессиональный менеджер строительных проектов. Отвечай только JSON."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=600
    )

    import json, re
    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        data = json.loads(raw)
    except:
        # Fallback to plain text if JSON fails
        data = {
            "greeting": "Уважаемые коллеги,",
            "purpose": f"Приглашаем вас на совещание по проекту «{project_name}».",
            "agenda": ["Обсуждение текущего прогресса", "Просроченные задачи", "Приоритеты на ближайший период"],
            "overdue_note": f"Имеется {len(overdue)} просроченных задач, требующих внимания." if overdue else "",
            "priority_note": "Просим уделить особое внимание приоритетным задачам.",
            "closing": "Просим прийти подготовленными."
        }

    # Attach structured stats for HTML rendering
    data["_stats"] = {
        "total":     len(tasks),
        "done":      len(done),
        "in_progress": len(in_progress),
        "overdue":   len(overdue),
    }
    data["_overdue_tasks"]  = [{"name": t["name"], "days_late": t["_days_late"], "deadline": t["_deadline_fmt"]} for t in overdue]
    data["_priority_tasks"] = [{"name": t["name"]} for t in priority]
    data["_project_name"]   = project_name

    return data


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