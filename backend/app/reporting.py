from __future__ import annotations

from datetime import datetime
from typing import Any

from .pricing import Tariff, cost_breakdown

# The ChildLife feedback report, in the exact column order the foundation uses.
REPORT_COLUMNS = [
    "Phone Number",
    "Received Time",
    "Disposition Catg",
    "Patient Category",
    "ER name",
    "MR Number",
    "Patient Name",
    "Remarks",
    "Complaint Category",
    "Complaint Sub Category",
    "Area",
]

COMPLAINT_CATEGORIES = ("Treatment", "Behavior", "Waiting Time")
COMPLAINT_SUBCATEGORIES = ("Nursing", "Doctor", "Pharmacy", "Security Guard")
AREAS = ("Triage", "FTO", "Retention Area", "Counter", "Ward", "Gate", "Other")


def _first(record: dict[str, Any], *keys: str) -> str:
    """Records were written across several agent versions with drifting key names."""
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def to_report_row(doc: dict[str, Any]) -> dict[str, Any]:
    """Flatten one conversation-log document into a single report row.

    Reads from feedback_output first (written at call end), then falls back to
    feedback_summary and patient_context so older records still populate.
    """
    output = doc.get("feedback_output") or {}
    summary = doc.get("feedback_summary") or {}
    patient = doc.get("patient_context") or {}

    timestamp = doc.get("timestamp")
    received = _first(output, "Received Time")
    if not received and isinstance(timestamp, datetime):
        received = timestamp.isoformat()

    return {
        "Phone Number": _first(output, "Phone Number", "Contact Number")
        or _first(patient, "contact_number", "caller", "caller_number")
        or doc.get("caller_number", ""),
        "Received Time": received,
        "Disposition Catg": _first(output, "Disposition Catg", "Disposition Category")
        or _first(patient, "disposition_category"),
        "Patient Category": _first(output, "Patient Category")
        or _first(patient, "patient_category"),
        "ER name": _first(output, "ER name", "ER Name") or _first(patient, "er_name"),
        "MR Number": _first(output, "MR Number") or _first(patient, "mr_number"),
        "Patient Name": _first(output, "Patient Name") or _first(patient, "patient_name"),
        "Remarks": _first(output, "Remarks", "Complaint Details Shared by Attendant")
        or _first(summary, "description_of_complaint"),
        "Complaint Category": _first(output, "Complaint Category")
        or _first(summary, "complaint_category"),
        "Complaint Sub Category": _first(output, "Complaint Sub Category")
        or _first(summary, "complaint_subcategory"),
        "Area": _first(output, "Area") or _first(summary, "complaint_area"),
    }


def was_connected(doc: dict[str, Any]) -> bool:
    """Did the far end actually pick up?

    Outbound records carry `connected` explicitly. Inbound records predate the field —
    and an inbound call is connected by definition, since the caller dialled us.
    """
    connected = doc.get("connected")
    if connected is not None:
        return bool(connected)
    return doc.get("status") != "not_connected"


def connection_label(doc: dict[str, Any]) -> str:
    """Column one: did we reach them. Nothing about what they said."""
    return "Answered" if was_connected(doc) else "Not answered"


def input_label(doc: dict[str, Any]) -> str:
    """Column two: what the caller pressed.

    Kept separate from the connection state on purpose — they answer different
    questions, and collapsing them into one column made "silent" and "not answered"
    look like the same outcome when they are operationally very different: one is a
    number that needs redialling, the other is a person who chose not to engage.
    """
    if not was_connected(doc):
        # The dial never landed; the reason lives in the invalid-feedback category
        # (Busy / Unanswered / Powered Off / Wrong Numbers).
        summary = doc.get("feedback_summary") or {}
        return summary.get("invalid_feedback_category") or "—"

    selection = str(doc.get("dtmf_selection") or "")
    if selection == "1" or doc.get("satisfied") is True:
        return "Satisfied"
    if selection == "2" or doc.get("satisfied") is False:
        return "Dissatisfied"
    return "Silent"


def to_call_summary(doc: dict[str, Any], tariff: Tariff | None = None) -> dict[str, Any]:
    """Report row plus the operational fields the dashboard shows alongside it."""
    row = to_report_row(doc)
    summary = doc.get("feedback_summary") or {}
    cost = doc.get("cost") or {}

    duration_minutes = round(float(doc.get("duration") or 0), 2)
    ai_minutes = round(float(doc.get("ai_duration") or 0), 2)
    pkr = cost_breakdown(
        duration_minutes=duration_minutes,
        ai_minutes=ai_minutes,
        connected=was_connected(doc),
        tariff=tariff,
    )

    timestamp = doc.get("timestamp")
    return {
        "id": doc.get("session_id") or str(doc.get("_id", "")),
        "session_id": doc.get("session_id", ""),
        "timestamp": timestamp.isoformat() if isinstance(timestamp, datetime) else None,
        "status": doc.get("status", ""),
        "connection": connection_label(doc),
        "caller_input": input_label(doc),
        "direction": doc.get("direction", "outbound"),
        "satisfied": doc.get("satisfied"),
        "dtmf_selection": doc.get("dtmf_selection", ""),
        "patient_matched": doc.get("patient_matched"),
        "duration_minutes": duration_minutes,
        # Time spent with the model, which is what actually costs money — the
        # prerecorded menu is free, so a satisfied caller is 0 AI minutes.
        "ai_minutes": ai_minutes,
        "ai_engaged": bool(doc.get("ai_engaged")),
        "attempt": int(doc.get("attempt") or 1),
        # Raw provider spend, exactly as the agent recorded it.
        "cost_usd": round(float(cost.get("total_cost") or cost.get("total") or 0), 4),
        # What the foundation is billed, which is a different number.
        "cost_pkr": pkr["total"],
        "cost_pkr_breakdown": pkr,
        "is_valid_feedback": bool(summary.get("is_valid_feedback")),
        "invalid_feedback_category": summary.get("invalid_feedback_category", ""),
        "support_required": bool(summary.get("support_required")),
        "report": row,
    }


def extract_transcript(doc: dict[str, Any]) -> list[dict[str, str]]:
    """Pull a readable turn list out of the stored session history."""
    logs = doc.get("logs") or {}
    items = logs.get("items") if isinstance(logs, dict) else None
    if not isinstance(items, list):
        return []

    turns: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        role = item.get("role", "")
        if role not in ("user", "assistant"):
            continue
        content = item.get("content")
        parts = content if isinstance(content, list) else [content]
        text = " ".join(str(p).strip() for p in parts if isinstance(p, (str, int, float)))
        text = text.strip()
        if text:
            turns.append({"role": role, "text": text})
    return turns
