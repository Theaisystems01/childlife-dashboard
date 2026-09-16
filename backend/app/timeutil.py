"""Serialising datetimes so the browser cannot misread them.

pymongo returns datetimes NAIVE, even for values written as timezone aware. Calling
.isoformat() on one of those produces "2026-09-16T04:44:28" with no offset, and a
browser parses that as LOCAL time rather than UTC. On a machine in Pakistan that makes
every timestamp read five hours earlier than it happened, so a call placed a moment ago
shows as "5 hours ago".

Everything stored is UTC, so the fix is to say so explicitly.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def iso_utc(value: Any) -> str | None:
    """ISO-8601 with an explicit UTC offset, or None if this is not a datetime."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        # Naive values out of Mongo are UTC; that is what was written.
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def as_utc(value: Any) -> datetime | None:
    """Coerce a datetime, or an ISO string, to timezone-aware UTC.

    Values reach this code in three shapes: aware datetimes written by the agent,
    naive ones handed back by pymongo, and ISO strings already serialised by
    iso_utc(). Comparing across those shapes raises "can't compare offset-naive and
    offset-aware datetimes", so everything is normalised before it is used.
    """
    if isinstance(value, str) and value:
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    """Timezone-aware now, for comparing against stored timestamps."""
    return datetime.now(timezone.utc)
