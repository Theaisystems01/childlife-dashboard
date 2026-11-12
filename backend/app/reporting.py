from __future__ import annotations

from datetime import datetime
from typing import Any

from .phones import SIGNIFICANT_DIGITS
from .pricing import Tariff, cost_breakdown
from .timeutil import iso_utc

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

# The robocall survey's four questions: stored field, and the column it reads as.
#
# Order matters — it is the order the questions are asked in, and the column order of
# the report. Mirrors QUESTIONS in robocall_prompts.py in the agent repo; the two change
# together, and a question added there needs adding here or its answers go unreported.
SURVEY_QUESTIONS: tuple[tuple[str, str], ...] = (
    ("satisfied_with_treatment", "Satisfied with treatment"),
    ("treated_on_time", "Treated on time"),
    ("satisfied_with_staff", "Satisfied with staff"),
    ("satisfied_with_cleanliness", "Satisfied with cleanliness"),
)

# A survey row carries the same identity columns as the feedback report, then one column
# per question in place of the complaint fields. There is no complaint on a survey call
# to categorise, and no remark: four keypresses are the whole of what was collected.
SURVEY_COLUMNS = [
    "Phone Number",
    "Received Time",
    "Disposition Catg",
    "Patient Category",
    "ER name",
    "MR Number",
    "Patient Name",
    *[heading for _, heading in SURVEY_QUESTIONS],
    "Questions Answered",
]

COMPLAINT_CATEGORIES = ("Treatment", "Behavior", "Waiting Time")
COMPLAINT_SUBCATEGORIES = ("Nursing", "Doctor", "Pharmacy", "Security Guard")
AREAS = ("Triage", "FTO", "Retention Area", "Counter", "Ward", "Gate", "Other")


def is_survey(doc: dict[str, Any]) -> bool:
    """Is this a robocall survey rather than an AI feedback interview?

    Stamped by robocall.py as `campaign: "robocall"`. Checked on the document rather
    than inferred from the absence of complaint fields: a feedback call where the family
    said nothing has no complaint fields either, and must not be read as a survey.
    """
    return doc.get("campaign") == "robocall"


def _first(record: dict[str, Any], *keys: str) -> str:
    """Records were written across several agent versions with drifting key names."""
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def name_the_patient(remarks: str, patient_name: str) -> str:
    """Put the child's name at the front of the remark.

    The Foundation reads and forwards the Remarks text on its own, away from the Patient
    Name column beside it, and a complaint with no name in it cannot be acted on. Asked
    for by the client on 2026-11-06.

    Done here rather than in the agent so it applies to every record already written, and
    so the name comes from the patient list rather than from whatever the model chose to
    repeat. Skipped when the name is already in the text — the agent names the child in
    76% of openings and often again in the description — and when there is no remark at
    all, because a cell holding only a name reads as a complaint about nothing.
    """
    text = (remarks or "").strip()
    name = (patient_name or "").strip()
    if not text or not name:
        return text
    if name.split()[0].casefold() in text.casefold():
        return text
    return f"{name}: {text}"


def to_survey_row(doc: dict[str, Any]) -> dict[str, Any]:
    """Flatten one robocall survey into a report row: who, and their four answers.

    An unanswered question is BLANK, never "no". The survey records a keypress; a
    question nobody answered has no answer, and showing it as "no" would turn a call
    that reached a voicemail into four complaints about a hospital.
    """
    output = doc.get("feedback_output") or {}
    patient = doc.get("patient_context") or {}
    survey = doc.get("survey") or {}

    timestamp = doc.get("timestamp")
    received = _first(output, "Received Time")
    if not received and isinstance(timestamp, datetime):
        received = iso_utc(timestamp)

    row: dict[str, Any] = {
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
    }
    for field, heading in SURVEY_QUESTIONS:
        answer = str(survey.get(field) or "")
        # "Yes"/"No" rather than the stored lower case or the raw digit: this is a
        # column someone reads, and a column of 1s and 2s needs the script beside it.
        row[heading] = answer.capitalize()
    row["Questions Answered"] = f"{len(survey)} of {len(SURVEY_QUESTIONS)}"
    return row


