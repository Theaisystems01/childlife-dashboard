from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..db import calls, get_db
from ..pricing import Tariff
from ..reporting import AREAS, COMPLAINT_CATEGORIES, COMPLAINT_SUBCATEGORIES
from ..security import current_user
from .calls import build_filter

router = APIRouter(prefix="/api/stats", tags=["stats"])


async def _facet_counts(match: dict[str, Any], field: str) -> dict[str, int]:
    pipeline = [
        {"$match": match},
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
    ]
    out: dict[str, int] = {}
    async for row in calls().aggregate(pipeline):
        key = row["_id"]
        if key in (None, ""):
            continue
        out[str(key)] = row["count"]
    return out


def _ordered(counts: dict[str, int], order: tuple[str, ...]) -> list[dict[str, Any]]:
    """Fixed order so a category keeps its color slot even when its count is zero."""
    rows = [{"label": label, "value": counts.get(label, 0)} for label in order]
    extras = sorted(
        ((k, v) for k, v in counts.items() if k not in order),
        key=lambda kv: -kv[1],
    )
    rows.extend({"label": k, "value": v} for k, v in extras)
    return rows


@router.get("/overview")
async def overview(
    days: int | None = None,
    er: str | None = None,
    direction: str | None = None,
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    match = build_filter(er=er, direction=direction, days=days)
    collection = calls()

    total = await collection.count_documents(match)
    status_counts = await _facet_counts(match, "status")

    # Totals for duration and cost in one pass.
    #
    # The rupee total is summed from the billable quantities rather than from each
    # call's stored figure, because the tariff can change and old records would then
    # be priced at whatever rate happened to apply when they were written.
    #
    # A call counts as connected unless it explicitly says otherwise — inbound records
    # predate the `connected` field and are connected by definition.
    is_connected = {"$ne": [{"$ifNull": ["$connected", True]}, False]}
    billable_duration = {"$cond": [is_connected, {"$ifNull": ["$duration", 0]}, 0]}
    billable_ai = {"$cond": [is_connected, {"$ifNull": ["$ai_duration", 0]}, 0]}

    totals = {
        "duration": 0.0, "cost": 0.0, "billable": 0.0,
        "billable_60": 0.0, "billable_30": 0.0, "ai": 0.0,
    }
    async for row in collection.aggregate(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": None,
                    "duration": {"$sum": {"$ifNull": ["$duration", 0]}},
                    "cost": {"$sum": {"$ifNull": ["$cost.total_cost", 0]}},
                    "billable": {"$sum": billable_duration},
                    # Pulse rounding cannot be derived from the plain sum after the
                    # fact, so both roundings are computed per call here.
                    "billable_60": {"$sum": {"$ceil": billable_duration}},
                    "billable_30": {"$sum": {
                        "$multiply": [{"$ceil": {"$multiply": [billable_duration, 2]}}, 0.5]
                    }},
                    "ai": {"$sum": billable_ai},
                }
            },
        ]
    ):
        totals["duration"] = float(row.get("duration") or 0)
        totals["cost"] = float(row.get("cost") or 0)
        totals["billable"] = float(row.get("billable") or 0)
        totals["billable_60"] = float(row.get("billable_60") or 0)
        totals["billable_30"] = float(row.get("billable_30") or 0)
        totals["ai"] = float(row.get("ai") or 0)

    tariff = Tariff.from_settings(await get_db()["settings"].find_one({"_id": "dialer"}))
    if tariff.carrier_pulse_seconds >= 60:
        carrier_minutes = totals["billable_60"]
    elif tariff.carrier_pulse_seconds > 0:
        carrier_minutes = totals["billable_30"]
    else:
        carrier_minutes = totals["billable"]
    ai_minutes = min(totals["ai"], totals["billable"])
    menu_minutes = max(0.0, totals["billable"] - ai_minutes)
    total_pkr = (
        tariff.carrier_pkr_per_min * carrier_minutes
        + tariff.ivr_pkr_per_min * menu_minutes
        + tariff.ai_pkr_per_min * ai_minutes
    )

    valid_complaints = await collection.count_documents(
        {**match, "feedback_summary.is_valid_feedback": True}
    )
    support_required = await collection.count_documents(
        {**match, "feedback_summary.support_required": True}
    )
    satisfied = status_counts.get("satisfied", 0)

    # Calls per day for the trend line.
    trend: list[dict[str, Any]] = []
    async for row in collection.aggregate(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                    },
                    "calls": {"$sum": 1},
                    "complaints": {
                        "$sum": {
                            "$cond": [
                                {"$eq": ["$feedback_summary.is_valid_feedback", True]},
                                1,
                                0,
                            ]
                        }
                    },
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ):
        if row["_id"]:
            trend.append(
                {"date": row["_id"], "calls": row["calls"], "complaints": row["complaints"]}
            )

    er_counts = await _facet_counts(match, "patient_context.er_name")

    return {
        "kpis": {
            "total_calls": total,
            "valid_complaints": valid_complaints,
            "satisfied": satisfied,
            "support_required": support_required,
            "total_minutes": round(totals["duration"], 1),
            "avg_minutes": round(totals["duration"] / total, 2) if total else 0.0,
            "total_cost_pkr": round(total_pkr, 2),
            "ai_minutes": round(ai_minutes, 2),
            "menu_minutes": round(menu_minutes, 2),
        },
        "status": _ordered(status_counts, ("answered", "satisfied", "silent", "unanswered")),
        "categories": _ordered(
            await _facet_counts(match, "feedback_summary.complaint_category"),
            COMPLAINT_CATEGORIES,
        ),
        "subcategories": _ordered(
            await _facet_counts(match, "feedback_summary.complaint_subcategory"),
            COMPLAINT_SUBCATEGORIES,
        ),
        "areas": _ordered(
            await _facet_counts(match, "feedback_summary.complaint_area"), AREAS
        ),
        "ers": sorted(
            ({"label": k, "value": v} for k, v in er_counts.items()),
            key=lambda r: -r["value"],
        ),
        "trend": trend,
    }
