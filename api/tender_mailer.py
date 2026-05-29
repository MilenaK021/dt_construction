"""
tender_mailer.py  ->  api/tender_mailer.py
Sends tender details email with a PDF attachment.
"""

import os, io, smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email.mime.base      import MIMEBase
from email                import encoders

from fastapi   import APIRouter, HTTPException
from pydantic  import BaseModel
from dotenv    import load_dotenv

from reportlab.lib.pagesizes   import A4
from reportlab.lib             import colors
from reportlab.lib.units       import mm
from reportlab.lib.styles      import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus        import (SimpleDocTemplate, Paragraph, Spacer,
                                       Table, TableStyle, HRFlowable)
from reportlab.pdfbase         import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

load_dotenv()
router = APIRouter()

# ── Pydantic models ───────────────────────────────────────────────────────────

class TenderData(BaseModel):
    id:           str
    title:        str
    customer:     str
    region:       str
    budget:       str
    deadline:     str
    category:     str
    description:  str
    requirements: list[str] = []
    published:    str = ""

class TenderEmailRequest(BaseModel):
    tender:     TenderData
    recipient:  str          # director email from localStorage / profile


# ── PDF builder ───────────────────────────────────────────────────────────────

def _build_pdf(tender: TenderData) -> bytes:
    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=18*mm,  bottomMargin=18*mm,
    )

    W = A4[0] - 40*mm   # usable width

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TTitle",
        fontName="Helvetica-Bold",
        fontSize=15,
        textColor=colors.HexColor("#1a2535"),
        spaceAfter=2*mm,
        leading=19,
    )
    sub_style = ParagraphStyle(
        "TSub",
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#6b7a8f"),
        spaceAfter=5*mm,
    )
    section_style = ParagraphStyle(
        "TSection",
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#2563eb"),
        spaceBefore=5*mm,
        spaceAfter=2*mm,
    )
    body_style = ParagraphStyle(
        "TBody",
        fontName="Helvetica",
        fontSize=9.5,
        textColor=colors.HexColor("#374151"),
        leading=14,
        spaceAfter=2*mm,
    )
    req_style = ParagraphStyle(
        "TReq",
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#374151"),
        leading=13,
        leftIndent=10,
    )

    story = []

    # Header block
    header_data = [[
        Paragraph(f'<b>Digital Twin</b>', ParagraphStyle("DT", fontName="Helvetica-Bold",
            fontSize=10, textColor=colors.HexColor("#2563eb"))),
        Paragraph(f'Сформировано: {datetime.now().strftime("%d.%m.%Y %H:%M")}',
            ParagraphStyle("DT2", fontName="Helvetica", fontSize=8,
            textColor=colors.HexColor("#9ca3af"), alignment=2)),
    ]]
    ht = Table(header_data, colWidths=[W*0.6, W*0.4])
    ht.setStyle(TableStyle([
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LINEBELOW",   (0,0), (-1,-1), 0.5, colors.HexColor("#e4e8ef")),
    ]))
    story.append(ht)
    story.append(Spacer(1, 5*mm))

    # Title
    story.append(Paragraph(tender.title, title_style))
    story.append(Paragraph(f'Тендер #{tender.id} · {tender.category}', sub_style))
    story.append(HRFlowable(width=W, thickness=0.5, color=colors.HexColor("#e4e8ef")))
    story.append(Spacer(1, 4*mm))

    # Key details table
    story.append(Paragraph("Основные параметры", section_style))
    details = [
        ["Заказчик",       tender.customer],
        ["Регион",         tender.region],
        ["Бюджет",         tender.budget],
        ["Срок подачи",    tender.deadline],
        ["Опубликован",    tender.published or "—"],
        ["Категория",      tender.category],
    ]
    dt = Table(
        [[Paragraph(f'<b>{r[0]}</b>', ParagraphStyle("K", fontName="Helvetica-Bold",
              fontSize=9, textColor=colors.HexColor("#6b7a8f"))),
          Paragraph(r[1], ParagraphStyle("V", fontName="Helvetica",
              fontSize=9.5, textColor=colors.HexColor("#1a2535")))]
         for r in details],
        colWidths=[40*mm, W - 40*mm],
    )
    dt.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("ROWBACKGROUNDS",(0,0), (-1,-1),
            [colors.HexColor("#f8f9fc"), colors.white]),
        ("LINEBELOW", (0,-1), (-1,-1), 0.5, colors.HexColor("#e4e8ef")),
    ]))
    story.append(dt)
    story.append(Spacer(1, 4*mm))

    # Description
    story.append(Paragraph("Описание", section_style))
    story.append(Paragraph(tender.description, body_style))

    # Requirements
    if tender.requirements:
        story.append(Paragraph("Требования к участнику", section_style))
        for req in tender.requirements:
            story.append(Paragraph(f'• {req}', req_style))
        story.append(Spacer(1, 2*mm))

    # Footer
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width=W, thickness=0.5, color=colors.HexColor("#e4e8ef")))
    story.append(Spacer(1, 2*mm))
    footer_txt = (
        "Данный документ сформирован автоматически системой Digital Twin — "
        "Construction Management. Источник: goszakup.gov.kz (mock data)."
    )
    story.append(Paragraph(footer_txt, ParagraphStyle(
        "Footer", fontName="Helvetica", fontSize=7.5,
        textColor=colors.HexColor("#9ca3af"), leading=11,
    )))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ── Email builder & sender ────────────────────────────────────────────────────