def to_report_row(doc: dict[str, Any]) -> dict[str, Any]:
    """Flatten one conversation-log document into a single report row.

    Reads from feedback_output first (written at call end), then falls back to
    feedback_summary and patient_context so older records still populate.
    """
    if is_survey(doc):
        # A survey has no remark and no complaint category. Running it through the rest
        # of this function would fill those columns from empty fields and present the
        # result as a feedback record.
        return to_survey_row(doc)

    output = doc.get("feedback_output") or {}
    summary = doc.get("feedback_summary") or {}
    patient = doc.get("patient_context") or {}

    timestamp = doc.get("timestamp")
    received = _first(output, "Received Time")
    if not received and isinstance(timestamp, datetime):
        received = iso_utc(timestamp)

    patient_name = _first(output, "Patient Name") or _first(patient, "patient_name")

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
        "Patient Name": patient_name,
        "Remarks": name_the_patient(
            _first(output, "Remarks", "Complaint Details Shared by Attendant")
            or _first(summary, "description_of_complaint"),
            patient_name,
        ),
        # The complaint's category, or why there is no complaint. Blank on two thirds of
        # rows otherwise, with the reason stranded in a column about keypresses.
        "Complaint Category": outcome_label(doc),
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


# Invalid-feedback reasons that describe a CALLER on a connected call, as opposed to a
# dial that never landed. Shared by input_label() and INPUT_LABEL_EXPR: the two are
# separate implementations of one rule, and letting them drift is how the table came to
# show "Dissatisfied" for a call the filter found under "Mistakenly Pressed".
# Why a call produced no complaint. Caller-side reasons first, then the three that
# describe a dial that never landed.
NO_COMPLAINT_REASONS = (
    "Mistakenly Pressed",
    "Unwilling to Talk",
    "Wrong Numbers",
    "Ward Complaints",
    "Powered Off",
    "Busy",
    "Unanswered",
)


def input_label(doc: dict[str, Any]) -> str:
    """Column two: which key they pressed. Nothing else.

    Everything that is not a keypress — why they would not talk, why the dial failed,
    whether they rang off — now reads in the complaint column, so this one answers a
    single question. It used to carry all of that, which is how a family that pressed 2
    and then said it was a mistake came to display as "Dissatisfied".
    """
    if not was_connected(doc):
        # They never got the chance to press anything.
        return "—"
    selection = str(doc.get("dtmf_selection") or "")
    if selection == "1" or doc.get("satisfied") is True:
        return "Satisfied"
    if selection == "2" or doc.get("satisfied") is False:
        return "Dissatisfied"
    return "No key pressed"


def outcome_label(doc: dict[str, Any]) -> str:
    """What came of the call: the complaint's category, or why there is no complaint.

    One column rather than a complaint category that is blank on two thirds of the rows
    and a separate reason hidden elsewhere. Order matters: a call that produced a
    classified complaint reports that, whatever else happened on the line.
    """
    summary = doc.get("feedback_summary") or {}
    category = (doc.get("feedback_output") or {}).get("Complaint Category") or summary.get(
        "complaint_category"
    )
    if category:
        return str(category)

    reason = summary.get("invalid_feedback_category") or ""
    if reason:
        return str(reason)

    # Ringing off is only the outcome when they pressed nothing. Every one of the 24
    # rows this would otherwise have caught had pressed 1 — a satisfied caller who heard
    # the thank-you and the line closed, which "Hung up" misrepresents.
    pressed = str(doc.get("dtmf_selection") or "")
    if not pressed and (doc.get("caller_hung_up") or doc.get("status") == "abandoned"):
        return "Hung up"
    return "—"


# The same two labels as Mongo expressions, so the table's filters select exactly the
# rows that display a given label. These must change together with the functions
# above: a filter that disagrees with the column it filters is worse than no filter.
CONNECTED_EXPR: dict[str, Any] = {
    "$cond": [
        {"$in": [{"$type": "$connected"}, ["missing", "null"]]},
        {"$ne": ["$status", "not_connected"]},
        {"$toBool": "$connected"},
    ]
}

CONNECTION_LABEL_EXPR: dict[str, Any] = {
    "$cond": [CONNECTED_EXPR, "Answered", "Not answered"]
}

INPUT_LABEL_EXPR: dict[str, Any] = {
    "$switch": {
        "branches": [
            # Not connected: nothing was pressed, and the reason reads in OUTCOME_EXPR.
            {"case": {"$not": [CONNECTED_EXPR]}, "then": "—"},
            {
                "case": {"$or": [
                    {"$eq": [{"$toString": "$dtmf_selection"}, "1"]},
                    {"$eq": ["$satisfied", True]},
                ]},
                "then": "Satisfied",
            },
            {
                "case": {"$or": [
                    {"$eq": [{"$toString": "$dtmf_selection"}, "2"]},
                    {"$eq": ["$satisfied", False]},
                ]},
                "then": "Dissatisfied",
            },
        ],
        "default": "No key pressed",
    }
}

