"""What a call costs the foundation, in rupees.

Kept separate from the raw USD figures the agent writes. Those stay untouched in Mongo
as the actual provider spend; this is the tariff the foundation is billed on, and the two
are not the same number. The dashboard shows rupees because that is the currency the
costing conversation happens in.

The model, per the rates confirmed 2026-08-24:

    carrier   2.15 PKR/min  on the whole call
    IVR       0.80 PKR/min  on the minutes that were menu only
    AI        7.00 PKR/min  on the minutes spent with the model

IVR and AI are exclusive: a minute is one or the other, never both. So a call that never
reaches the AI is charged carrier + IVR for its whole length, and a call that does is
charged AI for the conversation and IVR only for the menu that preceded it.

Two things are still unconfirmed with Telecard and are therefore settings rather than
constants — see CARRIER_BILLING_INCREMENT and charge_unanswered below.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

# Fallbacks. The dashboard settings override these; they exist so a missing settings
# document produces sensible numbers rather than zeros.
DEFAULT_CARRIER_PKR_PER_MIN = 2.15
DEFAULT_IVR_PKR_PER_MIN = 0.80
DEFAULT_AI_PKR_PER_MIN = 7.00


@dataclass(slots=True)
class Tariff:
    carrier_pkr_per_min: float = DEFAULT_CARRIER_PKR_PER_MIN
    ivr_pkr_per_min: float = DEFAULT_IVR_PKR_PER_MIN
    ai_pkr_per_min: float = DEFAULT_AI_PKR_PER_MIN

    # UNCONFIRMED with Telecard. Most Pakistani carriers bill in whole minutes rounded
    # up, which would make a 26-second satisfied call cost a full minute — materially
    # worse than the per-second figure, and worth knowing before quoting anyone.
    # Applied to the carrier leg only: the IVR and AI rates are ours, not the carrier's,
    # so there is no reason to round them.
    carrier_bills_whole_minutes: bool = False

    # UNCONFIRMED with Telecard. Carriers normally do not charge for a call that was
    # never answered, which is what makes three retry attempts affordable. If they do,
    # every unreachable number costs ring time three times over.
    charge_unanswered: bool = False

    @classmethod
    def from_settings(cls, doc: dict[str, Any] | None) -> "Tariff":
        if not doc:
            return cls()
        return cls(
            carrier_pkr_per_min=float(
                doc.get("rate_carrier_pkr_per_min", DEFAULT_CARRIER_PKR_PER_MIN)
            ),
            ivr_pkr_per_min=float(doc.get("rate_ivr_pkr_per_min", DEFAULT_IVR_PKR_PER_MIN)),
            ai_pkr_per_min=float(doc.get("rate_ai_pkr_per_min", DEFAULT_AI_PKR_PER_MIN)),
            carrier_bills_whole_minutes=bool(doc.get("carrier_bills_whole_minutes", False)),
            charge_unanswered=bool(doc.get("charge_unanswered", False)),
        )


def _billable(minutes: float, whole_minutes: bool) -> float:
    if minutes <= 0:
        return 0.0
    return float(math.ceil(minutes)) if whole_minutes else minutes


def cost_breakdown(
    *,
    duration_minutes: float,
    ai_minutes: float,
    connected: bool,
    tariff: Tariff | None = None,
) -> dict[str, float]:
    """Rupee cost of one call, split into the three legs.

    `ai_minutes` is the time the model was actually in the conversation, which the agent
    records separately from call duration precisely so this calculation is possible.
    """
    tariff = tariff or Tariff()

    if not connected and not tariff.charge_unanswered:
        return {"carrier": 0.0, "ivr": 0.0, "ai": 0.0, "total": 0.0}

    duration = max(0.0, float(duration_minutes or 0))
    ai = min(max(0.0, float(ai_minutes or 0)), duration)
    # Whatever was not spent with the model was spent in the menu.
    ivr = max(0.0, duration - ai)

    carrier = tariff.carrier_pkr_per_min * _billable(
        duration, tariff.carrier_bills_whole_minutes
    )
    ivr_cost = tariff.ivr_pkr_per_min * ivr
    ai_cost = tariff.ai_pkr_per_min * ai

    return {
        "carrier": round(carrier, 2),
        "ivr": round(ivr_cost, 2),
        "ai": round(ai_cost, 2),
        "total": round(carrier + ivr_cost + ai_cost, 2),
    }
