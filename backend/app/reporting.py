from __future__ import annotations

from datetime import datetime
from typing import Any

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


def to_call_summary(doc: dict[str, Any]) -> dict[str, Any]:
    """Report row plus the operational fields the dashboard shows alongside it."""
    row = to_report_row(doc)
    summary = doc.get("feedback_summary") or {}
    cost = doc.get("cost") or {}

    timestamp = doc.get("timestamp")
    return {
        "id": doc.get("session_id") or str(doc.get("_id", "")),
        "session_id": doc.get("session_id", ""),
        "timestamp": timestamp.isoformat() if isinstance(timestamp, datetime) else None,
        "status": doc.get("status", ""),
        "direction": doc.get("direction", "outbound"),
        "satisfied": doc.get("satisfied"),
        "dtmf_selection": doc.get("dtmf_selection", ""),
        "patient_matched": doc.get("patient_matched"),
        "duration_minutes": round(float(doc.get("duration") or 0), 2),
        "cost_usd": round(float(cost.get("total_cost") or cost.get("total") or 0), 4),
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
