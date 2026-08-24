"""Operational settings the foundation can change without a redeploy.

Stored as a single document in `settings`, read by the dialer before every pass. The
env vars in dialer.py remain the fallback for anything not set here, so an empty
collection behaves exactly as before this existed.

Deliberately a small, closed set of fields. These are dialling-behaviour knobs, not a
general key-value store — anything that changes what the agent *says* belongs in the
prompt, under review, not in a form.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import get_db
from ..security import current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_ID = "dialer"


class DialerSettings(BaseModel):
    """Bounds are enforced here rather than in the UI so a hand-crafted request cannot
    set something that would hurt patients or the carrier."""

    max_attempts: int = Field(
        3, ge=1, le=5, description="Total tries per patient, including the first call"
    )
    retry_delay_minutes: list[int] = Field(
        default_factory=lambda: [30, 120],
        description="Wait before each retry. First entry is the gap before attempt 2.",
    )
    max_concurrent_calls: int = Field(
        3,
        ge=1,
        le=30,
        description="Simultaneous calls. Must not exceed the carrier's channel count.",
    )
    dial_timeout_seconds: int = Field(
        45, ge=15, le=120, description="How long to let the phone ring before giving up"
    )
    calling_window_start_hour: int = Field(
        9, ge=0, le=23, description="Earliest hour (PKT) a call may be placed"
    )
    calling_window_end_hour: int = Field(
        20, ge=1, le=24, description="Latest hour (PKT) a call may be placed"
    )
    paused: bool = Field(
        False, description="Stop placing new calls without losing the queue"
    )

    # --- costing -------------------------------------------------------------
    # What the foundation is billed, in rupees. Separate from the raw USD provider
    # spend the agent records, which stays untouched.
    rate_carrier_pkr_per_min: float = Field(
        2.15, ge=0, le=100, description="Carrier rate, applied to the whole call"
    )
    rate_ivr_pkr_per_min: float = Field(
        0.80, ge=0, le=100, description="Menu-only minutes"
    )
    rate_ai_pkr_per_min: float = Field(
        7.00, ge=0, le=500, description="Minutes spent with the AI"
    )
    carrier_bills_whole_minutes: bool = Field(
        False,
        description="Round carrier minutes up. UNCONFIRMED with Telecard — most "
        "Pakistani carriers do, which roughly doubles the cost of a short call.",
    )
    charge_unanswered: bool = Field(
        False,
        description="Charge for calls that never connected. UNCONFIRMED with Telecard.",
    )

    def validated(self) -> "DialerSettings":
        if self.calling_window_end_hour <= self.calling_window_start_hour:
            raise HTTPException(
                status_code=400,
                detail="Calling window must end after it starts",
            )
        # One gap per retry. Fewer would leave a retry with no delay defined; more is
        # harmless but confusing, so it is trimmed rather than rejected.
        needed = max(0, self.max_attempts - 1)
        delays = [d for d in self.retry_delay_minutes if d > 0][:needed]
        while len(delays) < needed:
            delays.append(delays[-1] if delays else 30)
        self.retry_delay_minutes = delays
        return self


def collection():
    return get_db()["settings"]


@router.get("")
async def read_settings(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    doc = await collection().find_one({"_id": SETTINGS_ID})
    if not doc:
        return DialerSettings().model_dump()
    doc.pop("_id", None)
    doc.pop("updated_at", None)
    doc.pop("updated_by", None)
    # Anything missing falls back to the model default rather than erroring, so adding
    # a new field does not break an existing saved document.
    return DialerSettings(**{k: v for k, v in doc.items() if k in DialerSettings.model_fields}).model_dump()


@router.put("")
async def write_settings(
    payload: DialerSettings,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    settings = payload.validated()
    await collection().update_one(
        {"_id": SETTINGS_ID},
        {
            "$set": {
                **settings.model_dump(),
                "updated_at": datetime.now(),
                "updated_by": user.get("username", ""),
            }
        },
        upsert=True,
    )
    return settings.model_dump()
