from __future__ import annotations

import io
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from ..db import calls
from ..reporting import (
    REPORT_COLUMNS,
    SURVEY_COLUMNS,
    connection_label,
    input_label,
    to_report_row,
)
from ..security import current_user
from .calls import build_filter, latest_per_number

router = APIRouter(prefix="/api/export", tags=["export"])

# Everything the foundation reads is Pakistan time. Mongo stores UTC, and the agent
# writes tz-aware UTC, so the conversion happens here rather than being left to whatever
# timezone the reader's machine happens to be in.
PKT = timezone(timedelta(hours=5))

# Legible in the cell, and still a real date underneath so Excel can sort and filter it.
DATE_FORMAT = "dd mmm yyyy  hh:mm AM/PM"


def _to_pkt_excel(value: Any) -> Any:
    """Turn a stored timestamp into a naive PKT datetime openpyxl will accept.

    openpyxl refuses timezone-aware datetimes, so the offset is applied and then
    dropped. Anything unparseable is passed through untouched rather than blanked —
    a slightly odd cell beats a silently empty one.
    """
    if isinstance(value, str) and value:
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return value
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        # Written before the agent used tz-aware timestamps; those were UTC.
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(PKT).replace(tzinfo=None)

# Status and input lead, as they do in the dashboard table, followed by the
# foundation's report columns in their exact order.
# Attempt sits with Status and Input because it qualifies them: the sheet carries one
# row per dial, so the same patient appears twice when a first call went unanswered, and
# without this there is no way to tell the retry from the original.
EXPORT_COLUMNS = ["Status", "Input", "Attempt", *REPORT_COLUMNS]

# The survey sheet has no Input column: "which key they pressed" is not one answer on a
# survey call, it is four, and they are the columns of the sheet. Status and Attempt
# still qualify the row the same way.
SURVEY_EXPORT_COLUMNS = ["Status", "Attempt", *SURVEY_COLUMNS]

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
    date_from: date | None = None,
    date_to: date | None = None,
    caller_input: str | None = None,
    # Repeatable: ?batches=FILE+1...&batches=FILE+2... so several uploads can be shown
    # together, which is the question actually asked of this screen.
    batches: list[str] | None = Query(None),
    # One row per number instead of one per dial, as on the screen this exports.
    latest_only: bool = False,
    complaints_only: bool = False,
    # Which campaign to export, matching the switch on the screen.
    campaign: str | None = None,
    _: dict[str, Any] = Depends(current_user),
) -> StreamingResponse:
    """Export the current view in the foundation's exact report column order."""
    query = build_filter(
        search, status, category, er, direction, days, date_from, date_to, caller_input,
        batches, campaign,
    )
    survey = campaign == "robocall"
    columns = SURVEY_EXPORT_COLUMNS if survey else EXPORT_COLUMNS
    if complaints_only:
        # Meaningless on a survey — there is no complaint flag to filter on — and
        # applying it would return an empty sheet rather than saying why.
        if not survey:
            query["feedback_summary.is_valid_feedback"] = True

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Survey Answers" if survey else "Feedback Report"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1C5CAB")
    sheet.append(columns)
    for cell in sheet[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    time_column = columns.index("Received Time") + 1

    widths = [len(column) for column in columns]
    row_number = 1
    # Both cursors yield the same shape of document, newest first; the only difference
    # is whether a number's earlier attempts are in it. The sheet has to agree with the
    # table it was exported from, so this follows the same switch.
    rows = (
        calls().aggregate(latest_per_number(query), allowDiskUse=True)
        if latest_only
        else calls().find(query, {"logs": 0}).sort("timestamp", -1)
    )
    async for doc in rows:
        row = {
            "Status": connection_label(doc),
            "Input": input_label(doc),
            "Attempt": int(doc.get("attempt") or 1),
            # to_report_row returns survey columns for a survey call and feedback
            # columns otherwise, so this one line covers both sheets.
            **to_report_row(doc),
        }
        values = [row.get(column, "") for column in columns]
        values[time_column - 1] = _to_pkt_excel(values[time_column - 1])
        sheet.append(values)
        row_number += 1

        cell = sheet.cell(row=row_number, column=time_column)
        if isinstance(cell.value, datetime):
            cell.number_format = DATE_FORMAT

        for index, value in enumerate(values):
            shown = value.strftime("%d %b %Y  %I:%M %p") if isinstance(value, datetime) else str(value)
            widths[index] = max(widths[index], min(len(shown), 60))

    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width + 3

    sheet.freeze_panes = "A2"

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    kind = "survey" if survey else "feedback"
    filename = f"childlife-{kind}-{datetime.now(PKT):%Y%m%d-%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
