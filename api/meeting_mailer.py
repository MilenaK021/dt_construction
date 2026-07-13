"""
meeting_mailer.py — sends beautiful HTML meeting invitation emails via SMTP.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText

from fastapi  import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv   import load_dotenv

load_dotenv()
router = APIRouter()


class InvitationRequest(BaseModel):
    project_id:  int
    recipients:  list[str]
    date:        str          # YYYY-MM-DD
    time:        str          # HH:MM
    link:        str = ""
    body:        str          # plain text fallback (legacy)
    invitation:  dict = {}    # structured data from generate_meeting_summary


def _fmt_date(iso: str) -> str:
    try:
        y, m, d = iso.split("-")
        months = ["января","февраля","марта","апреля","мая","июня",
                  "июля","августа","сентября","октября","ноября","декабря"]
        return f"{int(d)} {months[int(m)-1]} {y}"
    except Exception:
        return iso


def _build_html(inv: dict, date: str, time: str, link: str) -> str:
    """Build a beautiful HTML email from structured invitation data."""
    project_name   = inv.get("_project_name", "Проект")
    stats          = inv.get("_stats", {})
    overdue_tasks  = inv.get("_overdue_tasks", [])
    priority_tasks = inv.get("_priority_tasks", [])
    agenda         = inv.get("agenda", [])
    greeting       = inv.get("greeting", "Уважаемые коллеги,")
    purpose        = inv.get("purpose", "")
    overdue_note   = inv.get("overdue_note", "")
    priority_note  = inv.get("priority_note", "")
    closing        = inv.get("closing", "")

    fmt_date = _fmt_date(date)

    # Stats pills
    stats_html = ""
    if stats:
        def pill(label, val, color):
            return f'''<div style="display:inline-block;background:{color}15;border:1px solid {color}40;
border-radius:8px;padding:10px 18px;margin:4px;text-align:center;min-width:80px;">
<div style="font-size:22px;font-weight:700;color:{color}">{val}</div>
<div style="font-size:11px;color:#666;margin-top:2px">{label}</div></div>'''
        stats_html = f"""
        <div style="text-align:center;margin:20px 0">
            {pill("Всего задач",  stats.get("total",0),       "#185FA5")}
            {pill("Выполнено",    stats.get("done",0),        "#16a34a")}
            {pill("В работе",     stats.get("in_progress",0), "#d97706")}
            {pill("Просрочено",   stats.get("overdue",0),     "#dc2626")}
        </div>"""

    # Agenda items
    agenda_html = "".join(
        f'<li style="padding:6px 0;border-bottom:1px solid #f0f2f7;font-size:14px;color:#333">{item}</li>'
        for item in agenda
    )

    # Overdue tasks table
    overdue_html = ""
    if overdue_tasks:
        rows = "".join(
            f'''<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;font-size:13px;color:#1a2535">{t["name"]}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;font-size:13px;color:#888">{t["deadline"]}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;font-size:13px;font-weight:700;color:#dc2626">+{t["days_late"]} дн.</td>
            </tr>'''
            for t in overdue_tasks
        )
        overdue_html = f"""
        <div style="margin:24px 0">
          <div style="font-size:13px;font-weight:700;color:#dc2626;text-transform:uppercase;
               letter-spacing:0.05em;margin-bottom:10px">⚠️ Просроченные задачи</div>
          <table style="width:100%;border-collapse:collapse;background:#fff5f5;border-radius:10px;overflow:hidden">
            <thead>
              <tr style="background:#fef2f2">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600">Задача</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600">Дедлайн</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600">Просрочка</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>"""

    # Priority tasks
    priority_html = ""
    if priority_tasks:
        items = "".join(
            f'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f2f7">'
            f'<span style="width:8px;height:8px;border-radius:50%;background:#185FA5;flex-shrink:0;display:inline-block"></span>'
            f'<span style="font-size:14px;color:#1a2535">{t["name"]}</span></div>'
            for t in priority_tasks
        )
        priority_html = f"""
        <div style="margin:24px 0">
          <div style="font-size:13px;font-weight:700;color:#185FA5;text-transform:uppercase;
               letter-spacing:0.05em;margin-bottom:10px">🎯 Приоритеты</div>
          <div style="background:#f0f6ff;border-radius:10px;padding:12px 16px">{items}</div>
        </div>"""

    # Meeting details
    link_html = ""
    if link:
        link_html = f'<div style="margin-top:6px">🔗 <a href="{link}" style="color:#185FA5">{link}</a></div>'

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a2535 0%,#185FA5 100%);border-radius:16px 16px 0 0;padding:32px 36px">
    <div style="color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">
      Digital Twin · Construction Management
    </div>
    <div style="color:white;font-size:22px;font-weight:700;line-height:1.3;margin-bottom:4px">
      Приглашение на совещание
    </div>
    <div style="color:rgba(255,255,255,0.7);font-size:15px">{project_name}</div>
  </td></tr>

  <!-- Meeting time card -->
  <tr><td style="background:#185FA5;padding:16px 36px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:white;font-size:14px">
          📅 <strong>{fmt_date}</strong> &nbsp;·&nbsp; 🕐 <strong>{time}</strong>
          {link_html}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:white;padding:32px 36px;border-radius:0 0 16px 16px">

    <!-- Greeting -->
    <p style="font-size:15px;color:#1a2535;margin:0 0 8px">{greeting}</p>
    <p style="font-size:14px;color:#444;margin:0 0 24px;line-height:1.6">{purpose}</p>

    <!-- Stats -->
    {stats_html}

    <!-- Agenda -->
    <div style="margin:24px 0">
      <div style="font-size:13px;font-weight:700;color:#444;text-transform:uppercase;
           letter-spacing:0.05em;margin-bottom:10px">📋 Повестка дня</div>
      <ol style="margin:0;padding-left:20px">{agenda_html}</ol>
    </div>

    <!-- Overdue -->
    {overdue_html}

    <!-- Overdue note -->
    {"<p style='font-size:14px;color:#dc2626;background:#fff5f5;border-left:3px solid #dc2626;padding:10px 14px;border-radius:6px;margin:0 0 16px'>" + overdue_note + "</p>" if overdue_note else ""}

    <!-- Priority -->
    {priority_html}

    <!-- Priority note -->
    {"<p style='font-size:14px;color:#185FA5;background:#f0f6ff;border-left:3px solid #185FA5;padding:10px 14px;border-radius:6px;margin:0 0 16px'>" + priority_note + "</p>" if priority_note else ""}

    <!-- Closing -->
    <p style="font-size:14px;color:#444;margin:24px 0 0;line-height:1.6">{closing}</p>

    <!-- Divider -->
    <hr style="border:none;border-top:1px solid #f0f2f7;margin:24px 0">

    <!-- Footer -->
    <div style="font-size:12px;color:#aaa;text-align:center">
      Digital Twin · Construction Management Platform<br>
      Это письмо сгенерировано автоматически
    </div>

  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>"""
    return html


def _build_plain(inv: dict, date: str, time: str, link: str) -> str:
    """Plain text fallback."""
    lines = [
        f"Приглашение на совещание — {_fmt_date(date)} {time}",
        f"Проект: {inv.get('_project_name', '')}",
        "",
        inv.get("greeting", ""),
        inv.get("purpose", ""),
        "",
        "Повестка дня:",
    ]
    for item in inv.get("agenda", []):
        lines.append(f"  • {item}")
    if inv.get("overdue_note"):
        lines += ["", inv["overdue_note"]]
    if inv.get("priority_note"):
        lines.append(inv["priority_note"])
    lines += ["", inv.get("closing", ""), ""]
    if link:
        lines.append(f"Ссылка: {link}")
    return "\n".join(lines)


def _send_smtp(recipients: list[str], subject: str, plain: str, html: str):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", 587))
    user = os.getenv("SMTP_USER", "")
    pwd  = os.getenv("SMTP_PASS", "")
    frm  = os.getenv("SMTP_FROM", user)

    if not user or not pwd:
        raise ValueError("SMTP_USER and SMTP_PASS must be set in .env")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = frm
    msg["To"]      = ", ".join(recipients)

    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html,  "html",  "utf-8"))

    with smtplib.SMTP(host, port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(user, pwd)
        smtp.sendmail(frm, recipients, msg.as_string())


@router.post("/meeting/send-invitation")
def send_invitation(req: InvitationRequest):
    subject = f"Совещание по проекту — {_fmt_date(req.date)}, {req.time}"

    inv = req.invitation or {}

    if inv:
        plain = _build_plain(inv, req.date, req.time, req.link)
        html  = _build_html(inv,  req.date, req.time, req.link)
    else:
        # Legacy plain text fallback
        plain = req.body
        html  = "<pre style='font-family:sans-serif'>" + req.body.replace("\n", "<br>") + "</pre>"

    try:
        _send_smtp(req.recipients, subject, plain, html)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=500,
            detail="SMTP authentication failed. Check SMTP_USER / SMTP_PASS in .env.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email error: {e}")

    return {"status": "sent", "recipients": req.recipients, "subject": subject}