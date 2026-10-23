from __future__ import annotations

import os
import re
from datetime import date, timedelta
from glob import glob
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from ..db import calls, get_db
from ..pricing import Tariff
from ..reporting import (
    COMPLAINT_CATEGORIES,
    CONNECTION_LABEL_EXPR,
    INPUT_LABEL_EXPR,
    NO_COMPLAINT_REASONS,
    OUTCOME_EXPR,
    extract_transcript,
    to_call_summary,
)
from ..timeutil import pk_day_start, utcnow
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
    date_from: date | None = None,
    date_to: date | None = None,
    caller_input: str | None = None,
    batches: list[str] | None = None,
) -> dict[str, Any]:
    # Archived records stay in Mongo but are invisible to the dashboard. Used to clear
    # test and demo history without destroying it — unset the flag and it comes back.
    query: dict[str, Any] = {"archived": {"$ne": True}}

    # Which upload the call came from. Stamped on every record by the dialler, and
    # backfilled onto the earlier ones, so this is a plain field match rather than a
    # join through the patients collection. Several at once, because the useful question
    # is "these two pilots but not that one".
    if batches:
        query["source_file"] = {"$in": batches}

    # Status and input filter on the labels the table shows, not the raw stored
    # status, which uses a different vocabulary ("answered" there means pressed 2).
    if status:
        query["$and"] = query.get("$and", []) + [
            {"$expr": {"$eq": [CONNECTION_LABEL_EXPR, status]}}
        ]
    if caller_input:
        query["$and"] = query.get("$and", []) + [
            {"$expr": {"$eq": [INPUT_LABEL_EXPR, caller_input]}}
        ]
    if direction:
        query["direction"] = direction
    if category:
        # Matched on the same expression the column renders, so selecting a value in the
        # dropdown returns exactly the rows that show it — including the reasons a call
        # produced no complaint, which used to be unfilterable.
        query["$and"] = query.get("$and", []) + [
            {"$expr": {"$eq": [OUTCOME_EXPR, category]}}
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
        # UTC, because that is what is stored. Using the host clock here meant the
        # "last N days" window was shifted by the local offset.
        window["$gte"] = utcnow() - timedelta(days=days)
    # Both ends are Pakistan calendar days and both are inclusive, so the range is
    # bounded by midnight after the last day.
    if date_from:
        window["$gte"] = pk_day_start(date_from)
    if date_to:
        window["$lt"] = pk_day_start(date_to + timedelta(days=1))
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
    date_from: date | None = None,
    date_to: date | None = None,
    caller_input: str | None = None,
    # Repeatable: ?batches=FILE+1...&batches=FILE+2... so several uploads can be shown
    # together, which is the question actually asked of this screen.
    batches: list[str] | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    query = build_filter(
        search, status, category, er, direction, days, date_from, date_to, caller_input,
        batches,
    )
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
    inputs: dict[str, int] = {}
    async for row in collection.aggregate(
        [
            {"$match": {"archived": {"$ne": True}}},
            {"$group": {"_id": INPUT_LABEL_EXPR, "count": {"$sum": 1}}},
        ]
    ):
        if row["_id"] and row["_id"] != "—":
            inputs[row["_id"]] = row["count"]
    # Uploads that actually produced calls, newest first. Ordered by the most recent
    # call rather than by filename, so "FILE 10" cannot sort above "FILE 2".
    batch_options: list[dict[str, Any]] = []
    async for row in collection.aggregate(
        [
            {"$match": {"archived": {"$ne": True}, "source_file": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$source_file", "calls": {"$sum": 1},
                        "latest": {"$max": "$timestamp"}}},
            {"$sort": {"latest": -1}},
        ]
    ):
        batch_options.append({"file": row["_id"], "calls": row["calls"]})

    # Distinct outcomes actually present, so the dropdown never offers a dead option.
    outcomes: set[str] = set()
    async for row in collection.aggregate(
        [
            {"$match": {"archived": {"$ne": True}}},
            {"$group": {"_id": OUTCOME_EXPR}},
        ]
    ):
        if row["_id"] and row["_id"] != "—":
            outcomes.add(row["_id"])

    # Caller responses first in the order a call can end, then the dial failures.
    responses = ("Satisfied", "Dissatisfied", "Hung up", "No key pressed")
    return {
        "statuses": ["Answered", "Not answered"],
        "inputs": [x for x in responses if x in inputs]
        + sorted(x for x in inputs if x not in responses),
        # Everything the complaint column can show: the three taxonomy values first,
        # then the reasons a call produced no complaint, in the order a call can fail.
        "categories": [x for x in COMPLAINT_CATEGORIES if x in outcomes]
        + [x for x in NO_COMPLAINT_REASONS if x in outcomes]
        + sorted(
            x for x in outcomes
            if x not in COMPLAINT_CATEGORIES and x not in NO_COMPLAINT_REASONS and x != "—"
        ),
        "ers": sorted(x for x in ers if x),
        "directions": sorted(x for x in await collection.distinct("direction") if x),
        # Newest upload first, which is the order they are thought about, and with the
        # call count so an upload that produced nothing is obvious rather than puzzling.
        "batches": batch_options,
    }


# Directories a recording may be served from, comma-separated. The path itself comes
# from the call record, written by the agent — but a containment check costs nothing and
# this endpoint streams audio of families discussing a child's medical care. Unset means
# no restriction, which is the right default only because the paths are ours.
RECORDING_ROOTS = [
    Path(p).resolve()
    for p in (os.getenv("RECORDING_ROOTS", "").split(",") if os.getenv("RECORDING_ROOTS") else [])
    if p.strip()
]


def _recording_tracks(doc: dict[str, Any]) -> list[dict[str, str]]:
    """The audio for one call: the mixed recording, or the per-track backup of it.

    Normally this returns exactly one entry — the single mixed file, named after the
    room, which is how every call has been recorded and is what the record's path
    points at.

    The agent also records each track separately as a backup, because the mixed file is
    rendered by a headless browser inside the egress server that intermittently fails
    and leaves nothing behind. Those files are named

        <room>-patient-TR_AMsBpj3V59oMn4.ogg

    with a track id nobody can predict, so they are found by globbing the room prefix.
    They are deliberately ignored while the mixed file exists: one player is the point.
    Only when the mix is missing does the backup surface, as the two sides of the call.
    This mirrors recording_track_template() in the agent repo; the two change together.

    Taken from the record rather than from the request: the client names a call, never a
    path, so there is nothing here for a traversal attempt to reach.
    """
    raw = (doc.get("recording_file") or "").strip()
    if not raw or not raw.endswith(".ogg"):
        return []

    def permitted(path: Path) -> bool:
        resolved = path.resolve()
        return not RECORDING_ROOTS or any(
            resolved == root or root in resolved.parents for root in RECORDING_ROOTS
        )

    mixed = Path(raw)
    if mixed.is_file() and permitted(mixed):
        return [{"track": mixed.name, "label": "Full call"}]

    # The mix is gone, so fall back to whichever sides the backup caught. The family's
    # leads: it is the half that carries the complaint, and the half worth checking a
    # suspect Urdu transcript against.
    tracks = []
    for path in sorted(Path(p) for p in glob(f"{raw[: -len('.ogg')]}-*.ogg")):
        if not permitted(path):
            continue
        family = "-patient-" in path.name
        tracks.append({"track": path.name, "label": "Family" if family else "Assistant",
                       "_rank": "1" if family else "2"})
    tracks.sort(key=lambda t: t.pop("_rank"))
    return tracks


@router.get("/{session_id}/recording")
async def get_recording(
    session_id: str,
    track: str | None = None,
    _: dict[str, Any] = Depends(current_user),
) -> FileResponse:
    """Stream one side of a call's audio.

    FileResponse honours Range requests, so a player can seek without downloading the
    whole file first. `track` names a file this endpoint itself listed; it is matched by
    equality against that listing, never joined onto a directory.
    """
    doc = await calls().find_one(
        {"session_id": session_id, "archived": {"$ne": True}}, {"recording_file": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Call not found")

    tracks = _recording_tracks(doc)
    if not tracks:
        if (doc.get("recording_file") or "").strip():
            # The egress was asked for, and the audio is not there. Through 2026-10-23
            # that was a headless-Chrome failure inside the egress server on about one
            # call in ten; say so plainly instead of serving a body the player cannot
            # explain.
            raise HTTPException(status_code=404, detail="Recording file is no longer on disk")
        raise HTTPException(status_code=404, detail="This call has no recording")

    wanted = track or tracks[0]["track"]
    names = {t["track"] for t in tracks}
    if wanted not in names:
        raise HTTPException(status_code=404, detail="No such track for this call")

    base = Path((doc["recording_file"]).strip()).parent
    return FileResponse(
        base / wanted,
        media_type="audio/ogg",
        # Named after the room, which is also the session id, so a downloaded file can
        # still be matched back to its call.
        filename=wanted,
        content_disposition_type="inline",
    )


@router.get("/{session_id}")
async def get_call(
    session_id: str, _: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    doc = await calls().find_one({"session_id": session_id, "archived": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Call not found")

    detail = to_call_summary(doc, await load_tariff())
    detail["transcript"] = extract_transcript(doc)
    detail["metrics"] = doc.get("metrics") or {}
    detail["cost_breakdown"] = doc.get("cost") or {}
    detail["patient_context"] = doc.get("patient_context") or {}
    # Which players to offer. Resolved on disk rather than trusting the path, because a
    # stored path is not a promise the file survived — and a call now has two sides.
    detail["recordings"] = _recording_tracks(doc)
    detail["has_recording"] = bool(detail["recordings"])
    return detail