def _detail_rows(tender: "TenderData") -> str:
    rows = [
        ("Заказчик",    tender.customer),
        ("Регион",      tender.region),
        ("Бюджет",      f'<span style="color:#16a34a;font-weight:700">{tender.budget}</span>'),
        ("Срок подачи", f'<span style="color:#dc2626;font-weight:600">{tender.deadline}</span>'),
    ]
    parts = []
    for label, val in rows:
        parts.append(
            '<tr style="border-bottom:1px solid #e4e8ef">' +
            f'<td style="padding:11px 16px;font-size:11px;font-weight:600;color:#8896ab;width:130px;white-space:nowrap">{label}</td>' +
            f'<td style="padding:11px 16px;font-size:13px;color:#1a2535;font-weight:500">{val}</td>' +
            '</tr>'
        )
    return "".join(parts)


def _reqs_block(tender: "TenderData", reqs_html: str) -> str:
    if not tender.requirements:
        return ""
    return (
        '<tr><td style="padding:0 32px 24px">' +
        '<div style="font-size:12px;font-weight:600;color:#2563eb;text-transform:uppercase;' +
        'letter-spacing:.06em;margin-bottom:10px">Требования</div>' +
        f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.8">{reqs_html}</ul>' +
        '</td></tr>'
    )


def _html_email(tender: TenderData) -> str:
    reqs_html = "".join(f"<li>{r}</li>" for r in tender.requirements)
    return f"""
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'DM Sans',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e8ef">

        <!-- Header -->
        <tr>
          <td style="background:#0f1e30;padding:24px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#60a5fa;font-size:13px;font-weight:600;letter-spacing:.03em">DIGITAL TWIN</span>
                  <div style="color:rgba(255,255,255,.5);font-size:11px;margin-top:2px">Construction Management</div>
                </td>
                <td align="right">
                  <span style="background:rgba(59,130,246,.2);color:#60a5fa;font-size:11px;
                    font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid rgba(59,130,246,.3)">
                    Новый тендер
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title block -->
        <tr>
          <td style="padding:28px 32px 20px">
            <div style="font-size:11px;color:#6b7a8f;font-weight:600;text-transform:uppercase;
              letter-spacing:.07em;margin-bottom:8px">{tender.category}</div>
            <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2535;line-height:1.3">
              {tender.title}
            </h1>
            <div style="color:#8896ab;font-size:13px">Тендер #{tender.id} · Опубликован: {tender.published or "—"}</div>
          </td>
        </tr>

        <!-- Key details -->
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f8f9fc;border:1px solid #e4e8ef;border-radius:12px;overflow:hidden">
  {_detail_rows(tender)}
            </table>
          </td>
        </tr>

        <!-- Description -->
        <tr>
          <td style="padding:0 32px 24px">
            <div style="font-size:12px;font-weight:600;color:#2563eb;text-transform:uppercase;
              letter-spacing:.06em;margin-bottom:10px">Описание</div>
            <div style="font-size:13px;color:#374151;line-height:1.7">{tender.description}</div>
          </td>
        </tr>

        <!-- Requirements -->
{_reqs_block(tender, reqs_html)}

        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 32px">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px">
              <div style="font-size:13px;color:#1d4ed8;font-weight:500;margin-bottom:4px">
                📎 Подробная документация прикреплена к письму
              </div>
              <div style="font-size:12px;color:#6b7a8f">
                PDF-файл содержит полные условия тендера. Для участия подготовьте ворк-план и загрузите его в систему.
              </div>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fc;border-top:1px solid #e4e8ef;padding:16px 32px">
            <div style="font-size:11px;color:#9ca3af;line-height:1.6">
              Сообщение сформировано автоматически · Digital Twin Construction Management<br>
              Источник данных: goszakup.gov.kz
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_tender_email(recipient: str, tender: TenderData, pdf_bytes: bytes):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", 587))
    user = os.getenv("SMTP_USER", "")
    pwd  = os.getenv("SMTP_PASS", "")
    frm  = os.getenv("SMTP_FROM", user)

    if not user or not pwd:
        raise ValueError("SMTP_USER and SMTP_PASS must be set in .env")

    msg = MIMEMultipart("mixed")
    msg["Subject"] = f"Тендер: {tender.title} — детали и документация"
    msg["From"]    = frm
    msg["To"]      = recipient

    # HTML body
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(_html_email(tender), "html", "utf-8"))
    msg.attach(alt)

    # PDF attachment
    att = MIMEBase("application", "pdf")
    att.set_payload(pdf_bytes)
    encoders.encode_base64(att)
    safe_name = tender.title[:40].replace(" ", "_").replace("/", "-")
    att.add_header("Content-Disposition", "attachment",
                   filename=f"Tender_{tender.id}_{safe_name}.pdf")
    msg.attach(att)

    with smtplib.SMTP(host, port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(user, pwd)
        smtp.sendmail(frm, [recipient], msg.as_string())


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/tenders/send-email")
def send_tender_email(req: TenderEmailRequest):
    if not req.recipient or "@" not in req.recipient:
        raise HTTPException(status_code=400,
            detail="Укажите email директора в профиле (раздел Профиль директора)")
    try:
        pdf = _build_pdf(req.tender)
        _send_tender_email(req.recipient, req.tender, pdf)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=500,
            detail="SMTP authentication failed. Проверьте SMTP_USER / SMTP_PASS в .env")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email error: {e}")

    return {"status": "sent", "recipient": req.recipient, "tender_id": req.tender.id}