# The complaint's category, or why there is no complaint. Mirrors outcome_label(); the
# two must change together, because this one decides which rows the filter selects and
# that one decides what the column says. Letting them drift is how the table came to
# show "Dissatisfied" for a call the filter found under "Mistakenly Pressed".
OUTCOME_EXPR: dict[str, Any] = {
    "$let": {
        "vars": {
            "cat": {"$ifNull": [
                {"$ifNull": ["$feedback_output.Complaint Category", None]},
                {"$ifNull": ["$feedback_summary.complaint_category", ""]},
            ]},
            "reason": {"$ifNull": ["$feedback_summary.invalid_feedback_category", ""]},
        },
        "in": {
            "$switch": {
                "branches": [
                    {"case": {"$ne": ["$$cat", ""]}, "then": "$$cat"},
                    {"case": {"$ne": ["$$reason", ""]}, "then": "$$reason"},
                    {
                        "case": {"$and": [
                            {"$in": [{"$toString": {"$ifNull": ["$dtmf_selection", ""]}},
                                     ["", "null"]]},
                            {"$or": [
                                {"$toBool": {"$ifNull": ["$caller_hung_up", False]}},
                                {"$eq": ["$status", "abandoned"]},
                            ]},
                        ]},
                        "then": "Hung up",
                    },
                ],
                "default": "—",
            }
        },
    }
}

# Which subscriber a call was placed to, as a Mongo expression, so the table can show
# one row per number instead of one per dial. Mirrors phones.normalize(): the same
# number may be written 03001234567, +923001234567 or 00923001234567, so only the
# significant trailing digits identify it. The digits are gathered with $regexFindAll
# rather than assumed, because the three fields below were written by several agent
# versions and none of them promises a format.
#
# A record with no number at all falls back to its own session id. Collapsing those
# together would merge unrelated calls into one row, which is worse than listing them.
PHONE_KEY_EXPR: dict[str, Any] = {
    "$let": {
        "vars": {
            "digits": {
                "$reduce": {
                    "input": {
                        "$regexFindAll": {
                            "input": {
                                "$toString": {
                                    "$ifNull": [
                                        "$feedback_output.Phone Number",
                                        "$patient_context.contact_number",
                                        "$caller_number",
                                        "",
                                    ]
                                }
                            },
                            "regex": r"\d",
                        }
                    },
                    "initialValue": "",
                    "in": {"$concat": ["$$value", "$$this.match"]},
                }
            },
        },
        "in": {
            "$cond": [
                {"$gte": [{"$strLenCP": "$$digits"}, SIGNIFICANT_DIGITS]},
                {"$substrCP": [
                    "$$digits",
                    {"$subtract": [{"$strLenCP": "$$digits"}, SIGNIFICANT_DIGITS]},
                    SIGNIFICANT_DIGITS,
                ]},
                # Shorter than a full number, so it cannot be matched against one:
                # keyed by the record itself rather than by a fragment that might
                # coincide with another record's.
                {"$concat": ["session:", {"$toString": {"$ifNull": ["$session_id", "$_id"]}}]},
            ]
        },
    }
}


def to_call_summary(doc: dict[str, Any], tariff: Tariff | None = None) -> dict[str, Any]:
    """Report row plus the operational fields the dashboard shows alongside it."""
    row = to_report_row(doc)
    summary = doc.get("feedback_summary") or {}

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
        "timestamp": iso_utc(timestamp),
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
        "caller_hung_up": bool(doc.get("caller_hung_up")),
        # Only the rupee figure crosses the wire. Raw USD provider spend stays in
        # Mongo for internal margin reporting (scripts/margin_report.py in the agent
        # repo) — it is deliberately not sent to the dashboard, which is the client's.
        "cost_pkr": pkr["total"],
        "cost_pkr_breakdown": pkr,
        "is_valid_feedback": bool(summary.get("is_valid_feedback")),
        "invalid_feedback_category": summary.get("invalid_feedback_category", ""),
        "support_required": bool(summary.get("support_required")),
        # Which campaign placed this call, so the table knows which columns to render
        # and a reader is never left guessing why the complaint fields are empty.
        "campaign": "robocall" if is_survey(doc) else "ai",
        # The raw answers as well as the report row: the row is formatted for reading,
        # these are for counting.
        "survey": doc.get("survey") or {},
        "answered_count": int(doc.get("answered_count") or 0),
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
