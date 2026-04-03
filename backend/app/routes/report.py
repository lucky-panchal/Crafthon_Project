from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

router = APIRouter()

# ── Pydantic models ───────────────────────────────────────────────────────────

class AlertItem(BaseModel):
    type:       Optional[str]   = "UNKNOWN"
    risk:       Optional[str]   = "LOW"
    confidence: Optional[float] = 0
    reason:     Optional[str]   = ""
    timestamp:  Optional[str]   = ""
    count:      Optional[int]   = 1

class SignalSnapshot(BaseModel):
    snr:        Optional[float] = 0
    packetLoss: Optional[float] = 0
    packetRate: Optional[float] = 0

class ReportRequest(BaseModel):
    rangeLabel:   str
    mode:         str
    totalAlerts:  int
    alerts:       List[AlertItem]
    signal:       SignalSnapshot

# ── Colour helpers ────────────────────────────────────────────────────────────

BG       = colors.HexColor("#080C14")
SURFACE  = colors.HexColor("#0D1220")
BORDER   = colors.HexColor("#1a2535")
ACCENT   = colors.HexColor("#06b6d4")
WHITE    = colors.white
MUTED    = colors.HexColor("#64748b")
RED      = colors.HexColor("#ef4444")
AMBER    = colors.HexColor("#f59e0b")
GREEN    = colors.HexColor("#22c55e")
BLUE     = colors.HexColor("#3b82f6")

def risk_color(risk):
    return {"HIGH": RED, "MEDIUM": AMBER, "LOW": GREEN}.get(risk, MUTED)

# ── PDF builder ───────────────────────────────────────────────────────────────

