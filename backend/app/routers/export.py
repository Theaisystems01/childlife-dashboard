from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from ..db import calls
from ..reporting import REPORT_COLUMNS, to_report_row
from ..security import current_user
from .calls import build_filter

router = APIRouter(prefix="/api/export", tags=["export"])

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


@router.get("/xlsx")
async def export_xlsx(
    search: str | None = None,
    status: str | None = None,
    category: str | None = None,
    er: str | None = None,
    direction: str | None = None,
    days: int | None = None,
    complaints_only: bool = False,
    _: dict[str, Any] = Depends(current_user),
) -> StreamingResponse:
    """Export the current view in the foundation's exact report column order."""
    query = build_filter(search, status, category, er, direction, days)
    if complaints_only:
        query["feedback_summary.is_valid_feedback"] = True

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Feedback Report"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1C5CAB")
    sheet.append(REPORT_COLUMNS)
    for cell in sheet[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    widths = [len(column) for column in REPORT_COLUMNS]
    async for doc in calls().find(query, {"logs": 0}).sort("timestamp", -1):
        row = to_report_row(doc)
        values = [row.get(column, "") for column in REPORT_COLUMNS]
        sheet.append(values)
        for index, value in enumerate(values):
            widths[index] = max(widths[index], min(len(str(value)), 60))

    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width + 3

    sheet.freeze_panes = "A2"

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    filename = f"childlife-feedback-{datetime.now():%Y%m%d-%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
