"""
meeting_mailer.py — sends meeting invitation emails via SMTP.
Add to main.py:  from api.meeting_mailer import router as mailer_router
                 app.include_router(mailer_router)

Required .env vars:
  SMTP_HOST      e.g. smtp.gmail.com
  SMTP_PORT      e.g. 587
  SMTP_USER      sender address
  SMTP_PASS      app password (Gmail: generate in Google Account → Security)
  SMTP_FROM      display name + address, e.g. "Digital Twin <no-reply@company.kz>"
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText

from fastapi    import APIRouter, HTTPException
from pydantic   import BaseModel
from dotenv     import load_dotenv

load_dotenv()

router = APIRouter()


class InvitationRequest(BaseModel):
    project_id:  int
    recipients:  list[str]
    date:        str          # YYYY-MM-DD
    time:        str          # HH:MM
    link:        str = ""
    body:        str          # full invitation text


def _fmt_date(iso: str) -> str:
    try:
        y, m, d = iso.split("-")
        return f"{d}.{m}.{y}"
    except Exception:
        return iso


def _send_smtp(recipients: list[str], subject: str, body_text: str):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", 587))
    user = os.getenv("SMTP_USER", "")
    pwd  = os.getenv("SMTP_PASS", "")
    frm  = os.getenv("SMTP_FROM", user)

    if not user or not pwd:
        raise ValueError(
            "SMTP_USER and SMTP_PASS must be set in .env to send emails."
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = frm
    msg["To"]      = ", ".join(recipients)

    # Plain-text part
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # Simple HTML part (preserves line breaks)
    html_body = "<br>".join(
        line for line in body_text.splitlines()
    )
    msg.attach(MIMEText(f"<pre style='font-family:sans-serif'>{html_body}</pre>",
                        "html", "utf-8"))

    with smtplib.SMTP(host, port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(user, pwd)
        smtp.sendmail(frm, recipients, msg.as_string())


@router.post("/meeting/send-invitation")
def send_invitation(req: InvitationRequest):
    subject = (
        f"Приглашение на совещание — {_fmt_date(req.date)} {req.time}"
    )

    try:
        _send_smtp(req.recipients, subject, req.body)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(
            status_code=500,
            detail="SMTP authentication failed. Check SMTP_USER / SMTP_PASS in .env."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email error: {e}")

    return {
        "status":     "sent",
        "recipients": req.recipients,
        "subject":    subject,
    }