def build_pdf(req: ReportRequest) -> bytes:
    buf = BytesIO()
    W, H = A4
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=12*mm, bottomMargin=12*mm,
    )

    # ── Styles ──
    def style(name, size, bold=False, color=WHITE, align=TA_LEFT, space_after=4):
        return ParagraphStyle(
            name, fontSize=size,
            fontName="Helvetica-Bold" if bold else "Helvetica",
            textColor=color, alignment=align,
            spaceAfter=space_after, leading=size * 1.4,
        )

    S_TITLE   = style("title",   18, bold=True,  color=WHITE,  align=TA_CENTER, space_after=2)
    S_SUB     = style("sub",      8, bold=False, color=MUTED,  align=TA_CENTER, space_after=8)
    S_SECTION = style("section", 10, bold=True,  color=ACCENT, space_after=3)
    S_BODY    = style("body",     8, bold=False, color=MUTED,  space_after=2)
    S_VALUE   = style("value",   13, bold=True,  color=WHITE,  space_after=1)
    S_LABEL   = style("label",    7, bold=False, color=MUTED,  space_after=0)

    now = datetime.now().strftime("%d %b %Y  %H:%M:%S")
    story = []

    # ── Header ──
    story.append(Paragraph("RAKSHA — Threat Intelligence Report", S_TITLE))
    story.append(Paragraph(
        f"Generated: {now}  &nbsp;|&nbsp;  Range: {req.rangeLabel}  &nbsp;|&nbsp;  Mode: {req.mode}",
        S_SUB
    ))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6))

    # ── Summary stats table ──
    story.append(Paragraph("EXECUTIVE SUMMARY", S_SECTION))

    high_count = sum(1 for a in req.alerts if a.risk == "HIGH")
    med_count  = sum(1 for a in req.alerts if a.risk == "MEDIUM")
    low_count  = sum(1 for a in req.alerts if a.risk == "LOW")

    summary_data = [
        ["Total Alerts (session)", "Alerts in Range", "HIGH Risk", "MEDIUM Risk"],
        [str(req.totalAlerts), str(len(req.alerts)), str(high_count), str(med_count)],
    ]
    summary_table = Table(summary_data, colWidths=[(W - 30*mm) / 4] * 4)
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), SURFACE),
        ("BACKGROUND",  (0,1), (-1,1), colors.HexColor("#0a1628")),
        ("TEXTCOLOR",   (0,0), (-1,0), MUTED),
        ("TEXTCOLOR",   (0,1), (-1,1), WHITE),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica"),
        ("FONTNAME",    (0,1), (-1,1), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,0), 7),
        ("FONTSIZE",    (0,1), (-1,1), 14),
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [SURFACE, colors.HexColor("#0a1628")]),
        ("GRID",        (0,0), (-1,-1), 0.4, BORDER),
        ("ROUNDEDCORNERS", [3]),
        ("TOPPADDING",  (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 6*mm))

    # ── Signal snapshot ──
    story.append(Paragraph("SIGNAL SNAPSHOT", S_SECTION))
    snr   = req.signal.snr
    loss  = req.signal.packetLoss
    rate  = req.signal.packetRate
    snr_c  = RED if snr < 15 else (AMBER if snr < 20 else GREEN)
    loss_c = RED if loss > 20 else GREEN

    sig_data = [
        ["SNR", "Packet Loss", "Packet Rate"],
        [f"{snr} dB", f"{loss}%", f"{rate} pps"],
    ]
    sig_table = Table(sig_data, colWidths=[(W - 30*mm) / 3] * 3)
    sig_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), SURFACE),
        ("BACKGROUND",   (0,1), (-1,1), colors.HexColor("#0a1628")),
        ("TEXTCOLOR",    (0,0), (-1,0), MUTED),
        ("TEXTCOLOR",    (0,1), (0,1),  snr_c),
        ("TEXTCOLOR",    (1,1), (1,1),  loss_c),
        ("TEXTCOLOR",    (2,1), (2,1),  BLUE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica"),
        ("FONTNAME",     (0,1), (-1,1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,0), 7),
        ("FONTSIZE",     (0,1), (-1,1), 14),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("GRID",         (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 6*mm))

    # ── Alert log ──
    story.append(Paragraph("ALERT LOG", S_SECTION))

    if not req.alerts:
        story.append(Paragraph("No alerts recorded in this time range.", S_BODY))
    else:
        headers = ["Time", "Type", "Risk", "Confidence", "Count", "Reason"]
        col_w   = [(W - 30*mm) * f for f in [0.12, 0.13, 0.08, 0.10, 0.07, 0.50]]
        rows    = [headers]
        for a in req.alerts:
            ts = ""
            try:
                ts = datetime.fromisoformat(a.timestamp.replace("Z","")).strftime("%H:%M:%S")
            except Exception:
                ts = a.timestamp[:8] if a.timestamp else ""
            rows.append([
                ts,
                (a.type or "").replace("_", " "),
                a.risk or "--",
                f"{int(a.confidence or 0)}%",
                str(a.count or 1),
                (a.reason or "")[:80],
            ])

        alert_table = Table(rows, colWidths=col_w, repeatRows=1)
        ts = TableStyle([
            ("BACKGROUND",   (0,0), (-1,0), colors.HexColor("#0f1e38")),
            ("TEXTCOLOR",    (0,0), (-1,0), ACCENT),
            ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",     (0,0), (-1,-1), 7),
            ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
            ("TEXTCOLOR",    (0,1), (-1,-1), MUTED),
            ("ALIGN",        (0,0), (-1,-1), "LEFT"),
            ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
            ("GRID",         (0,0), (-1,-1), 0.3, BORDER),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [SURFACE, colors.HexColor("#0a1220")]),
        ])
        # Colour risk column per row
        for i, a in enumerate(req.alerts, start=1):
            ts.add("TEXTCOLOR", (2, i), (2, i), risk_color(a.risk or "LOW"))
            ts.add("FONTNAME",  (2, i), (2, i), "Helvetica-Bold")

        alert_table.setStyle(ts)
        story.append(alert_table)

    story.append(Spacer(1, 6*mm))

    # ── Footer via canvas ──
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6)
        canvas.drawString(15*mm, 8*mm,
            f"RAKSHA AI Threat Engine v1.0  |  CONFIDENTIAL  |  Page {doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    return buf.getvalue()


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/report/pdf")
def export_pdf(req: ReportRequest):
    pdf_bytes = build_pdf(req)
    filename  = f"RAKSHA_Report_{req.rangeLabel.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
