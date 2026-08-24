from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..db import calls, get_db
from ..pricing import Tariff
from ..reporting import extract_transcript, to_call_summary
from ..security import current_user

router = APIRouter(prefix="/api/calls", tags=["calls"])


async def load_tariff() -> Tariff:
    """Rates as configured in the dashboard. One read per request, not per row."""
    doc = await get_db()["settings"].find_one({"_id": "dialer"})
    return Tariff.from_settings(doc)


def build_filter(
    search: str | None = None,
    status: str | None = None,
    category: str | None = None,
    er: str | None = None,
    direction: str | None = None,
    days: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}

    if status:
        query["status"] = status
    if direction:
        query["direction"] = direction
    if category:
        query["$or"] = [
            {"feedback_output.Complaint Category": category},
            {"feedback_summary.complaint_category": category},
        ]
    if er:
        query["$and"] = query.get("$and", []) + [
            {
                "$or": [
                    {"feedback_output.ER name": er},
                    {"feedback_output.ER Name": er},
                    {"patient_context.er_name": er},
                ]
            }
        ]

    window: dict[str, Any] = {}
    if days:
        window["$gte"] = datetime.now() - timedelta(days=days)
    if date_from:
        window["$gte"] = date_from
    if date_to:
        window["$lte"] = date_to
    if window:
        query["timestamp"] = window

    if search:
        # Escaped so a caller typing "+92 (300)" is matched literally rather than
        # blowing up as an invalid regex.
        rx = re.compile(re.escape(search.strip()), re.IGNORECASE)
        query["$and"] = query.get("$and", []) + [
            {
                "$or": [
                    {"session_id": rx},
                    {"caller_number": rx},
                    {"feedback_output.Patient Name": rx},
                    {"feedback_output.Phone Number": rx},
                    {"feedback_output.MR Number": rx},
                    {"feedback_output.Remarks": rx},
                    {"feedback_output.Complaint Details Shared by Attendant": rx},
                    {"patient_context.patient_name": rx},
                    {"patient_context.contact_number": rx},
                    {"patient_context.mr_number": rx},
                ]
            }
        ]

    return query


@router.get("")
async def list_calls(
    search: str | None = None,
    status: str | None = None,
    category: str | None = None,
    er: str | None = None,
    direction: str | None = None,
    days: int | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    query = build_filter(search, status, category, er, direction, days)
    collection = calls()

    total = await collection.count_documents(query)
    cursor = (
        collection.find(query, {"logs": 0})  # transcripts are large; fetched on demand
        .sort("timestamp", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    tariff = await load_tariff()
    items = [to_call_summary(doc, tariff) async for doc in cursor]

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/filters")
async def filter_options(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Distinct values actually present in the data, so filters never offer a dead option."""
    collection = calls()
    ers = set(await collection.distinct("patient_context.er_name")) | set(
        await collection.distinct("feedback_output.ER name")
    )
    return {
        "statuses": sorted(x for x in await collection.distinct("status") if x),
        "categories": sorted(
            x for x in await collection.distinct("feedback_summary.complaint_category") if x
        ),
        "ers": sorted(x for x in ers if x),
        "directions": sorted(x for x in await collection.distinct("direction") if x),
    }


@router.get("/{session_id}")
async def get_call(
    session_id: str, _: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    doc = await calls().find_one({"session_id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Call not found")

    detail = to_call_summary(doc, await load_tariff())
    detail["transcript"] = extract_transcript(doc)
    detail["metrics"] = doc.get("metrics") or {}
    detail["cost_breakdown"] = doc.get("cost") or {}
    detail["patient_context"] = doc.get("patient_context") or {}
    return detail
